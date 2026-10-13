import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

export const configURL = new URL('../.local/config.json', import.meta.url);

export function validateConfig(config) {
  if (!config || typeof config.token !== 'string' || !/^[a-f0-9]{64}$/.test(config.token)) {
    throw new Error('Invalid pairing token. Expected 32 random bytes encoded as hexadecimal.');
  }
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) {
    throw new Error('Invalid bridge port. Use an integer between 1024 and 65535.');
  }
  return { token: config.token, port: config.port };
}

export async function readConfig(url = configURL) {
  const contents = await readFile(url, 'utf8');
  let config;
  try {
    config = JSON.parse(contents);
  } catch {
    throw new Error(
      'Invalid bridge settings JSON. Inspect the local config privately; do not share its token.',
    );
  }
  return validateConfig(config);
}

export async function writeConfig(config, url = configURL) {
  await writeFile(url, JSON.stringify(validateConfig(config), null, 2) + '\n', { mode: 0o600 });
  // writeFile's mode applies only to new files; also restrict existing POSIX files.
  await chmod(url, 0o600);
}

export async function ensureConfig({ port, rotateToken = false } = {}, url = configURL) {
  let config;
  try {
    config = await readConfig(url);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    config = { token: randomBytes(32).toString('hex'), port: 8790 };
  }
  if (port !== undefined) config.port = port;
  if (rotateToken) config.token = randomBytes(32).toString('hex');
  validateConfig(config);
  await mkdir(new URL('./', url), { recursive: true, mode: 0o700 });
  await writeConfig(config, url);
  return config;
}

export function parseSetupOptions(args) {
  const options = { rotateToken: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--rotate-token') options.rotateToken = true;
    else if (arg === '--port') {
      const value = args[++index];
      if (!/^\d+$/.test(value || '') || Number(value) < 1024 || Number(value) > 65535) {
        throw new Error('--port requires an integer between 1024 and 65535.');
      }
      options.port = Number(value);
    } else throw new Error(`Unknown setup option: ${arg}`);
  }
  return options;
}
