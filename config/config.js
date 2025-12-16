/**
 * Main Configuration
 * 
 * This file exports all configuration objects used in the application.
 */

const krogerConfig = require('./kroger');

// OpenRouter configuration
const openrouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-haiku-4.5', // OpenRouter model naming for text processing
  visionModel: process.env.OPENROUTER_VISION_MODEL || 'anthropic/claude-sonnet-4.5', // Vision-capable model for image processing
  temperature: 0.7,
  maxTokens: 500,
  appName: process.env.OPENROUTER_APP_NAME || 'kroger-grocery-assistant',
  siteUrl: process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
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
  openrouter: openrouterConfig,
  app: appConfig,
};