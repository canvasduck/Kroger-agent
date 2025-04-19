/**
 * Groceries Routes
 * 
 * Handles grocery list input, processing, and cart management.
 */

const express = require('express');
const router = express.Router();
const KrogerService = require('../services/krogerService');
const LLMService = require('../services/llmService');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  console.log('Checking authentication status');
  
  if (!req.session.krogerToken) {
    console.log('No Kroger token found in session, redirecting to login');
    return res.redirect('/auth/login');
  }
  
  // Check if token is expired
  const now = Date.now();
  const expiry = req.session.krogerTokenExpiry;
  const timeLeft = expiry ? Math.floor((expiry - now) / 1000) : 'unknown';
  
  console.log(`Token expiry check: Current time: ${now}, Token expires: ${expiry}, Seconds left: ${timeLeft}`);
  
  if (expiry && expiry < now) {
    console.log('Token is expired, redirecting to refresh');
    return res.redirect(`/auth/refresh?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  
  console.log('Authentication successful, token is valid');
  next();
};

// Middleware to initialize Kroger service
const withKrogerService = (req, res, next) => {
  console.log('Initializing Kroger service');
  console.log('Session data:', {
    hasToken: !!req.session.krogerToken,
    hasRefreshToken: !!req.session.krogerRefreshToken,
    locationId: req.session.locationId,
    tokenExpiryTimestamp: req.session.krogerTokenExpiry
  });
  
  req.krogerService = new KrogerService(
    req.session.krogerToken,
    req.session.locationId
  );
  next();
};

// Render grocery list input page
router.get('/list', isAuthenticated, withKrogerService, async (req, res) => {
  try {
    // If no location is selected, redirect to location selection
    // The client-side code will check localStorage for a stored location ID
    if (!req.session.locationId) {
      console.log('No location ID in session, redirecting to location selection');
      return res.redirect('/groceries/locations');
    }
    
    // Initialize empty cart object
    let cart = { items: [] };
    
    res.render('groceryList', { 
      cart: cart,
      processingStatus: req.session.processingStatus || null,
      processingResults: req.session.processingResults || null
    });
    
    // Clear processing status after displaying
    delete req.session.processingStatus;
    delete req.session.processingResults;
  } catch (error) {
    console.error('Error rendering grocery list page:', error);
    res.status(500).render('error', { message: 'Failed to load grocery list page' });
  }
});

// Handle grocery list submission
router.post('/process', isAuthenticated, withKrogerService, async (req, res) => {
  const { groceryList } = req.body;
  
  if (!groceryList || !groceryList.trim()) {
    req.session.processingStatus = 'error';
    req.session.processingResults = 'Please enter a grocery list';
    return res.redirect('/groceries/list');
  }
  
  try {
    const llmService = new LLMService();
    
    // Step 1: Process the grocery list with LLM
    const processedItems = await llmService.processGroceryList(groceryList);
    
    // Step 2: Generate search queries for each item
    const searchQueries = await llmService.generateSearchQueries(processedItems);
    
    // Step 3: Search for products and select the best match for each item
    const results = [];
    
    for (const queryItem of searchQueries) {
      const { itemIndex, query } = queryItem;
      const groceryItem = processedItems[itemIndex];
      
      // Search for products
      const searchResults = await req.krogerService.searchProducts(
        query, 
        5, 
        req.session.locationId
      );
      
      if (searchResults.length === 0) {
        results.push({
          item: groceryItem,
          status: 'not_found',
          message: `No products found for "${groceryItem.name}"`
        });
        continue;
      }
      
      // Select the best product match
      const bestMatch = await llmService.selectBestProduct(groceryItem, searchResults);
      
      if (!bestMatch || !bestMatch.upc) {
        results.push({
          item: groceryItem,
          status: 'selection_failed',
          message: `Failed to select a product for "${groceryItem.name}"`
        });
        continue;
      }
      
      // Add the selected product to cart
      try {
        console.log(`Attempting to add ${groceryItem.name} (UPC: ${bestMatch.upc}) to cart with quantity ${groceryItem.quantity}`);
        
        // Verify token before cart operation
        console.log('Token verification before cart operation:');
        console.log('- Token exists:', !!req.session.krogerToken);
        console.log('- Token expiry:', new Date(req.session.krogerTokenExpiry).toISOString());
        console.log('- Current time:', new Date().toISOString());
        
        // Get modality from session or default to "DELIVERY"
        const modality = req.session.modality || "DELIVERY";
        console.log(`Using shopping modality: ${modality}`);
        
        await req.krogerService.addToCart(bestMatch.upc, groceryItem.quantity, modality);
        
        // Find the product details from search results
        const selectedProduct = searchResults.find(p => p.upc === bestMatch.upc);
        
        console.log(`Successfully added ${groceryItem.name} to cart`);
        
        results.push({
          item: groceryItem,
          status: 'added_to_cart',
          product: selectedProduct,
          message: bestMatch.reason
        });
      } catch (error) {
        console.error(`Error adding ${groceryItem.name} to cart:`, error);
        console.error('Error details:', error.response?.data || 'No response data');
        results.push({
          item: groceryItem,
          status: 'cart_error',
          message: `Error adding "${groceryItem.name}" to cart: ${error.message}`
        });
      }
    }
    
    // Store results in session for display
    req.session.processingStatus = 'success';
    req.session.processingResults = results;
    
    res.redirect('/groceries/list');
  } catch (error) {
    console.error('Error processing grocery list:', error);
    req.session.processingStatus = 'error';
    req.session.processingResults = `Error processing grocery list: ${error.message}`;
    res.redirect('/groceries/list');
  }
});

// Render location selection page
router.get('/locations', isAuthenticated, withKrogerService, (req, res) => {
  res.render('locations');
});

// Handle location search
router.post('/locations/search', isAuthenticated, withKrogerService, async (req, res) => {
  const { zipCode } = req.body || req.query;
  
  if (!zipCode || !zipCode.match(/^\d{5}$/)) {
    return res.status(400).render('locations', {
      error: 'Please enter a valid 5-digit ZIP code'
    });
  }
  
  try {
    const locations = await req.krogerService.getLocations(zipCode);
    
    if (locations.length === 0) {
      return res.render('locations', {
        error: 'No Kroger stores found near this ZIP code',
        zipCode
      });
    }
    
    res.render('locations', { locations, zipCode });
  } catch (error) {
    console.error('Error searching locations:', error);
    res.status(500).render('locations', {
      error: 'Failed to search for store locations',
      zipCode
    });
  }
});

// Handle location search via AJAX (for config modal)
router.get('/locations/search', isAuthenticated, withKrogerService, async (req, res) => {
  // Reuse the same handler as the POST endpoint
  return router.post('/locations/search')(req, res);
});

// Handle location selection
router.post('/locations/select', isAuthenticated, (req, res) => {
  const { locationId } = req.body;
  
  if (!locationId) {
    return res.status(400).render('locations', {
      error: 'Please select a store location'
    });
  }
  
  // Store location ID in session
  req.session.locationId = locationId;
  console.log('Location ID saved to session:', locationId);
  
  res.redirect('/groceries/list');
});

// Check for stored location
router.get('/check-stored-location', isAuthenticated, (req, res) => {
  // This endpoint can be used by client-side code to check if a location is already stored
  // and set it in the session if needed
  const { locationId } = req.query;
  
  if (locationId) {
    req.session.locationId = locationId;
    console.log('Location ID from localStorage set in session:', locationId);
    return res.json({ success: true });
  }
  
  return res.json({ success: false });
});


// Update shopping modality
router.get('/update-modality', isAuthenticated, (req, res) => {
  const { modality } = req.query;
  
  if (modality && (modality === 'DELIVERY' || modality === 'PICKUP')) {
    req.session.modality = modality;
    console.log('Shopping modality set in session:', modality);
    return res.json({ success: true });
  }
  
  return res.json({ success: false });
});

module.exports = router;