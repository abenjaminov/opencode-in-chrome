import { mkdir, writeFile } from 'node:fs/promises';
import { readConfig, writeConfig, parseSetupOptions } from './config.js';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = parseSetupOptions(process.argv.slice(2));
await mkdir(path.join(root, '.local'), { recursive: true, mode: 0o700 });
const configPath = path.join(root, '.local/config.json');
let config;
try {
  config = await readConfig();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  config = { token: randomBytes(32).toString('hex'), port: 8790 };
}
if (options.rotateToken) {
  config.token = randomBytes(32).toString('hex');
}
if (options.port !== undefined) config.port = options.port;
await writeConfig(config);
const snippet = {
  $schema: 'https://opencode.ai/config.json',
  mcp: {
    servers: {
      chrome: { type: 'local', command: [process.execPath, path.join(root, 'bridge/main.js')] },
    },
  },
};
await writeFile(path.join(root, '.local/mcp-config.json'), JSON.stringify(snippet, null, 2));
console.log(
  `Bridge URL: http://127.0.0.1:${config.port}\nPairing token: ${config.token}\nLocal settings: ${configPath}`,
);
console.log('\nRegister with OpenCode (run from your target project):');
console.log(
  `opencode mcp add chrome -- "${process.execPath}" "${path.join(root, 'bridge/main.js')}"`,
);
