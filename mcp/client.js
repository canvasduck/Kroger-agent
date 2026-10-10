/**
 * Thin Kroger API client for the MCP tools: compact results for an LLM, a record of UPCs that
 * real searches returned (cart adds must use one of them), and batched cart adds.
 */
const axios = require('axios');
const kroger = require('../config/kroger');
const tokens = require('./tokens');

const SEEN_TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_QUANTITY = 24;

function api(token) {
  return axios.create({
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    timeout: 20000,
  });
}

// Product search works with the customer token or, if the link lapsed, the app-level token.
async function searchToken() {
  try {
    return await tokens.getAccessToken();
  } catch {
    return tokens.getAppToken();
  }
}

function compactProduct(p) {
  const item = (p.items || [])[0] || {};
  const price = item.price || {};
  return {
    upc: p.upc,
    description: p.description,
    brand: p.brand || null,
    size: item.size || null,
    price: price.regular ?? null,
    promoPrice: price.promo && price.promo !== price.regular ? price.promo : null,
    stock: item.inventory?.stockLevel || null,
    pickup: item.fulfillment?.curbside ?? null,
    delivery: item.fulfillment?.delivery ?? null,
  };
}

function rememberUpcs(products) {
  const now = Date.now();
  tokens.updateState((s) => {
    const seen = s.seenUpcs || {};
    for (const [upc, v] of Object.entries(seen)) if (now - v.at > SEEN_TTL_MS) delete seen[upc];
    for (const p of products) if (p.upc) seen[p.upc] = { description: p.description, at: now };
    s.seenUpcs = seen;
  });
}

async function searchProducts({ query, limit = 5, locationId }) {
  const loc = locationId || tokens.getPrefs().locationId;
  if (!loc) throw new Error('No store selected yet. Use find_locations and set_preferences first.');
  const res = await api(await searchToken()).get(kroger.endpoints.productSearch, {
    params: { 'filter.term': query, 'filter.locationId': loc, 'filter.limit': Math.min(Math.max(limit, 1), 10) },
  });
  const products = (res.data.data || []).map(compactProduct);
  rememberUpcs(products);
  return { locationId: loc, query, results: products };
}

async function addToCart({ items, modality }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array');
  const seen = tokens.readState().seenUpcs || {};
  const mode = modality || tokens.getPrefs().modality;
  const payload = items.map(({ upc, quantity = 1 }) => {
    if (!seen[upc]) {
      throw new Error(`UPC ${upc} didn't come from a recent product search. Search first and use a returned UPC.`);
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
      throw new Error(`Quantity for ${upc} must be a whole number from 1 to ${MAX_QUANTITY}.`);
    }
    return { upc, quantity: qty, modality: mode };
  });
  const send = async (token) => api(token).put(`${kroger.endpoints.cart}/add`, { items: payload });
  try {
    await send(await tokens.getAccessToken());
  } catch (err) {
    if (err.response?.status !== 401) throw err;
    // Access token was rejected early: force one refresh and retry once.
    tokens.updateState((s) => { s.expiresAt = 0; });
    await send(await tokens.getAccessToken());
  }
  return {
    ok: true,
    modality: mode,
    added: payload.map((i) => ({ upc: i.upc, quantity: i.quantity, description: seen[i.upc].description })),
    note: "Kroger's API can't read the cart back or check out; review and check out in the Kroger app.",
  };
}

async function findLocations({ zipCode, radius = 10, limit = 5 }) {
  const res = await api(await searchToken()).get(kroger.endpoints.locations, {
    params: { 'filter.zipCode.near': zipCode, 'filter.radiusInMiles': radius, 'filter.limit': limit },
  });
  return (res.data.data || []).map((l) => ({
    locationId: l.locationId,
    name: l.name,
    chain: l.chain,
    address: l.address ? `${l.address.addressLine1}, ${l.address.city}, ${l.address.state} ${l.address.zipCode}` : null,
  }));
}

module.exports = { searchProducts, addToCart, findLocations };
