const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const axios = require('axios');
const kroger = require('../config/kroger');

const TOKEN_DIR = process.env.KROGER_MCP_STATE_DIR
  || path.join(os.homedir(), '.kroger-agent');
const TOKEN_PATH = path.join(TOKEN_DIR, 'tokens.json');

const DEFAULT_CALLBACK_PORT = Number(process.env.KROGER_CALLBACK_PORT || 8787);
const DEFAULT_REDIRECT_URI = `http://localhost:${DEFAULT_CALLBACK_PORT}/callback`;

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
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function assertClientCreds() {
  if (!kroger.clientId || !kroger.clientSecret) {
    throw new Error('KROGER_CLIENT_ID and KROGER_CLIENT_SECRET must be set');
  }
}

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(
    `${kroger.clientId}:${kroger.clientSecret}`
  ).toString('base64');
}

async function exchangeCode(code) {
  const res = await axios.post(
    kroger.endpoints.token,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': basicAuthHeader(),
      },
    }
  );
  return res.data;
}

async function refresh(refreshToken) {
  const res = await axios.post(
    kroger.endpoints.token,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': basicAuthHeader(),
      },
    }
  );
  return res.data;
}

function persistTokenResponse(data) {
  const state = readState();
  state.accessToken = data.access_token;
  state.refreshToken = data.refresh_token || state.refreshToken;
  state.expiresAt = Date.now() + data.expires_in * 1000;
  state.scope = data.scope;
  writeState(state);
  return state;
}

function buildAuthUrl() {
  assertClientCreds();
  const url = new URL(kroger.endpoints.authorize);
  url.searchParams.set('client_id', kroger.clientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', kroger.scopes.join(' '));
  return url.toString();
}

// Start a one-shot loopback HTTP server and return a promise that resolves
// when Kroger redirects back with ?code=... Rejects on timeout or error.
function awaitCallback({ timeoutMs = 5 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri());
      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
          .end(`<h1>Kroger auth failed</h1><p>${err}</p>`);
        server.close();
        reject(new Error(`OAuth error: ${err}`));
        return;
      }
      if (!code) {
        res.writeHead(400).end('Missing code');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(
        '<h1>Kroger connected.</h1><p>You can close this tab.</p>'
      );
      server.close();
      resolve(code);
    });
    server.on('error', reject);
    server.listen(DEFAULT_CALLBACK_PORT, '127.0.0.1');
    setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for Kroger OAuth callback'));
    }, timeoutMs).unref();
  });
}

// Runs the full loopback flow. Returns the auth URL synchronously so the caller
// can show it to the user; the returned `done` promise resolves once tokens are
// saved.
function beginLogin() {
  assertClientCreds();
  const authUrl = buildAuthUrl();
  const done = (async () => {
    const code = await awaitCallback();
    const tokens = await exchangeCode(code);
    persistTokenResponse(tokens);
  })();
  // Swallow unhandled rejection; caller may or may not await.
  done.catch(() => {});
  return { authUrl, done };
}

async function getAccessToken() {
  const state = readState();
  if (!state.accessToken || !state.refreshToken) {
    const err = new Error('Not authenticated. Call the kroger_login tool first.');
    err.code = 'NOT_AUTHENTICATED';
    throw err;
  }
  if (Date.now() < state.expiresAt - 30_000) {
    return state.accessToken;
  }
  const tokens = await refresh(state.refreshToken);
  const updated = persistTokenResponse(tokens);
  return updated.accessToken;
}

function getDefaultLocationId() {
  return readState().locationId || null;
}

function setDefaultLocationId(locationId) {
  const state = readState();
  state.locationId = locationId;
  writeState(state);
}

function authStatus() {
  const state = readState();
  if (!state.accessToken) return { authenticated: false };
  return {
    authenticated: true,
    expiresAt: new Date(state.expiresAt).toISOString(),
    scope: state.scope,
    locationId: state.locationId || null,
  };
}

module.exports = {
  beginLogin,
  getAccessToken,
  getDefaultLocationId,
  setDefaultLocationId,
  authStatus,
  TOKEN_PATH,
};
