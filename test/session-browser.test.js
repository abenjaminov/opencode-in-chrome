import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionBrowser } from '../extension/session-browser.js';
import { fakeChrome } from './fake-chrome.js';

function fixture() {
  const chrome = fakeChrome(), messages = [];
  const browser = new SessionBrowser(chrome, message => messages.push(structuredClone(message)));
  browser.enabled = true;
  const command = (tool, args = {}, sessionID = 'ses_one', generation = browser.bindings[sessionID]?.generation || `generation-${sessionID}`) => ({ tool, args, sessionID, generation, expiresAt: Date.now() + 25000 });
  return { browser, chrome, command, messages };
}

test('multiple owned tabs can be focused, navigated, closed without touching personal tabs', async () => {
  const { browser, chrome, command } = fixture();
  const first = await browser.run(command('open_tab'));
  await browser.run(command('navigate', { tabID: first.tabID, url: 'https://example.com' }));
  const second = await browser.run(command('open_tab', { url: 'https://example.org' }));
  await browser.run(command('focus_tab', { tabID: first.tabID }));
  assert.equal((await browser.run(command('list_tabs'))).currentTabID, first.tabID);
  await browser.run(command('close_tab', { tabID: first.tabID }));
  assert.equal((await browser.run(command('list_tabs'))).currentTabID, second.tabID);
  assert.equal(chrome.tabState.get(1).url, 'https://personal.example');
});

test('no tool can target a personal tab or a different session’s tab', async () => {
  const { browser, chrome, command } = fixture();
  const other = await browser.run(command('open_tab', { url: 'https://example.com' }, 'ses_other'));
  const scriptCount = chrome.scriptCalls.length;
  for (const tool of ['read_page', 'click', 'type', 'select', 'check', 'scroll', 'navigate', 'screenshot', 'focus_tab', 'close_tab']) {
    for (const tabID of [1, other.tabID]) await assert.rejects(browser.run(command(tool, { tabID })), /does not own/);
  }
  assert.equal(chrome.scriptCalls.length, scriptCount); assert.ok(chrome.tabState.has(1));
});

test('document refs stay per-tab and are cleared on navigation', async () => {
  const { browser, chrome, command } = fixture();
  const a = await browser.run(command('open_tab', { url: 'https://example.com' }));
  const b = await browser.run(command('open_tab', { url: 'https://example.org' }));
  await browser.run(command('read_page', { tabID: a.tabID }));
  await browser.run(command('read_page', { tabID: b.tabID }));
  await browser.run(command('click', { tabID: a.tabID, ref: 'e1' }));
  assert.equal(chrome.scriptCalls.at(-1).args[1].documentID, `doc-${a.tabID}`);
  await browser.run(command('navigate', { tabID: a.tabID, url: 'https://example.com/new' }));
  assert.equal(browser.documents.get(a.tabID), undefined);
  assert.equal(browser.documents.get(b.tabID), `doc-${b.tabID}`);
});

test('ownership survives worker restart; missing tabs and v1 manual bindings are excluded', async () => {
  const { browser, chrome, command } = fixture();
  const owned = await browser.run(command('open_tab', { url: 'https://example.com' }));
  const saved = structuredClone(browser.bindings);
  saved.ses_one.tabs.push({ id: 999 });
  saved.ses_old = { tabID: 1, generation: 'old-manual-binding' };
  const restarted = new SessionBrowser(chrome); await restarted.restore(saved);
  assert.deepEqual(restarted.bindings.ses_one.tabs.map(tab => tab.id), [owned.tabID]);
  assert.equal(restarted.bindings.ses_old, undefined);
});

test('new tabs spawned from an owned tab inherit ownership, personal-tab children do not', async () => {
  const { browser, command } = fixture();
  const owned = await browser.run(command('open_tab', { url: 'https://example.com' }));
  await browser.created({ id: 200, openerTabId: owned.tabID, url: 'https://child.example' });
  await browser.created({ id: 201, openerTabId: 1, url: 'https://personal-child.example' });
  assert.deepEqual(browser.bindings.ses_one.tabs.map(tab => tab.id), [owned.tabID, 200]);
});

test('expired and disabled commands cannot create tabs; re-enable cannot revive queued commands', async () => {
  const { browser, chrome, command } = fixture();
  const expired = { ...command('open_tab'), expiresAt: Date.now() - 1 };
  await assert.rejects(browser.run(expired), /expired/);
  await browser.run(command('list_tabs'));
  const queued = command('open_tab');
  browser.enabled = false; await browser.invalidate();
  await assert.rejects(browser.run(queued), /Enable browser/);
  browser.enabled = true;
  await assert.rejects(browser.run(queued), /stopped or changed/);
  assert.equal(chrome.tabState.size, 1);
});

test('owned tabs get orange groups per session; personal tabs remain unmarked', async () => {
  const { browser, chrome, command } = fixture();
  const a = await browser.run(command('open_tab', { url: 'https://example.com' }));
  const b = await browser.run(command('open_tab', { url: 'https://example.org' }));
  const c = await browser.run(command('open_tab', { url: 'https://another.example' }, 'ses_two'));
  const firstGroup = chrome.tabState.get(a.tabID).groupId;
  assert.equal(chrome.tabState.get(b.tabID).groupId, firstGroup);
  assert.notEqual(chrome.tabState.get(c.tabID).groupId, firstGroup);
  assert.equal(chrome.groupState.get(firstGroup).color, 'orange');
  assert.match(chrome.groupState.get(firstGroup).title, /OpenCode/);
  assert.equal(chrome.tabState.get(1).groupId, undefined);
  browser.enabled = false; await browser.refreshIndicators();
  assert.equal(chrome.groupState.get(firstGroup).color, 'grey');
  assert.equal(chrome.scriptCalls.at(-1).args[0], false);
});

test('navigation completion installs the control overlay only on owned tabs', async () => {
  const { browser, chrome, command } = fixture();
  const owned = await browser.run(command('open_tab', { url: 'https://example.com' }));
  chrome.scriptCalls.length = 0;
  await browser.updated(1, { status: 'complete' }, await chrome.tabs.get(1));
  assert.equal(chrome.scriptCalls.length, 0);
  await browser.updated(owned.tabID, { status: 'complete' }, await chrome.tabs.get(owned.tabID));
  assert.equal(chrome.scriptCalls[0].files[0], 'content.js');
  assert.equal(chrome.scriptCalls[1].args[0], true);
});

test('connection loss suspends actions and notifies only owned pages', async () => {
  const { browser, chrome, command } = fixture();
  const owned = await browser.run(command('open_tab', { url: 'https://example.com' }));
  const queued = command('click', { ref: 'e1' });
  await browser.suspend();
  assert.equal(browser.enabled, false);
  assert.deepEqual(chrome.messages.map(m => m.tabID), [owned.tabID]);
  assert.equal(chrome.messages[0].message.type, 'opencode-disable');
  browser.enabled = true;
  await assert.rejects(browser.run(queued), /stopped or changed/);
});

test('cancelled commands cannot run and cancellation messages target their owned tab', async () => {
  const { browser, chrome, command } = fixture();
  const owned = await browser.run(command('open_tab', { url: 'https://example.com' }));
  const pending = { ...command('click', { ref: 'e1' }), id: 'action-one', executingTabID: owned.tabID };
  await browser.cancel(pending);
  await assert.rejects(browser.run(pending), /cancelled/);
  assert.deepEqual(chrome.messages[0], { tabID: owned.tabID, message: { type: 'opencode-cancel', id: 'action-one' } });
});
