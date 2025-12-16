# Kroger Grocery Assistant

A Node.js server-side application that utilizes Kroger's API and an LLM agent to help users shop for groceries.

## Features

- **Kroger Authentication**: Users can log in with their Kroger credentials
- **Store Selection**: Users can select their preferred Kroger store location
- **Grocery List Input**: Users can input a list of grocery items
- **AI-Powered Shopping**: An LLM agent processes the grocery list, searches for products, and adds them to the cart
- **Cart Management**: View and manage your Kroger cart

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Kroger Developer Account with API credentials
- OpenRouter API key

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/kroger-grocery-assistant.git
   cd kroger-grocery-assistant
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   SESSION_SECRET=your-session-secret

   # Kroger API Configuration
   KROGER_CLIENT_ID=your-kroger-client-id
   KROGER_CLIENT_SECRET=your-kroger-client-secret
   KROGER_REDIRECT_URI=http://localhost:3000/auth/callback

   # OpenRouter Configuration
   OPENROUTER_API_KEY=your-openrouter-api-key
   OPENROUTER_APP_NAME=kroger-grocery-assistant
   OPENROUTER_SITE_URL=http://localhost:3000
   ```

4. Start the server:
   ```
   npm start
   ```

5. Open your browser and navigate to `http://localhost:3000`

## How It Works

1. **Authentication**: Users log in with their Kroger credentials using OAuth
2. **Store Selection**: Users select their preferred Kroger store location
3. **Grocery List Input**: Users enter their grocery list in the provided form
4. **LLM Processing**: The LLM agent processes the grocery list to standardize and categorize items
5. **Product Search**: For each item, the application searches the Kroger API for matching products
6. **Product Selection**: The LLM agent selects the best product match based on user preferences
7. **Cart Management**: Selected products are added to the user's Kroger cart
8. **Checkout**: Users can review their cart and checkout on Kroger's website

## Project Structure

```
kroger-grocery-assistant/
├── config/                 # Configuration files
│   ├── config.js           # Main configuration
│   └── kroger.js           # Kroger API configuration
├── public/                 # Static files
│   ├── css/                # Stylesheets
│   └── js/                 # Client-side JavaScript
├── routes/                 # API routes
│   ├── auth.js             # Authentication routes
│   └── groceries.js        # Grocery list routes
├── services/               # Business logic
│   ├── krogerService.js    # Kroger API integration
│   └── llmService.js       # LLM agent integration
├── views/                  # EJS templates
│   ├── partials/           # Reusable template parts
│   ├── cart.ejs            # Cart view
│   ├── error.ejs           # Error page
│   ├── groceryList.ejs     # Grocery list input page
│   ├── locations.ejs       # Store location selection
│   └── login.ejs           # Login page
├── .env                    # Environment variables
├── package.json            # Project dependencies
├── README.md               # Project documentation
└── server.js               # Main server file
```

## Kroger API Integration

This application uses the following Kroger API endpoints:

- **OAuth**: For user authentication
- **Locations**: To find nearby Kroger stores
- **Products**: To search for products
- **Cart**: To add items to the user's cart

For more information on the Kroger API, visit the [Kroger Developer Portal](https://developer.kroger.com/).

## LLM Agent

The LLM agent uses OpenRouter (with Claude models) to:

1. Process and standardize grocery list items
2. Generate effective search queries for the Kroger API
3. Select the best product match based on user preferences

OpenRouter provides access to multiple AI models through a unified API. This application uses Claude models via OpenRouter for intelligent grocery list processing.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Kroger for providing the API
- OpenRouter for AI model access
- Anthropic for Claude models