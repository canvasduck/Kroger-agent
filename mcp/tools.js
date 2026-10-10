const tokens = require('./tokens');
const client = require('./client');

const noArgs = { type: 'object', properties: {}, additionalProperties: false };

const tools = [
  {
    name: 'auth_status',
    description:
      'Whether the family Kroger account is linked, the saved store and pickup/delivery preference, and ' +
      'roughly how many days until a re-link is suggested. Check this when a Kroger call fails.',
    inputSchema: noArgs,
    handler: async () => tokens.authStatus(),
  },
  {
    name: 'begin_login',
    description:
      'Parents only. Start linking the family Kroger account. Returns a URL for the parent to open in any ' +
      'browser and sign in (Kroger may ask for an email/SMS code). After approving, the browser lands on a ' +
      'page that may not load; ask the parent to send back that full URL, then call complete_login with it.',
    inputSchema: noArgs,
    handler: async () => {
      const { authUrl } = tokens.beginLogin();
      return {
        authUrl,
        instructions:
          'Open this link, sign in to Kroger, approve access, then copy the full URL from the address bar ' +
          '(it starts with the redirect address and contains ?code=) and send it back.',
      };
    },
  },
  {
    name: 'complete_login',
    description: 'Parents only. Finish linking Kroger with the full redirect URL the parent pasted back.',
    inputSchema: {
      type: 'object',
      properties: { redirect_url: { type: 'string', description: 'Full URL from the browser address bar' } },
      required: ['redirect_url'],
      additionalProperties: false,
    },
    handler: async ({ redirect_url }) => tokens.completeLogin(redirect_url),
  },
  {
    name: 'find_locations',
    description: 'Find Kroger-family stores (e.g. King Soopers) near a ZIP code.',
    inputSchema: {
      type: 'object',
      properties: {
        zip_code: { type: 'string', description: 'US ZIP code' },
        radius: { type: 'number', description: 'Miles', default: 10 },
        limit: { type: 'number', default: 5 },
      },
      required: ['zip_code'],
      additionalProperties: false,
    },
    handler: async ({ zip_code, radius, limit }) => client.findLocations({ zipCode: zip_code, radius, limit }),
  },
  {
    name: 'set_preferences',
    description: 'Parents only. Save the default store (locationId from find_locations) and/or PICKUP vs DELIVERY.',
    inputSchema: {
      type: 'object',
      properties: {
        location_id: { type: 'string' },
        location_name: { type: 'string', description: 'Human-readable store name to remember' },
        modality: { type: 'string', enum: ['PICKUP', 'DELIVERY'] },
      },
      additionalProperties: false,
    },
    handler: async ({ location_id, location_name, modality }) => {
      tokens.setPrefs({ locationId: location_id, locationName: location_name, modality });
      return tokens.getPrefs();
    },
  },
  {
    name: 'search_products',
    description:
      'Search products at the saved store. Returns UPC, description, brand, size, price, promo price, and ' +
      'stock. Search each grocery item, pick the best match (right size/brand, in stock, sensible unit ' +
      'price), and use the returned UPC with add_to_cart. If the request is vague (e.g. "milk"), prefer the ' +
      "family's usual choice if known, otherwise a common size, and say which one you picked.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'e.g. "2% milk gallon"' },
        limit: { type: 'number', default: 5, description: 'Max 10' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: async ({ query, limit }) => client.searchProducts({ query, limit }),
  },
  {
    name: 'add_to_cart',
    description:
      "Add items to the family's Kroger cart in one call. Each UPC must come from search_products. " +
      'Quantity is a count of the product as sold (one gallon jug, one bag), not individual pieces. ' +
      'This cannot check out or remove items; tell the person to review and check out in the Kroger app.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: { upc: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 24, default: 1 } },
            required: ['upc'],
            additionalProperties: false,
          },
        },
        modality: { type: 'string', enum: ['PICKUP', 'DELIVERY'], description: 'Defaults to the saved preference' },
      },
      required: ['items'],
      additionalProperties: false,
    },
    handler: async ({ items, modality }) => client.addToCart({ items, modality }),
  },
];

module.exports = tools;
