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

// Handle grocery list submission with SSE progress updates
router.post('/process', isAuthenticated, withKrogerService, async (req, res) => {
  const { groceryList } = req.body;
  
  if (!groceryList || !groceryList.trim()) {
    return res.json({ error: 'Please enter a grocery list' });
  }
  
  // Generate a unique process ID
  const processId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  // Store process ID in session
  req.session.currentProcessId = processId;
  
  // Return process ID immediately
  res.json({ processId });
  
  // Start async processing
  processGroceryListAsync(processId, groceryList, req.session, req.krogerService).catch(err => {
    console.error('Error in async processing:', err);
  });
});

// SSE endpoint for progress updates
router.get('/progress/:processId', isAuthenticated, (req, res) => {
  const { processId } = req.params;
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Store response object for this process
  if (!global.progressStreams) {
    global.progressStreams = new Map();
  }
  global.progressStreams.set(processId, res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', processId })}\n\n`);
  
  // Clean up on client disconnect
  req.on('close', () => {
    global.progressStreams.delete(processId);
    res.end();
  });
});

// Async processing function
async function processGroceryListAsync(processId, groceryList, session, krogerService) {
  const sendProgress = (data) => {
    if (global.progressStreams && global.progressStreams.has(processId)) {
      const stream = global.progressStreams.get(processId);
      stream.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };
  
  try {
    const llmService = new LLMService();
    
    // Estimate initial steps (will be refined after first LLM call)
    const estimatedItems = groceryList.split(/\n|,/).filter(line => line.trim()).length;
    const totalSteps = 2 + (estimatedItems * 3);
    
    sendProgress({
      type: 'progress',
      step: 0,
      totalSteps,
      message: 'Starting to process your grocery list...',
      estimatedItems
    });
    
    // Step 1: Process the grocery list with LLM
    sendProgress({
      type: 'progress',
      step: 1,
      totalSteps,
      message: 'Analyzing your grocery list...'
    });
    
    const processedItems = await llmService.processGroceryList(groceryList);
    
    if (!processedItems || processedItems.length === 0) {
      sendProgress({
        type: 'error',
        message: 'Failed to process grocery list. Please check the format and try again.'
      });
      return;
    }
    
    // Recalculate total steps based on actual item count
    const actualTotalSteps = 2 + (processedItems.length * 3);
    
    sendProgress({
      type: 'progress',
      step: 1,
      totalSteps: actualTotalSteps,
      message: `Found ${processedItems.length} items in your list`,
      actualItems: processedItems.length
    });
    
    // Step 2: Generate search queries for each item
    sendProgress({
      type: 'progress',
      step: 2,
      totalSteps: actualTotalSteps,
      message: 'Generating search queries...'
    });
    
    const searchQueries = await llmService.generateSearchQueries(processedItems);
    
    // Step 3: Search for products and select the best match for each item
    const results = [];
    let currentStep = 2;
    
    for (let i = 0; i < searchQueries.length; i++) {
      const queryItem = searchQueries[i];
      const { itemIndex, query } = queryItem;
      const groceryItem = processedItems[itemIndex];
      
      // Search for products
      currentStep++;
      sendProgress({
        type: 'progress',
        step: currentStep,
        totalSteps: actualTotalSteps,
        message: `Searching for "${groceryItem.name}"...`,
        currentItem: i + 1,
        totalItems: searchQueries.length
      });
      
      const searchResults = await krogerService.searchProducts(
        query,
        5,
        session.locationId
      );
      
      if (searchResults.length === 0) {
        results.push({
          item: groceryItem,
          status: 'not_found',
          message: `No products found for "${groceryItem.name}"`
        });
        currentStep += 2; // Skip select and add steps
        continue;
      }
      
      // Select the best product match
      currentStep++;
      sendProgress({
        type: 'progress',
        step: currentStep,
        totalSteps: actualTotalSteps,
        message: `Selecting best match for "${groceryItem.name}"...`,
        currentItem: i + 1,
        totalItems: searchQueries.length
      });
      
      const bestMatch = await llmService.selectBestProduct(groceryItem, searchResults);
      
      if (!bestMatch || !bestMatch.upc) {
        results.push({
          item: groceryItem,
          status: 'selection_failed',
          message: `Failed to select a product for "${groceryItem.name}"`
        });
        currentStep++; // Skip add step
        continue;
      }
      
      // Add the selected product to cart
      currentStep++;
      sendProgress({
        type: 'progress',
        step: currentStep,
        totalSteps: actualTotalSteps,
        message: `Adding "${groceryItem.name}" to cart...`,
        currentItem: i + 1,
        totalItems: searchQueries.length
      });
      
      try {
        const modality = session.modality || "DELIVERY";
        await krogerService.addToCart(bestMatch.upc, groceryItem.quantity, modality);
        
        const selectedProduct = searchResults.find(p => p.upc === bestMatch.upc);
        
        results.push({
          item: groceryItem,
          status: 'added_to_cart',
          product: selectedProduct,
          message: bestMatch.reason
        });
      } catch (error) {
        console.error(`Error adding ${groceryItem.name} to cart:`, error);
        results.push({
          item: groceryItem,
          status: 'cart_error',
          message: `Error adding "${groceryItem.name}" to cart: ${error.message}`
        });
      }
    }
    
    // Send completion message
    sendProgress({
      type: 'complete',
      results,
      message: 'Processing complete!'
    });
    
    // Clean up stream
    if (global.progressStreams && global.progressStreams.has(processId)) {
      const stream = global.progressStreams.get(processId);
      stream.end();
      global.progressStreams.delete(processId);
    }
  } catch (error) {
    console.error('Error processing grocery list:', error);
    sendProgress({
      type: 'error',
      message: `Error processing grocery list: ${error.message}`
    });
    
    // Clean up stream
    if (global.progressStreams && global.progressStreams.has(processId)) {
      const stream = global.progressStreams.get(processId);
      stream.end();
      global.progressStreams.delete(processId);
    }
  }
}

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