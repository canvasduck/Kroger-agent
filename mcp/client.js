const KrogerService = require('../services/krogerService');
const tokens = require('./tokens');

async function withClient(fn) {
  const token = await tokens.getAccessToken();
  const locationId = tokens.getDefaultLocationId();
  return fn(new KrogerService(token, locationId));
}

async function searchProducts({ query, limit = 5, locationId }) {
  return withClient((svc) => svc.searchProducts(
    query,
    limit,
    locationId || svc.locationId
  ));
}

async function addToCart({ upc, quantity = 1, modality = 'DELIVERY' }) {
  return withClient((svc) => svc.addToCart(upc, quantity, modality));
}

async function getLocations({ zipCode, radius = 10, limit = 5 }) {
  return withClient((svc) => svc.getLocations(zipCode, radius, limit));
}

module.exports = { searchProducts, addToCart, getLocations };
