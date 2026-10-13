import { SessionBrowser } from './session-browser.js';

let socket,
  ready = false,
  heartbeat,
  retry;
let settings = {};
let suspended = Promise.resolve();
let authorized = false;
const queues = new Map();
const commands = new Map();
const browser = new SessionBrowser(chrome, (message) => {
  if (ready) send(message);
});
const initialized = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
])
  .then(() =>
    Promise.all([
      chrome.storage.local.get('settings'),
      chrome.storage.session.get('ownedSessionsV2'),
    ]),
  )
  .then(async ([local, session]) => {
    settings = local.settings || {};
    browser.enabled = false;
    await browser.restore(session.ownedSessionsV2);
    await browser.suspend();
  });

chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {
  void initialized.then(connectSocket);
});

function send(message) {
  if (!ready || socket?.readyState !== WebSocket.OPEN) throw new Error('Bridge disconnected.');
  socket.send(JSON.stringify(message));
}

function connectSocket() {
  if (
    !settings.token ||
    !settings.url ||
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  )
    return;
  const ws = new WebSocket(settings.url.replace('http:', 'ws:') + '/browser');
  socket = ws;
  ws.onopen = async () => {
    await suspended;
    const permitted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    if (socket !== ws || ws.readyState !== WebSocket.OPEN) return;
    authorized = settings.enabled === true && permitted;
    ws.send(
      JSON.stringify({
        type: 'hello',
        version: 2,
        token: settings.token,
        enabled: authorized,
        bindings: browser.bindings,
      }),
    );
  };
  ws.onmessage = (event) => {
    if (socket !== ws) return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      ws.close();
      return;
    }
    if (!message || typeof message !== 'object') {
      ws.close();
      return;
    }
    if (message.type === 'ready') {
      ready = true;
      browser.enabled = authorized;
      void browser.refreshIndicators();
      clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 20000);
    }
    if (message.type === 'command') {
      if (!ready) {
        ws.close();
        return;
      }
      commands.set(message.id, message);
      const previous = queues.get(message.sessionID) || Promise.resolve();
      const next = previous
        .catch(() => {})
        .then(() => {
          if (socket !== ws || !ready) throw new Error('Browser connection changed');
          return browser.run(message);
        })
        .then(
          (result) => {
            if (socket === ws && ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: 'result', id: message.id, result }));
          },
          (error) => {
            if (socket === ws && ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: 'result', id: message.id, error: error.message }));
          },
        );
      queues.set(message.sessionID, next);
      void next.finally(() => {
        commands.delete(message.id);
        if (queues.get(message.sessionID) === next) queues.delete(message.sessionID);
      });
    }
    if (message.type === 'cancel') {
      const command = commands.get(message.id);
      if (command?.sessionID === message.sessionID) void browser.cancel(command);
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    ready = false;
    authorized = false;
    suspended = browser.suspend().catch(() => {});
    clearInterval(heartbeat);
    clearTimeout(retry);
    retry = setTimeout(connectSocket, 3000);
  };
  ws.onerror = () => ws.close();
}

async function handle(message) {
  await initialized;
  if (message.type === 'state')
    return {
      ready,
      enabled: browser.enabled,
      settings,
      sessionCount: Object.keys(browser.bindings).length,
    };
  if (message.type === 'settings') {
    const url = new URL(message.url);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error('Use http://127.0.0.1:8790 (or your configured port).');
    if (typeof message.token !== 'string' || !/^[a-f0-9]{64}$/.test(message.token))
      throw new Error('Enter the pairing token printed by setup.');
    if (!(await chrome.permissions.contains({ origins: ['<all_urls>'] })))
      throw new Error('Website permission is required.');
    settings = { url: url.origin, token: message.token, enabled: true };
    ready = false;
    authorized = false;
    socket?.close();
    socket = null;
    clearInterval(heartbeat);
    suspended = browser.suspend();
    await suspended;
    await chrome.storage.local.set({ settings });
    connectSocket();
    return { ok: true };
  }
  if (message.type === 'disable') {
    browser.enabled = false;
    authorized = false;
    settings.enabled = false;
    if (ready) send({ type: 'availability', enabled: false });
    suspended = browser.suspend();
    await Promise.all([suspended, chrome.storage.local.set({ settings })]);
    return { ok: true };
  }
  throw new Error('Unknown extension request');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false;
  handle(message).then(
    (result) => respond({ result }),
    (error) => respond({ error: error.message }),
  );
  return true;
});
chrome.tabs.onRemoved.addListener((tabID) => {
  void initialized.then(() => browser.remove(tabID));
});
chrome.tabs.onCreated.addListener((tab) => {
  void initialized.then(() => browser.created(tab));
});
chrome.tabs.onUpdated.addListener((tabID, changeInfo, tab) => {
  void initialized.then(() => browser.updated(tabID, changeInfo, tab));
});
chrome.permissions.onRemoved.addListener(() => {
  void initialized.then(async () => {
    if (!(await chrome.permissions.contains({ origins: ['<all_urls>'] }))) {
      browser.enabled = false;
      authorized = false;
      if (ready) send({ type: 'availability', enabled: false });
      suspended = browser.suspend();
      await suspended;
    }
  });
});
void initialized.then(connectSocket);
