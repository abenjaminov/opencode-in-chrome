import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { releaseArchives } from '../scripts/archives.js';
import { repositoryRoot } from '../scripts/installation.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

test('release archives are reproducible and exclude credentials, dependencies, and repository state', async () => {
  const first = await releaseArchives(repositoryRoot);
  const second = await releaseArchives(repositoryRoot);
  assert.deepEqual(first, second);
  const names = Object.keys(first);
  const source = unzipSync(first[names.find((name) => !name.includes('-extension-'))]);
  const extension = unzipSync(first[names.find((name) => name.includes('-extension-'))]);
  assert.ok(source['opencode-in-chrome/scripts/install.js']);
  assert.ok(source['opencode-in-chrome/.opencode/skills/install-opencode-in-chrome/SKILL.md']);
  assert.ok(source['opencode-in-chrome/LICENSE']);
  assert.ok(extension['manifest.json']);
  assert.ok(extension['LICENSE']);
  assert.equal(strFromU8(extension['manifest.json']).includes('manifest_version'), true);
  for (const name of [...Object.keys(source), ...Object.keys(extension)]) {
    assert.equal(/(^|\/)(\.local|node_modules|\.git|dist)(\/|$)/.test(name), false, name);
  }
  assert.equal(
    Object.keys(extension).some((name) => name.startsWith('bridge/')),
    false,
  );
});

test('packaging excludes nested local state and environment files inside source directories', async (t) => {
  const secret = `private-state-${randomUUID()}`;
  const root = await mkdtemp(path.join(tmpdir(), 'opencode-chrome-archives-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const existing = await releaseArchives(repositoryRoot);
  const sourceZip = Object.entries(existing).find(([name]) => !name.includes('-extension-'))[1];
  for (const [name, bytes] of Object.entries(unzipSync(sourceZip))) {
    const filename = path.join(root, name.slice('opencode-in-chrome/'.length));
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes);
  }
  for (const relative of [
    '.local/config.json',
    'docs/.local/config.json',
    'docs/.env',
    'extension/node_modules/private.json',
  ]) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, secret);
  }
  for (const bytes of Object.values(await releaseArchives(root))) {
    for (const contents of Object.values(unzipSync(bytes)))
      assert.equal(strFromU8(contents).includes(secret), false);
  }
});
