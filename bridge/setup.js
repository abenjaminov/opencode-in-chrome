import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(path.join(root, '.local'), { recursive: true });
const configPath = path.join(root, '.local/config.json');
let config;
try { config = JSON.parse(await readFile(configPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  config = { token: randomBytes(32).toString('hex'), port: 8790 };
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
if (process.argv.includes('--rotate-token')) {
  config.token = randomBytes(32).toString('hex');
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
const snippet = {
  $schema: 'https://opencode.ai/config.json',
  mcp: { servers: { chrome: { type: 'local', command: [process.execPath, path.join(root, 'bridge/main.js')] } } }
};
await writeFile(path.join(root, '.local/mcp-config.json'), JSON.stringify(snippet, null, 2));
console.log(`Bridge URL: http://127.0.0.1:${config.port}\nPairing token: ${config.token}\nLocal settings: ${configPath}`);
console.log('\nRegister with OpenCode (run from your target project):');
console.log(`opencode mcp add chrome -- "${process.execPath}" "${path.join(root, 'bridge/main.js')}"`);
