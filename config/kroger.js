/**
 * Kroger API Configuration
 * 
 * This file contains configuration and utility functions for interacting with the Kroger API.
 * Documentation: https://developer.kroger.com/reference
 */

const axios = require('axios');

// Base URLs
const BASE_URL = 'https://api.kroger.com/v1';
const AUTH_URL = 'https://api.kroger.com/v1/connect/oauth2';

// Endpoints
const ENDPOINTS = {
  authorize: `${AUTH_URL}/authorize`,
  token: `${AUTH_URL}/token`,
  productSearch: `${BASE_URL}/products`,
  cart: `${BASE_URL}/cart`,  // This is the base cart endpoint
  locations: `${BASE_URL}/locations`,
};

// Log the endpoints for debugging
console.log('Kroger API Endpoints:', ENDPOINTS);

// Scopes required for our application
const SCOPES = [
  'cart.basic:write',
  'product.compact',
  'profile.compact',
];

// Configuration object
const krogerConfig = {
  clientId: process.env.KROGER_CLIENT_ID,
  clientSecret: process.env.KROGER_CLIENT_SECRET,
  redirectUri: process.env.KROGER_REDIRECT_URI,
  baseUrl: BASE_URL,
  authUrl: AUTH_URL,
  endpoints: ENDPOINTS,
  scopes: SCOPES,
  
  // Generate authorization URL for OAuth flow
  getAuthorizationUrl() {
    const scopeString = this.scopes.join(' ');
    const url = new URL(this.endpoints.authorize);
    
    url.searchParams.append('client_id', this.clientId);
    url.searchParams.append('redirect_uri', this.redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', scopeString);
    
    return url.toString();
  },
  
  // Create axios instance with authorization header
  createAuthorizedClient(token) {
    if (!token) {
      console.error('WARNING: Creating authorized client with no token!');
    } else {
      console.log('Creating authorized client with token:', token.substring(0, 10) + '...');
    }
    
    // Log the endpoints being used
    console.log('Using Kroger API endpoints:', {
      cart: this.endpoints.cart,
      productSearch: this.endpoints.productSearch,
      locations: this.endpoints.locations
    });
    
    const client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });
    
    // Add request interceptor for logging
    client.interceptors.request.use(request => {
      console.log('Making request to:', request.baseURL + request.url);
      return request;
    });
    
    return client;
  }
};

module.exports = krogerConfig;