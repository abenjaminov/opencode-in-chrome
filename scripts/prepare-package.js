import { copyFile } from 'node:fs/promises';

await copyFile(
  new URL('../package-lock.json', import.meta.url),
  new URL('../npm-shrinkwrap.json', import.meta.url),
);
