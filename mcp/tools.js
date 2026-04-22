const tokens = require('./tokens');
const client = require('./client');

const tools = [
  {
    name: 'kroger_auth_status',
    description:
      'Report whether the MCP server has valid Kroger OAuth tokens, plus default location if set.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => tokens.authStatus(),
  },

  {
    name: 'kroger_login',
    description:
      'Start the Kroger OAuth login flow. Returns a URL the user must open in a browser. ' +
      'A loopback server catches the redirect and saves tokens. Call kroger_auth_status to confirm.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const { authUrl } = tokens.beginLogin();
      return {
        authUrl,
        instructions:
          'Open the URL above in a browser, sign in to Kroger, and approve access. ' +
          'Token will be saved automatically.',
      };
    },
  },

  {
    name: 'kroger_find_locations',
    description: 'Find Kroger store locations near a ZIP code.',
    inputSchema: {
      type: 'object',
      properties: {
        zip_code: { type: 'string', description: 'US ZIP code' },
        radius: { type: 'number', description: 'Search radius in miles', default: 10 },
        limit: { type: 'number', description: 'Max results', default: 5 },
      },
      required: ['zip_code'],
      additionalProperties: false,
    },
    handler: async ({ zip_code, radius, limit }) =>
      client.getLocations({ zipCode: zip_code, radius, limit }),
  },

  {
    name: 'kroger_set_default_location',
    description:
      'Persist a default Kroger locationId for subsequent product searches and cart adds.',
    inputSchema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'Kroger locationId (from kroger_find_locations)' },
      },
      required: ['location_id'],
      additionalProperties: false,
    },
    handler: async ({ location_id }) => {
      tokens.setDefaultLocationId(location_id);
      return { ok: true, locationId: location_id };
    },
  },

  {
    name: 'kroger_search_products',
    description:
      'Search the Kroger product catalog at a given store location. Returns UPCs, descriptions, prices.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term, e.g. "organic milk"' },
        limit: { type: 'number', description: 'Max results', default: 5 },
        location_id: {
          type: 'string',
          description: 'Override the default store location. If omitted, uses the persisted default.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: async ({ query, limit, location_id }) =>
      client.searchProducts({ query, limit, locationId: location_id }),
  },

  {
    name: 'kroger_add_to_cart',
    description: 'Add a product to the authenticated user\'s Kroger cart by UPC.',
    inputSchema: {
      type: 'object',
      properties: {
        upc: { type: 'string', description: 'Product UPC (from kroger_search_products)' },
        quantity: { type: 'number', default: 1 },
        modality: {
          type: 'string',
          enum: ['DELIVERY', 'PICKUP'],
          default: 'DELIVERY',
        },
      },
      required: ['upc'],
      additionalProperties: false,
    },
    handler: async ({ upc, quantity, modality }) =>
      client.addToCart({ upc, quantity, modality }),
  },
];

module.exports = tools;
