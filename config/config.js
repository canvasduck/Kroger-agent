/**
 * Main Configuration
 * 
 * This file exports all configuration objects used in the application.
 */

const krogerConfig = require('./kroger');

// Anthropic/Claude configuration
const anthropicConfig = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus-20240229', // Claude's most capable model
  temperature: 0.7,
  maxTokens: 500, // Used as max_tokens in API calls
};

// Application configuration
const appConfig = {
  environment: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'kroger-grocery-assistant-secret',
};

module.exports = {
  kroger: krogerConfig,
  anthropic: anthropicConfig,
  app: appConfig,
};