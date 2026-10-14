import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { pairingHTML } from '../scripts/pairing.js';

const config = { token: 'a'.repeat(64), port: 8790 };

function pairingPage(t, platform, root = '/Users/Test/Chrome tools') {
  const dom = new JSDOM(pairingHTML(config, root, platform), {
    runScripts: 'dangerously',
    url: 'file:///test/pairing.html',
  });
  t.after(() => dom.window.close());
  return dom.window;
}

for (const platform of ['darwin', 'win32', 'linux']) {
  test(`pairing page selects ${platform} instructions and hides other panels`, (t) => {
    const { document } = pairingPage(t, platform);
    const selected = document.querySelectorAll('[role="tab"][aria-selected="true"]');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, `tab-${platform}`);
    assert.equal(selected[0].tabIndex, 0);
    const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
    assert.deepEqual(
      panels.filter((panel) => !panel.hidden).map((panel) => panel.id),
      [`panel-${platform}`],
    );
  });
}

test('pairing page uses the installer platform by default', (t) => {
  const { document } = pairingPage(t, undefined);
  const platform = ['darwin', 'win32', 'linux'].includes(process.platform)
    ? process.platform
    : 'linux';
  assert.equal(document.querySelector('[aria-selected="true"]').id, `tab-${platform}`);
});

test('platform tabs support manual selection and keyboard navigation', (t) => {
  const { document, KeyboardEvent } = pairingPage(t, 'darwin');
  document.getElementById('tab-win32').click();
  assert.equal(document.getElementById('panel-win32').hidden, false);
  assert.equal(document.getElementById('panel-darwin').hidden, true);
  for (const [from, key, to] of [
    ['win32', 'ArrowRight', 'linux'],
    ['linux', 'ArrowRight', 'darwin'],
    ['darwin', 'ArrowLeft', 'linux'],
    ['linux', 'Home', 'darwin'],
    ['darwin', 'End', 'linux'],
  ]) {
    document.getElementById(`tab-${from}`).dispatchEvent(new KeyboardEvent('keydown', { key }));
    assert.equal(document.activeElement.id, `tab-${to}`);
    assert.equal(document.getElementById(`panel-${to}`).hidden, false);
    assert.equal(document.querySelectorAll('[role="tab"][tabindex="0"]').length, 1);
  }
});

test('extension folder copy preserves native paths without copying or revealing the token', async (t) => {
  for (const [platform, root, expected] of [
    ['darwin', '/Users/Test/Chrome tools/', '/Users/Test/Chrome tools/extension'],
    ['win32', 'C:\\Users\\Test\\Chrome tools\\', 'C:\\Users\\Test\\Chrome tools\\extension'],
    ['linux', '/home/test/Chrome tools', '/home/test/Chrome tools/extension'],
  ]) {
    const { document, navigator } = pairingPage(t, platform, root);
    const copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (value) => copied.push(value) },
    });
    await document.getElementById('copy-path').onclick();
    assert.deepEqual(copied, [expected]);
    assert.equal(document.getElementById('path-result').textContent, 'Copied');
    assert.equal(document.getElementById('token').type, 'password');
    await document.getElementById('copy').onclick();
    assert.deepEqual(copied, [expected, config.token]);
    assert.equal(document.getElementById('token').type, 'password');
  }
});

test('clipboard fallback selects the path with the platform-specific copy shortcut', async (t) => {
  for (const [platform, shortcut] of [
    ['darwin', 'Cmd+C'],
    ['win32', 'Ctrl+C'],
  ]) {
    const { document } = pairingPage(t, platform);
    await document.getElementById('copy-path').onclick();
    const input = document.getElementById('extension-path');
    assert.equal(document.activeElement, input);
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, input.value.length);
    assert.equal(document.getElementById('path-result').textContent, `Press ${shortcut} to copy`);
    assert.equal(document.getElementById('token').type, 'password');
  }
});

test('extension paths containing HTML remain inert and copy exactly', async (t) => {
  const root = '/Users/Test/<img src=x onerror="window.injected=true"> & tools';
  for (const platform of ['darwin', 'win32', 'linux']) {
    const { document, navigator } = pairingPage(t, platform, root);
    assert.equal(document.querySelector('img'), null);
    const copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (value) => copied.push(value) },
    });
    await document.getElementById('copy-path').onclick();
    assert.deepEqual(copied, [
      (platform === 'win32' ? path.win32 : path.posix).join(root, 'extension'),
    ]);
  }
});
