/**
 * Authentication Routes
 * 
 * Handles Kroger OAuth authentication flow.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { kroger } = require('../config/config');

// Render login page
router.get('/login', (req, res) => {
  res.render('login');
});

// Initiate Kroger OAuth flow
router.get('/kroger', (req, res) => {
  const authUrl = kroger.getAuthorizationUrl();
  res.redirect(authUrl);
});

// Handle OAuth callback from Kroger
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).render('error', { 
      message: 'Authorization code not provided' 
    });
  }
  
  try {
    console.log('Exchanging authorization code for access token');
    console.log('Using redirect URI:', kroger.redirectUri);
    
    // Exchange authorization code for access token
    const tokenResponse = await axios({
      method: 'post',
      url: kroger.endpoints.token,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${kroger.clientId}:${kroger.clientSecret}`
        ).toString('base64')}`
      },
      data: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: kroger.redirectUri,
      })
    });
    
    console.log('Token exchange successful');
    console.log('Token response:', {
      access_token_length: tokenResponse.data.access_token?.length || 0,
      refresh_token_length: tokenResponse.data.refresh_token?.length || 0,
      expires_in: tokenResponse.data.expires_in,
      token_type: tokenResponse.data.token_type,
      scope: tokenResponse.data.scope
    });
    
    // Store tokens in session
    req.session.krogerToken = tokenResponse.data.access_token;
    req.session.krogerRefreshToken = tokenResponse.data.refresh_token;
    req.session.krogerTokenExpiry = Date.now() + (tokenResponse.data.expires_in * 1000);
    
    console.log('Tokens stored in session');
    console.log('Token expiry set to:', new Date(req.session.krogerTokenExpiry).toISOString());
    console.log('Granted scopes:', tokenResponse.data.scope);
    
    // Redirect to grocery list page
    res.redirect('/groceries/list');
  } catch (error) {
    console.error('Error exchanging code for token:', error.response?.data || error.message);
    res.status(500).render('error', { 
      message: 'Failed to authenticate with Kroger' 
    });
  }
});

// Refresh Kroger access token
router.get('/refresh', async (req, res) => {
  const refreshToken = req.session.krogerRefreshToken;
  
  if (!refreshToken) {
    return res.status(401).redirect('/auth/login');
  }
  
  try {
    console.log('Refreshing access token');
    console.log('Refresh token length:', refreshToken.length);
    
    const tokenResponse = await axios({
      method: 'post',
      url: kroger.endpoints.token,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${kroger.clientId}:${kroger.clientSecret}`
        ).toString('base64')}`
      },
      data: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
    });
    
    console.log('Token refresh successful');
    console.log('Token response:', {
      access_token_length: tokenResponse.data.access_token?.length || 0,
      refresh_token_length: tokenResponse.data.refresh_token?.length || 0,
      expires_in: tokenResponse.data.expires_in,
      token_type: tokenResponse.data.token_type,
      scope: tokenResponse.data.scope
    });
    
    // Update tokens in session
    req.session.krogerToken = tokenResponse.data.access_token;
    req.session.krogerRefreshToken = tokenResponse.data.refresh_token;
    req.session.krogerTokenExpiry = Date.now() + (tokenResponse.data.expires_in * 1000);
    
    console.log('Updated tokens stored in session');
    console.log('New token expiry set to:', new Date(req.session.krogerTokenExpiry).toISOString());
    console.log('Granted scopes:', tokenResponse.data.scope);
    
    const redirectUrl = req.query.redirect || '/groceries/list';
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error refreshing token:', error.response?.data || error.message);
    req.session.destroy();
    res.status(401).redirect('/auth/login');
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

module.exports = router;