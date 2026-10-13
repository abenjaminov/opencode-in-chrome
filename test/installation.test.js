import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { install, parseInstallOptions } from '../scripts/installation.js';
import { ensureConfig, readConfig } from '../bridge/config.js';
import { pairingHTML } from '../scripts/pairing.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'opencode-chrome-install-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'checkout');
  const project = path.join(directory, 'project with spaces');
  const skill = '.opencode/skills/install-opencode-in-chrome/SKILL.md';
  await mkdir(path.dirname(path.join(root, skill)), { recursive: true });
  await mkdir(project);
  await writeFile(path.join(root, skill), 'installation skill');
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  return { root, project, skill, url: pathToFileURL(path.join(root, '.local/config.json')) };
}

test('installer validates arguments and always requires an explicit target project', () => {
  assert.equal(parseInstallOptions(['--project', '.', '--port', '9001']).port, 9001);
  assert.equal(parseInstallOptions(['--help']).help, true);
  for (const args of [
    [],
    ['--project'],
    ['--global'],
    ['--port', '0'],
    ['--project', '.', '--port', 'oops'],
  ])
    assert.throws(() => parseInstallOptions(args));
});

test('installer registers with shell-free argument boundaries, copies a skill, and preserves pairing on repeat runs', async (t) => {
  const f = await fixture(t);
  const calls = [];
  const options = {
    ...f,
    run: (...args) => {
      calls.push(args);
      return { stdout: '✓ chrome connected\n' };
    },
    checkPort: async () => true,
    npmCLI: '/npm-cli.js',
  };
  const first = await install(options);
  const config = await readConfig(f.url);
  assert.equal(config.port, 8790);
  assert.equal(first.project, f.project);
  assert.equal(await readFile(path.join(f.project, f.skill), 'utf8'), 'installation skill');
  const registration = calls.find(([, args]) => args.includes('add'));
  assert.deepEqual(registration, [
    'opencode',
    ['mcp', 'add', 'chrome', '--', process.execPath, path.join(f.root, 'bridge/main.js')],
    f.project,
  ]);
  await install(options);
  assert.deepEqual(await readConfig(f.url), config);
  assert.equal(JSON.stringify(calls).includes(config.token), false);
});

test('installer preserves an existing user skill and refuses a conflicting port before MCP registration', async (t) => {
  const f = await fixture(t);
  await mkdir(path.dirname(path.join(f.project, f.skill)), { recursive: true });
  await writeFile(path.join(f.project, f.skill), 'user work');
  const calls = [];
  const options = { ...f, run: (...args) => calls.push(args), npmCLI: '/npm-cli.js' };
  await assert.rejects(install(options), /different contents/);
  assert.equal(calls.length, 0);
  assert.equal(await readFile(path.join(f.project, f.skill), 'utf8'), 'user work');
  await rm(path.join(f.project, f.skill));
  await assert.rejects(
    install({
      ...options,
      checkPort: async () => false,
      checkBridge: async () => [{ id: 'bridge', status: 'fail' }],
    }),
    /occupied/,
  );
  assert.equal(
    calls.some(([, args]) => args.includes('add')),
    false,
  );
});

test('configuration rotation and pairing page stay local and escape displayed paths', async (t) => {
  const f = await fixture(t);
  const original = await ensureConfig({ port: 9001 }, f.url);
  const preserved = await ensureConfig({}, f.url);
  assert.deepEqual(preserved, original);
  const rotated = await ensureConfig({ rotateToken: true }, f.url);
  assert.equal(rotated.port, 9001);
  assert.notEqual(rotated.token, original.token);
  const html = pairingHTML(rotated, '<script>bad</script>');
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes(rotated.token));
  assert.ok(html.includes("default-src 'none'"));
  assert.equal(html.includes('<script>bad</script>'), false);
});

test('installer does not claim success when target MCP failed despite an already reachable browser', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    install({
      ...f,
      run: () => ({ stdout: '✗ chrome failed: Connection closed\n' }),
      npmCLI: '/npm-cli.js',
      checkPort: async () => false,
      checkBridge: async () => [{ id: 'bridge', status: 'pass' }],
    }),
    /not confirmed connected in the target project/,
  );
  assert.equal(await readFile(path.join(f.project, f.skill), 'utf8'), 'installation skill');
});
