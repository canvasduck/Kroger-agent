/**
 * Kroger Service
 * 
 * Provides functions for interacting with the Kroger API.
 */

const axios = require('axios');
const { kroger } = require('../config/config');

class KrogerService {
  constructor(accessToken, locationId = null) {
    console.log('Initializing KrogerService with token:', accessToken ? 'Token provided' : 'No token provided');
    this.client = kroger.createAuthorizedClient(accessToken);
    this.locationId = locationId;
    console.log('Using location ID:', locationId);
  }

  /**
   * Search for products based on a query string
   * @param {string} query - The search query
   * @param {number} limit - Maximum number of results to return
   * @param {string} locationId - Kroger store location ID
   * @returns {Promise<Array>} - Array of product objects
   */
  async searchProducts(query, limit = 5, locationId = this.locationId) {
    if (!locationId) {
      throw new Error('Location ID is required for product search');
    }

    try {
      const response = await this.client.get(kroger.endpoints.productSearch, {
        params: {
          'filter.term': query,
          'filter.locationId': locationId,
          'filter.limit': limit,
        }
      });

      return response.data.data || [];
    } catch (error) {
      console.error('Error searching products:', error.response?.data || error.message);
      throw error;
    }
  }


  /**
   * Add an item to the user's cart
   * @param {string} upc - Product UPC
   * @param {number} quantity - Quantity to add
   * @param {string} modality - Shopping modality ("DELIVERY" or "PICKUP")
   * @returns {Promise<Object>} - Updated cart object
   */
  async addToCart(upc, quantity = 1, modality = "DELIVERY") {
    try {
      console.log(`Adding item to cart - UPC: ${upc}, Quantity: ${quantity}, Modality: ${modality}`);
      
      // IMPORTANT: Updated endpoint to match Kroger API documentation
      // Changed from ${kroger.endpoints.cart}/active/items to ${kroger.endpoints.cart}/add
      const endpoint = `${kroger.endpoints.cart}/add`;
      console.log('Cart endpoint:', endpoint);
      
      // Log the request payload
      // Use the provided modality or default to "DELIVERY"
      const payload = {
        items: [
          {
            upc,
            quantity,
            modality: modality  // Use the provided modality parameter
          }
        ]
      };
      console.log('Request payload:', JSON.stringify(payload));
      
      // Log the authorization header (partially masked for security)
      const authHeader = this.client.defaults.headers.common['Authorization'];
      console.log('Authorization header:', authHeader ? `${authHeader.substring(0, 15)}...` : 'Not set');
      
      const response = await this.client.put(endpoint, payload);
      console.log('Add to cart response status:', response.status);
      return response.data;
    } catch (error) {
      console.error('Error adding to cart:', error.response?.data || error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Get nearby Kroger store locations
   * @param {string} zipCode - ZIP code to search near
   * @param {number} radius - Search radius in miles
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} - Array of location objects
   */
  async getLocations(zipCode, radius = 10, limit = 5) {
    try {
      const response = await this.client.get(kroger.endpoints.locations, {
        params: {
          'filter.zipCode.near': zipCode,
          'filter.radiusInMiles': radius,
          'filter.limit': limit,
        }
      });
      return response.data.data || [];
    } catch (error) {
      console.error('Error getting locations:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = KrogerService;