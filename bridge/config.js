import { readFile, writeFile, chmod } from 'node:fs/promises';

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
  return validateConfig(JSON.parse(await readFile(url, 'utf8')));
}

export async function writeConfig(config, url = configURL) {
  await writeFile(url, JSON.stringify(validateConfig(config), null, 2) + '\n', { mode: 0o600 });
  // writeFile's mode applies only to new files; also restrict existing POSIX files.
  await chmod(url, 0o600);
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
