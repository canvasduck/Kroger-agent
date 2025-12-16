/**
 * LLM Service
 *
 * Provides functions for interacting with OpenRouter API to process grocery lists.
 */

const OpenAI = require('openai');
const { openrouter: openrouterConfig } = require('../config/config');

class LLMService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: openrouterConfig.apiKey,
      baseURL: openrouterConfig.baseURL,
      defaultHeaders: {
        'HTTP-Referer': openrouterConfig.siteUrl,
        'X-Title': openrouterConfig.appName,
      },
    });
  }

  /**
   * Process a grocery list using the LLM to standardize and categorize items
   * @param {string} groceryList - Raw grocery list text from user
   * @returns {Promise<Array>} - Array of processed grocery items
   */
  async processGroceryList(groceryList) {
    try {
      // Add debugging to see what parameters are being sent
      console.log('Sending request to OpenRouter API with parameters:', {
        model: openrouterConfig.model,
        max_tokens: openrouterConfig.maxTokens,
        temperature: openrouterConfig.temperature
      });
      
      const response = await this.openai.chat.completions.create({
        model: openrouterConfig.model,
        max_tokens: openrouterConfig.maxTokens,
        temperature: openrouterConfig.temperature,
        messages: [
          {
            role: 'system',
            content: `You are a helpful grocery shopping assistant. Your task is to analyze a grocery list and convert it into a structured format.
            For each item in the list:
            1. Identify the product name in a standardized format (e.g., "milk" becomes "Milk")
            2. Determine the likely quantity if specified or default to 1
            3. Identify any specific preferences (brand, size, type, etc.)
            
            Return the results as a JSON array of objects with the following properties:
            - name: The standardized product name
            - quantity: The quantity as a number
            - preferences: A string describing any specific preferences
            
            IMPORTANT: Format your response as valid JSON without any explanations or text outside the JSON structure.
            
            Example output:
            [
              {"name": "Milk", "quantity": 1, "preferences": "Organic, 2%"},
              {"name": "Bread", "quantity": 2, "preferences": "Whole wheat, sliced"},
              {"name": "Apples", "quantity": 6, "preferences": "Honeycrisp, organic"}
            ]`
          },
          {
            role: 'user',
            content: groceryList
          }
        ]
      });

      console.log('Received response from OpenRouter API:', response.choices[0].message.content);
      
      try {
        const result = JSON.parse(response.choices[0].message.content);
        return Array.isArray(result) ? result : [];
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        console.log('Raw response content:', response.choices[0].message.content);
        return [];
      }
    } catch (error) {
      console.error('Error processing grocery list with LLM:', error);
      // Log more detailed error information
      if (error.response) {
        console.error('API Error Response:', {
          status: error.status,
          message: error.message,
          type: error.type,
          body: error.response
        });
      }
      throw error;
    }
  }

  /**
   * Generate search queries for Kroger product search based on grocery items
   * @param {Array} groceryItems - Processed grocery items
   * @returns {Promise<Array>} - Array of search queries
   */
  async generateSearchQueries(groceryItems) {
    try {
      const itemsJson = JSON.stringify(groceryItems);
      
      const response = await this.openai.chat.completions.create({
        model: openrouterConfig.model,
        max_tokens: openrouterConfig.maxTokens,
        temperature: 0.3, // Lower temperature for more consistent results
        messages: [
          {
            role: 'system',
            content: `You are a helpful grocery shopping assistant. Your task is to convert grocery items into effective search queries for the Kroger API.
            Create search queries that are likely to return relevant results from a grocery store product search API.
            
            For each item, create a search query that:
            1. Includes the essential product name
            2. Incorporates important preferences that would affect search results
            3. Excludes quantity information
            4. Is concise and specific
            
            Return the results as a JSON array of objects with the following properties:
            - itemIndex: The index of the original item in the input array
            - query: The optimized search query string
            
            IMPORTANT: Format your response as valid JSON without any explanations or text outside the JSON structure.
            
            Example output:
            [
              {"itemIndex": 0, "query": "organic 2% milk"},
              {"itemIndex": 1, "query": "whole wheat sliced bread"},
              {"itemIndex": 2, "query": "honeycrisp organic apples"}
            ]`
          },
          {
            role: 'user',
            content: itemsJson
          }
        ]
      });

      try {
        const result = JSON.parse(response.choices[0].message.content);
        return Array.isArray(result) ? result : [];
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        console.log('Raw response content:', response.choices[0].message.content);
        return [];
      }
    } catch (error) {
      console.error('Error generating search queries with LLM:', error);
      // Log more detailed error information
      if (error.response) {
        console.error('API Error Response:', {
          status: error.status,
          message: error.message,
          type: error.type,
          body: error.response
        });
      }
      throw error;
    }
  }

  /**
   * Select the best product match from search results
   * @param {Object} groceryItem - The original grocery item
   * @param {Array} searchResults - Array of product search results from Kroger API
   * @returns {Promise<Object>} - The best matching product
   */
  async selectBestProduct(groceryItem, searchResults) {
    if (!searchResults.length) {
      return null;
    }
    
    try {
      const itemJson = JSON.stringify(groceryItem);
      const resultsJson = JSON.stringify(searchResults.map(product => ({
        upc: product.upc,
        description: product.description,
        brand: product.brand,
        size: product.items?.[0]?.size || '',
        price: product.items?.[0]?.price?.regular || 0,
      })));
      
      const response = await this.openai.chat.completions.create({
        model: openrouterConfig.model,
        max_tokens: openrouterConfig.maxTokens,
        temperature: 0.3, // Lower temperature for more consistent results
        messages: [
          {
            role: 'system',
            content: `You are a helpful grocery shopping assistant. Your task is to select the best product match from search results based on a user's grocery item request.
            
            Analyze the grocery item and the search results, then select the product that best matches the user's preferences.
            Consider factors like:
            1. Product name match
            2. Lowest price per volume/weight
            3. Brand preferences (if specified)
            4. Size/quantity preferences (if specified)
            5. Lowest absolute price
            6. Other specific preferences
            
            Return your selection as a JSON object with the following properties:
            - upc: The UPC of the selected product
            - reason: A brief explanation of why this product was selected
            
            IMPORTANT: Format your response as valid JSON without any explanations or text outside the JSON structure.
            
            Example output:
            {
              "upc": "0001111042195",
              "reason": "Selected organic 2% milk that matches the brand preference"
            }`
          },
          {
            role: 'user',
            content: `Grocery item: ${itemJson}\n\nSearch results: ${resultsJson}`
          }
        ]
      });

      try {
        return JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        console.log('Raw response content:', response.choices[0].message.content);
        return null;
      }
    } catch (error) {
      console.error('Error selecting best product with LLM:', error);
      // Log more detailed error information
      if (error.response) {
        console.error('API Error Response:', {
          status: error.status,
          message: error.message,
          type: error.type,
          body: error.response
        });
      }
      throw error;
    }
  }
}

module.exports = LLMService;