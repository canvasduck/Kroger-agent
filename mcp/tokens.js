/**
 * Kroger OAuth token store for the MCP server.
 *
 * - Authorization-code login, completed either by a loopback redirect to this machine or by
 *   pasting the final redirect URL back (works when the browser is on another device).
 * - Kroger refresh tokens are single-use and rotate on every refresh, so refreshes run under a
 *   cross-process lock and the state file is written atomically. Losing a rotated token means a
 *   fresh browser login (with Kroger's 2FA).
 * - Product search can use an app-level client-credentials token, so it keeps working even when
 *   the customer link has lapsed.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const axios = require('axios');
const kroger = require('../config/kroger');

const STATE_DIR = process.env.KROGER_MCP_STATE_DIR || path.join(os.homedir(), '.kroger-agent');
const TOKEN_PATH = path.join(STATE_DIR, 'tokens.json');
const LOCK_PATH = path.join(STATE_DIR, 'refresh.lock');

const CALLBACK_PORT = Number(process.env.KROGER_CALLBACK_PORT || 8787);
const DEFAULT_REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const REFRESH_TOKEN_LIFETIME_MS = 182 * 24 * 3600 * 1000; // Kroger documents ~6 months
const PENDING_LOGIN_TTL_MS = 15 * 60 * 1000;

function redirectUri() {
  return process.env.KROGER_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${TOKEN_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, TOKEN_PATH); // atomic replace: a crash never leaves a half-written token file
}

function updateState(mutator) {
  const state = readState();
  mutator(state);
  writeState(state);
  return state;
}

function assertClientCreds() {
  if (!kroger.clientId || !kroger.clientSecret) {
    throw new Error('KROGER_CLIENT_ID and KROGER_CLIENT_SECRET must be set');
  }
}

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${kroger.clientId}:${kroger.clientSecret}`).toString('base64');
}

async function tokenRequest(params) {
  const res = await axios.post(kroger.endpoints.token, new URLSearchParams(params), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuthHeader() },
    timeout: 20000,
  });
  return res.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cross-process mutex via atomic mkdir; a lock older than 60s is treated as stale.
async function withRefreshLock(fn) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      fs.mkdirSync(LOCK_PATH);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - fs.statSync(LOCK_PATH).mtimeMs > 60000) fs.rmdirSync(LOCK_PATH);
      } catch { /* lock vanished between calls */ }
      if (Date.now() > deadline) throw new Error('Timed out waiting for the Kroger token refresh lock');
      await sleep(150);
    }
  }
  try {
    return await fn();
  } finally {
    try { fs.rmdirSync(LOCK_PATH); } catch { /* already released */ }
  }
}

function persistTokenResponse(state, data, { newGrant = false } = {}) {
  state.accessToken = data.access_token;
  state.expiresAt = Date.now() + data.expires_in * 1000;
  state.scope = data.scope || state.scope;
  if (data.refresh_token) {
    state.refreshToken = data.refresh_token;
    // Each refresh issues a new token with a new lifetime; grantedAt tracks the human login.
    state.refreshIssuedAt = Date.now();
  }
  if (newGrant) state.grantedAt = Date.now();
  delete state.lastAuthError;
}

