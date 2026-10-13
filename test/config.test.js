import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSetupOptions, readConfig, validateConfig, writeConfig } from '../bridge/config.js';

test('setup rejects unknown options and invalid ports before touching credentials', () => {
  assert.deepEqual(parseSetupOptions(['--port', '9000', '--rotate-token']), {
    rotateToken: true,
    port: 9000,
  });
  for (const args of [
    ['--port'],
    ['--port', '0'],
    ['--port', '65536'],
    ['--port', '8790junk'],
    ['--unknown'],
  ]) {
    assert.throws(() => parseSetupOptions(args));
  }
});

test('configuration validates credentials and restricts existing POSIX files', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'opencode-chrome-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'config.json');
  const config = { token: 'a'.repeat(64), port: 8790 };
  await writeFile(file, '{}', { mode: 0o644 });
  await writeConfig(config, file);
  assert.deepEqual(await readConfig(file), config);
  assert.equal((await readFile(file, 'utf8')).endsWith('\n'), true);
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  for (const invalid of [
    null,
    {},
    { ...config, token: 'short' },
    { ...config, port: 1 },
    { ...config, port: 8790.5 },
  ]) {
    assert.throws(() => validateConfig(invalid));
  }
  await writeFile(file, '{"token":"PRIVATE-SENTINEL" broken-json');
  await assert.rejects(readConfig(file), (error) => {
    assert.match(error.message, /Invalid bridge settings JSON/);
    assert.equal(error.message.includes('PRIVATE-SENTINEL'), false);
    return true;
  });
});
