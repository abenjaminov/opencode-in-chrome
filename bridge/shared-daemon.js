import { readFile } from 'node:fs/promises';
import { readConfig } from './config.js';
import { sharedConfigURL } from './shared-config.js';
import { createSharedBridge } from './shared-server.js';
import { listenBridge } from './listen.js';

try {
  const config = await readConfig(sharedConfigURL());
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const bridge = createSharedBridge(config, { version });
  await listenBridge(bridge.server, config.port);
  process.on('SIGINT', () => void bridge.close());
  process.on('SIGTERM', () => void bridge.close());
} catch (error) {
  console.error(`Shared Chrome bridge failed: ${error.message}`);
  process.exitCode = 1;
}
