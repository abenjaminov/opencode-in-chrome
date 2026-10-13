import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const script = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
function page(t, chrome) {
  const dom = new JSDOM(`<!doctype html><title>Account</title><body>
    <button id="button">Save</button><input id="name" aria-label="Name" value="Old">
    <input id="secret" type="password" value="private"><input id="box" type="checkbox">
    <select id="select"><option value="a">A</option><option value="b">B</option></select>
    <input id="disabled" disabled><button id="hidden" style="display:none">Hidden</button>
  </body>`, { url: 'https://example.com', runScripts: 'outside-only' });
  const { window } = dom;
  if (chrome) window.chrome = chrome;
  window.HTMLElement.prototype.getClientRects = function () { return [{ width: 100, height: 20 }]; };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.eval(script);
  t.after(() => window.close());
  return { run: window.__opencodeChrome.run, document: window.document, window };
}

test('snapshot exposes visible controls without password values', t => {
  const { run } = page(t), snapshot = run('read_page');
  assert.equal(snapshot.title, 'Account');
  assert.ok(snapshot.elements.some(e => e.label === 'Name'));
  assert.ok(!snapshot.elements.some(e => e.label === 'Hidden'));
  assert.equal(snapshot.elements.find(e => e.type === 'password').value, undefined);
  assert.equal(snapshot.elements.find(e => e.tag === 'select').options[1].value, 'b');
});

test('form interaction updates values and dispatches page events', async t => {
  const { run, document } = page(t), snapshot = run('read_page');
  const args = ref => ({ ref, documentID: snapshot.documentID });
  let inputEvents = 0, clicks = 0;
  document.getElementById('name').addEventListener('input', () => inputEvents++);
  document.getElementById('button').addEventListener('click', () => clicks++);
  const name = snapshot.elements.find(e => e.label === 'Name');
  await run('type', { ...args(name.ref), text: 'Alice' });
  assert.equal(document.getElementById('name').value, 'Alice'); assert.equal(inputEvents, 1);
  await run('click', args(snapshot.elements.find(e => e.tag === 'button').ref)); assert.equal(clicks, 1);
  await run('select', { ...args(snapshot.elements.find(e => e.tag === 'select').ref), value: 'b' });
  assert.equal(document.getElementById('select').value, 'b');
  const box = snapshot.elements.find(e => e.type === 'checkbox');
  await run('check', { ...args(box.ref), checked: true }); await run('check', { ...args(box.ref), checked: true });
  assert.equal(document.getElementById('box').checked, true);
  assert.throws(() => run('type', { ...args(snapshot.elements.find(e => e.disabled).ref), text: 'x' }), /disabled/);
});

test('old refs cannot target different elements after a fresh snapshot', t => {
  const { run } = page(t), first = run('read_page'), second = run('read_page');
  assert.notEqual(first.elements[0].ref, second.elements[0].ref);
  assert.throws(() => run('click', { ref: first.elements[0].ref, documentID: first.documentID }), /ref expired/);
  assert.throws(() => run('click', { ref: second.elements[0].ref, documentID: 'another-document' }), /Page changed/);
});

test('removed refs fail and re-injection preserves the document snapshot', t => {
  const { run, document, window } = page(t), snapshot = run('read_page');
  window.eval(script);
  assert.equal(window.__opencodeChrome.run, run);
  document.getElementById('button').remove();
  assert.throws(() => run('click', { ref: snapshot.elements[0].ref, documentID: snapshot.documentID }), /ref expired/);
});

test('same-document navigation invalidates action refs', t => {
  const { run, window } = page(t), snapshot = run('read_page');
  window.history.pushState({}, '', '/another-page');
  assert.throws(() => run('click', { ref: snapshot.elements[0].ref, documentID: snapshot.documentID }), /Page changed/);
});

test('agent cursor highlights a target without following the user mouse or polluting refs', async t => {
  const { run, document, window } = page(t);
  const button = document.getElementById('button');
  button.getBoundingClientRect = () => ({ left: 100, top: 200, width: 80, height: 40 });
  const snapshot = run('read_page');
  assert.equal(snapshot.elements.length, 6);
  let clicks = 0; button.addEventListener('click', () => clicks++);
  const promise = run('click', { ref: snapshot.elements[0].ref, documentID: snapshot.documentID });
  const host = document.getElementById('opencode-agent-overlay');
  const cursor = host.shadowRoot.querySelector('.cursor');
  assert.equal(host.style.pointerEvents, 'none');
  assert.equal(cursor.style.transform, 'translate3d(140px,220px,0)');
  assert.equal(clicks, 0);
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 600, clientY: 500 }));
  assert.equal(cursor.style.transform, 'translate3d(140px,220px,0)');
  await promise; assert.equal(clicks, 1);
  assert.match(host.shadowRoot.querySelector('.status').textContent, /Clicking/);
});

test('disabling removes the indicator and cancels an action before its click', async t => {
  const { run, document, window } = page(t), snapshot = run('read_page');
  let clicks = 0; document.getElementById('button').addEventListener('click', () => clicks++);
  const promise = run('click', { ref: snapshot.elements[0].ref, documentID: snapshot.documentID });
  const rejected = assert.rejects(promise, /disabled before the action/);
  window.__opencodeChrome.setEnabled(false);
  assert.equal(document.getElementById('opencode-agent-overlay'), null);
  await rejected; assert.equal(clicks, 0);
});

test('an authenticated cancellation message stops the pending agent click', async t => {
  let listener;
  const chrome = { runtime: { id: 'test-extension', onMessage: { addListener: value => { listener = value; }, removeListener: () => {} } } };
  const { run, document } = page(t, chrome), snapshot = run('read_page');
  let clicks = 0; document.getElementById('button').addEventListener('click', () => clicks++);
  const promise = run('click', { ref: snapshot.elements[0].ref, documentID: snapshot.documentID, commandID: 'action-one' });
  const rejected = assert.rejects(promise, /cancelled before execution/);
  listener({ type: 'opencode-cancel', id: 'action-one' }, { id: 'test-extension' });
  await rejected; assert.equal(clicks, 0);
});

test('disable then quick re-enable cannot revive a pending interaction', async t => {
  const { run, document, window } = page(t), snapshot = run('read_page');
  let clicks = 0; document.getElementById('button').addEventListener('click', () => clicks++);
  const promise = run('click', { ref: snapshot.elements[0].ref, documentID: snapshot.documentID });
  const rejected = assert.rejects(promise, /disabled before the action/);
  window.__opencodeChrome.setEnabled(false); window.__opencodeChrome.setEnabled(true);
  await rejected; assert.equal(clicks, 0);
});
