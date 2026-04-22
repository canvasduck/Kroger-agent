#!/usr/bin/env node
/**
 * Kroger MCP server (stdio).
 *
 * Required env:
 *   KROGER_CLIENT_ID, KROGER_CLIENT_SECRET
 * Optional env:
 *   KROGER_REDIRECT_URI   (default http://localhost:8787/callback)
 *   KROGER_CALLBACK_PORT  (default 8787)
 *   KROGER_MCP_STATE_DIR  (default ~/.kroger-agent)
 *
 * Register in .mcp.json or ~/.claude.json as a stdio server:
 *   { "command": "node", "args": ["/abs/path/to/Kroger-agent/mcp/index.js"] }
 */

// MCP stdio uses stdout exclusively for JSON-RPC frames. The shared config
// and service modules log via console.log; reroute those to stderr before
// anything else is required so they can't corrupt the protocol.
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);

require('dotenv').config();

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const tools = require('./tools');

const server = new Server(
  { name: 'kroger-agent', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  try {
    const result = await tool.handler(args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const payload = err.response?.data
      ? { error: err.message, details: err.response.data }
      : { error: err.message, code: err.code };
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }
});

(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})().catch((err) => {
  console.error('Kroger MCP server failed to start:', err);
  process.exit(1);
});
