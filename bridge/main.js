import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BrowserHub } from './hub.js';
import { createBridgeHttp } from './http.js';
import { registerBrowserTools } from './tools.js';

const config = JSON.parse(await readFile(new URL('../.local/config.json', import.meta.url), 'utf8').catch(() => {
  throw new Error('Run npm run setup in chrome-extension first.');
}));
if (typeof config.token !== 'string' || config.token.length < 32 || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw new Error('Invalid bridge settings');
const hub = new BrowserHub();
const { server, sockets } = createBridgeHttp({ ...config, hub });
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(config.port, '127.0.0.1', resolve);
});
// Only protocol messages go to stdout; OpenCode owns this process via stdio.
console.error(`OpenCode Chrome bridge listening on http://127.0.0.1:${config.port}`);
const mcp = new McpServer({ name: 'opencode-in-chrome', version: '0.3.1' });
registerBrowserTools(mcp, hub);
await mcp.connect(new StdioServerTransport());
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  hub.reset('Bridge stopped');
  for (const ws of sockets.clients) ws.terminate();
  server.close();
  void mcp.close().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('end', shutdown);
