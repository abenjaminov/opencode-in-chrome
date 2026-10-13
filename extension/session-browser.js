export class SessionBrowser {
  bindings = {};
  documents = new Map();
  enabled = false;

  constructor(chrome, publish = () => {}) {
    this.chrome = chrome;
    this.publish = publish;
  }

  async restore(saved) {
    // Only v2 ownership records are restored. Manually connected v1 tabs are never adopted.
    for (const [sessionID, binding] of Object.entries(saved || {})) {
      if (!/^ses[\w-]+$/.test(sessionID) || !Array.isArray(binding.tabs) || !binding.generation)
        continue;
      const tabs = [];
      for (const owned of binding.tabs) {
        try {
          tabs.push(this.info(await this.chrome.tabs.get(owned.id)));
        } catch {}
      }
      this.bindings[sessionID] = {
        ...binding,
        tabs,
        currentTabID: tabs.some((t) => t.id === binding.currentTabID)
          ? binding.currentTabID
          : tabs.at(-1)?.id,
      };
    }
  }

  info(tab) {
    return {
      id: tab.id,
      title: tab.title || '',
      url: tab.url || '',
      loading: tab.status === 'loading',
    };
  }

  owner(tabID) {
    return Object.entries(this.bindings).find(([, binding]) =>
      binding.tabs.some((tab) => tab.id === tabID),
    );
  }

  async overlay(tabID) {
    if (!this.owner(tabID)) return;
    try {
      const tab = await this.chrome.tabs.get(tabID);
      if (!/^https?:/.test(tab.url || '') || tab.status === 'loading') return;
      if (this.enabled)
        await this.chrome.scripting.executeScript({
          target: { tabId: tabID },
          files: ['content.js'],
        });
      await this.chrome.scripting.executeScript({
        target: { tabId: tabID },
        func: (enabled) => globalThis.__opencodeChrome?.setEnabled(enabled),
        args: [this.enabled],
      });
    } catch {
      /* A navigating or protected page can’t display an overlay yet. */
    }
  }

  async mark(sessionID, tab) {
    const binding = this.bindings[sessionID];
    await this.chrome.action.setBadgeText({ text: this.enabled ? 'AI' : '', tabId: tab.id });
    await this.chrome.action.setBadgeBackgroundColor({ color: '#f97316', tabId: tab.id });
    // Groups are per window; a session can have tabs in several windows.
    const groups = (binding.groups ||= {});
    try {
      let groupID = groups[tab.windowId];
      if (groupID !== undefined) {
        const group = await this.chrome.tabGroups.get(groupID).catch(() => null);
        if (group?.windowId !== tab.windowId) groupID = undefined;
      }
      groupID = await this.chrome.tabs.group({
        tabIds: [tab.id],
        ...(groupID === undefined ? {} : { groupId: groupID }),
      });
      groups[tab.windowId] = groupID;
      await this.chrome.tabGroups.update(groupID, {
        title: `OpenCode · ${sessionID.slice(-6)}${this.enabled ? '' : ' · disabled'}`,
        color: this.enabled ? 'orange' : 'grey',
        collapsed: false,
      });
      await this.save(sessionID);
    } catch {
      /* Visual grouping does not determine tab ownership. */
    }
    await this.overlay(tab.id);
  }

  async refreshIndicators() {
    for (const [sessionID, binding] of Object.entries(this.bindings)) {
      for (const owned of binding.tabs) {
        try {
          await this.mark(sessionID, await this.chrome.tabs.get(owned.id));
        } catch {}
      }
    }
  }

  async updated(tabID, changeInfo, tab) {
    const entry = this.owner(tabID);
    if (!entry) return;
    const [sessionID, binding] = entry;
    Object.assign(
      binding.tabs.find((t) => t.id === tabID),
      this.info(tab),
    );
    if (changeInfo.url) this.documents.delete(tabID);
    if (changeInfo.status === 'complete') await this.overlay(tabID);
    await this.save(sessionID);
  }

  async save(sessionID) {
    await this.chrome.storage.session.set({ ownedSessionsV2: this.bindings });
    if (sessionID) this.publish({ type: 'bind', sessionID, binding: this.bindings[sessionID] });
  }

  assert(command) {
    if (command.cancelled) throw new Error('Browser action cancelled');
    if (!this.enabled) throw new Error('Enable browser access in Bridge settings first.');
    if (!/^ses[\w-]+$/.test(command.sessionID || '') || !command.generation)
      throw new Error('Invalid browser session');
    if (!Number.isFinite(command.expiresAt) || Date.now() >= command.expiresAt)
      throw new Error('Browser action expired before execution.');
    let binding = this.bindings[command.sessionID];
    if (!binding) {
      binding = { generation: command.generation, tabs: [], paused: false };
      this.bindings[command.sessionID] = binding;
    }
    if (binding.paused || binding.generation !== command.generation)
      throw new Error(
        'Browser session stopped or changed. Retry after enabling browser access in the extension popup.',
      );
    return binding;
  }

  async pause(sessionID, paused = true) {
    const binding = (this.bindings[sessionID] ||= { tabs: [] });
    binding.paused = paused;
    binding.generation = crypto.randomUUID();
    await this.save(sessionID);
    if (paused) this.publish({ type: 'pause', sessionID });
  }

  async remove(tabID) {
    this.documents.delete(tabID);
    for (const [sessionID, binding] of Object.entries(this.bindings)) {
      if (!binding.tabs.some((tab) => tab.id === tabID)) continue;
      binding.tabs = binding.tabs.filter((tab) => tab.id !== tabID);
      if (binding.currentTabID === tabID) binding.currentTabID = binding.tabs.at(-1)?.id;
      await this.save(sessionID);
    }
  }

  async created(tab) {
    const entry = Object.entries(this.bindings).find(([, binding]) =>
      binding.tabs.some((owned) => owned.id === tab.openerTabId),
    );
    if (!entry) return;
    const [sessionID, binding] = entry;
    if (binding.tabs.some((owned) => owned.id === tab.id)) return;
    binding.tabs.push(this.info(tab));
    binding.currentTabID = tab.id;
    await this.save(sessionID);
    await this.mark(sessionID, tab);
  }

  async invalidate() {
    for (const binding of Object.values(this.bindings)) binding.generation = crypto.randomUUID();
    await this.save();
    this.documents.clear();
  }

  async suspend() {
    this.enabled = false;
    const invalidated = this.invalidate();
    // Notify in-flight content scripts immediately, ahead of slower UI/storage work.
    const notifications = Object.values(this.bindings).flatMap((binding) =>
      binding.tabs.map((tab) =>
        this.chrome.tabs.sendMessage(tab.id, { type: 'opencode-disable' }).catch(() => {}),
      ),
    );
    await Promise.all([invalidated, ...notifications]);
    await this.refreshIndicators();
  }

  async cancel(command) {
    command.cancelled = true;
    if (
      command.executingTabID !== undefined &&
      this.owner(command.executingTabID)?.[0] === command.sessionID
    ) {
      await this.chrome.tabs
        .sendMessage(command.executingTabID, { type: 'opencode-cancel', id: command.id })
        .catch(() => {});
    }
  }

  async run(command) {
    const binding = this.assert(command),
      args = command.args || {};
    if (command.tool === 'open_tab') {
      const url = args.url || 'about:blank';
      if (url !== 'about:blank' && !/^https?:\/\//.test(url))
        throw new Error('Only HTTP/HTTPS URLs are supported.');
      const tab = await this.chrome.tabs.create({ url, active: true });
      // Record ownership even if Stop arrived while Chrome was creating the tab.
      binding.tabs.push(this.info(tab));
      binding.currentTabID = tab.id;
      await this.save(command.sessionID);
      await this.mark(command.sessionID, tab);
      this.assert(command);
      return { tabID: tab.id, ...this.info(tab) };
    }
    if (command.tool === 'list_tabs') {
      for (const tab of [...binding.tabs]) {
        try {
          Object.assign(tab, this.info(await this.chrome.tabs.get(tab.id)));
        } catch {
          await this.remove(tab.id);
        }
      }
      this.assert(command);
      await this.save(command.sessionID);
      return { tabs: binding.tabs, currentTabID: binding.currentTabID };
    }
    const tabID = args.tabID ?? binding.currentTabID;
    if (!binding.tabs.some((tab) => tab.id === tabID))
      throw new Error(
        'This session does not own that tab. Use open_tab to create one or list_tabs to find your tabs.',
      );
    command.executingTabID = tabID;
    const tab = await this.chrome.tabs.get(tabID);
    this.assert(command);
    if (command.tool === 'close_tab') {
      await this.chrome.tabs.remove(tabID);
      await this.remove(tabID);
      return { closed: tabID, currentTabID: binding.currentTabID };
    }
    if (command.tool === 'focus_tab' || command.tool === 'screenshot') {
      await this.#focus(command, binding, tab);
      if (command.tool === 'focus_tab') return { tabID, ...this.info(tab) };
      return this.#capture(command, tab);
    }
    if (command.tool === 'navigate') {
      const url = new URL(args.url);
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Only HTTP/HTTPS navigation is supported.');
      this.documents.delete(tabID);
      const navigated = await this.chrome.tabs.update(tabID, { url: url.href });
      Object.assign(
        binding.tabs.find((t) => t.id === tabID),
        this.info(navigated),
      );
      await this.save(command.sessionID);
      return { tabID, url: url.href, loading: true };
    }
    if (!['read_page', 'click', 'type', 'select', 'check', 'scroll'].includes(command.tool))
      throw new Error('Unsupported tool');
    return this.#pageAction(command, tab);
  }

  async #focus(command, binding, tab) {
    await this.chrome.tabs.update(tab.id, { active: true });
    this.assert(command);
    await this.chrome.windows.update(tab.windowId, { focused: true });
    this.assert(command);
    binding.currentTabID = tab.id;
    await this.save(command.sessionID);
  }

  async #capture(command, tab) {
    const [active] = await this.chrome.tabs.query({ active: true, windowId: tab.windowId });
    this.assert(command);
    if (active?.id !== tab.id) throw new Error('Active tab changed; retry screenshot.');
    const dataUrl = await this.chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const [after] = await this.chrome.tabs.query({ active: true, windowId: tab.windowId });
    this.assert(command);
    if (after?.id !== tab.id)
      throw new Error('Active tab changed during capture; retry screenshot.');
    return { data: dataUrl.split(',')[1] };
  }

  async #pageAction(command, tab) {
    const tabID = tab.id;
    const args = command.args || {};
    const deadline = Date.now() + 10000;
    while (tab.status === 'loading' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      this.assert(command);
      tab = await this.chrome.tabs.get(tabID);
    }
    if (tab.status === 'loading')
      throw new Error('Page is still loading; retry read_page shortly.');
    if (!/^https?:/.test(tab.url || ''))
      throw new Error('Navigate this tab to a website before reading or interacting with it.');
    await this.chrome.scripting.executeScript({ target: { tabId: tabID }, files: ['content.js'] });
    this.assert(command);
    const results = await this.chrome.scripting.executeScript({
      target: { tabId: tabID },
      func: (tool, input) => globalThis.__opencodeChrome.run(tool, input),
      args: [
        command.tool,
        { ...args, documentID: this.documents.get(tabID), commandID: command.id },
      ],
    });
    this.assert(command);
    const result = results[0]?.result;
    if (!result) throw new Error('Page returned no result.');
    if (command.tool === 'read_page') this.documents.set(tabID, result.documentID);
    return { tabID, ...result };
  }
}
