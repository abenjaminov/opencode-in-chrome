import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('setup popup enables browser once without conversation selection or side panel', async t => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.side_panel, undefined);
  assert.equal(manifest.permissions.includes('sidePanel'), false);
  assert.equal(manifest.action.default_popup, 'popup.html');
  const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://extension.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const calls = [], permissions = [];
  let enabled = false;
  dom.window.setInterval = () => {};
  dom.window.chrome = {
    permissions: { request: async request => { permissions.push(request); return true; } },
    runtime: { sendMessage: async message => {
      calls.push(message);
      if (message.type === 'settings') enabled = true;
      if (message.type === 'disable') enabled = false;
      return { result: message.type === 'state' ? { ready: true, enabled, settings: { token: 'a'.repeat(64), url: 'http://127.0.0.1:8790' } } : { ok: true } };
    } }
  };
  await dom.window.eval(`(async () => { ${script} })()`);
  dom.window.document.getElementById('settings-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(permissions[0].origins[0], '<all_urls>');
  assert.match(dom.window.document.getElementById('status').textContent, /Ready/);
  assert.ok(calls.some(c => c.type === 'settings'));
  assert.ok(!calls.some(c => c.type === 'api' || c.type === 'bind'));
  assert.equal(dom.window.document.querySelector('select'), null);
  dom.window.document.getElementById('disable').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(dom.window.document.getElementById('status').textContent, /disabled/);
});