function buildAuthUrl(stateParam) {
  assertClientCreds();
  const url = new URL(kroger.endpoints.authorize);
  url.searchParams.set('client_id', kroger.clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', kroger.scopes.join(' '));
  url.searchParams.set('state', stateParam);
  return url.toString();
}

async function finishLogin(code, returnedState) {
  const pending = readState().pendingLogin;
  if (!pending || Date.now() - pending.createdAt > PENDING_LOGIN_TTL_MS) {
    throw new Error('No login in progress (or it expired). Start a new login first.');
  }
  if (!returnedState || returnedState !== pending.state) {
    throw new Error('OAuth state mismatch: that URL is from a different or older login attempt.');
  }
  const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  return withRefreshLock(async () => updateState((s) => {
    persistTokenResponse(s, data, { newGrant: true });
    delete s.pendingLogin;
  }));
}

let loopbackServer = null;

// Optional: catch Kroger's redirect on this machine (only useful when the browser is local).
function startLoopback() {
  if (loopbackServer || process.env.KROGER_DISABLE_LOOPBACK) return;
  loopbackServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, redirectUri());
    if (url.pathname !== new URL(redirectUri()).pathname) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error'));
      await finishLogin(url.searchParams.get('code'), url.searchParams.get('state'));
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Kroger connected.</h1><p>You can close this tab.</p>');
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Kroger login failed: ${err.message}`);
    }
    loopbackServer.close();
    loopbackServer = null;
  });
  loopbackServer.on('error', () => { loopbackServer = null; }); // port busy: the paste flow still works
  loopbackServer.listen(CALLBACK_PORT, '127.0.0.1');
  setTimeout(() => { if (loopbackServer) { loopbackServer.close(); loopbackServer = null; } },
    PENDING_LOGIN_TTL_MS).unref();
}

function beginLogin() {
  assertClientCreds();
  const stateParam = crypto.randomBytes(16).toString('hex');
  updateState((s) => { s.pendingLogin = { state: stateParam, createdAt: Date.now() }; });
  startLoopback();
  return { authUrl: buildAuthUrl(stateParam), redirectUri: redirectUri() };
}

async function completeLogin(redirectUrl) {
  let url;
  try {
    url = new URL(String(redirectUrl).trim());
  } catch {
    throw new Error('Expected the full URL from the browser address bar after approving Kroger access.');
  }
  if (url.searchParams.get('error')) throw new Error(`Kroger returned an error: ${url.searchParams.get('error')}`);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('That URL has no ?code= parameter.');
  const s = await finishLogin(code, url.searchParams.get('state'));
  return { ok: true, scope: s.scope };
}

async function getAccessToken() {
  const state = readState();
  if (!state.refreshToken) {
    const err = new Error('Kroger is not linked yet. A parent needs to run the Kroger login once.');
    err.code = 'NOT_AUTHENTICATED';
    throw err;
  }
  if (state.accessToken && Date.now() < state.expiresAt - 60000) return state.accessToken;

  return withRefreshLock(async () => {
    const fresh = readState(); // another process may have refreshed while we waited for the lock
    if (fresh.accessToken && Date.now() < fresh.expiresAt - 60000) return fresh.accessToken;
    try {
      const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: fresh.refreshToken });
      return updateState((s) => persistTokenResponse(s, data)).accessToken;
    } catch (err) {
      const status = err.response?.status;
      if (status === 400 || status === 401) {
        updateState((s) => { s.lastAuthError = { at: Date.now(), status }; });
        const e = new Error('Kroger link expired or was revoked. A parent needs to run the Kroger login again.');
        e.code = 'RELOGIN_REQUIRED';
        throw e;
      }
      throw err; // network/5xx: keep the refresh token and try again later
    }
  });
}

let appToken = null;
async function getAppToken() {
  if (appToken && Date.now() < appToken.expiresAt - 60000) return appToken.token;
  assertClientCreds();
  const data = await tokenRequest({ grant_type: 'client_credentials', scope: 'product.compact' });
  appToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return appToken.token;
}

function getPrefs() {
  const s = readState();
  return { locationId: s.locationId || null, locationName: s.locationName || null, modality: s.modality || 'PICKUP' };
}

function setPrefs({ locationId, locationName, modality }) {
  return updateState((s) => {
    if (locationId !== undefined) s.locationId = locationId;
    if (locationName !== undefined) s.locationName = locationName;
    if (modality !== undefined) s.modality = modality;
  });
}

function authStatus() {
  const s = readState();
  const out = { linked: Boolean(s.refreshToken), ...getPrefs() };
  if (s.grantedAt) out.linkedSince = new Date(s.grantedAt).toISOString();
  // Kroger doesn't document whether a rotated refresh token gets a fresh lifetime, so warn
  // conservatively from the last human login; a real expiry still surfaces as RELOGIN_REQUIRED.
  if (s.grantedAt) {
    const expires = s.grantedAt + REFRESH_TOKEN_LIFETIME_MS;
    out.relinkSuggestedBy = new Date(expires).toISOString();
    out.daysUntilRelink = Math.floor((expires - Date.now()) / 86400000);
  }
  if (s.lastAuthError) out.lastAuthError = { at: new Date(s.lastAuthError.at).toISOString(), status: s.lastAuthError.status };
  if (s.pendingLogin) out.loginInProgress = true;
  return out;
}

module.exports = {
  beginLogin, completeLogin, getAccessToken, getAppToken, getPrefs, setPrefs, authStatus,
  readState, updateState, TOKEN_PATH,
};
