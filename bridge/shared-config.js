import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { configURL } from './config.js';

export function sharedConfigURL(args = process.argv.slice(2)) {
  if (args.length === 0) return configURL;
  if (args.length === 2 && args[0] === '--config' && args[1])
    return pathToFileURL(path.resolve(args[1]));
  throw new Error('Usage: shared bridge [--config <local-config-file>]');
}
