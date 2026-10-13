import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const pkg = await json('../package.json');
const manifest = await json('../extension/manifest.json');
const lock = await json('../package-lock.json');
assert.equal(manifest.version, pkg.version, 'Chrome and package versions must match');
assert.equal(lock.version, pkg.version, 'Lockfile and package versions must match');
assert.equal(lock.packages[''].version, pkg.version, 'Lockfile root version must match');
console.log(`Package, lockfile, and Chrome manifest agree: ${pkg.version}`);
