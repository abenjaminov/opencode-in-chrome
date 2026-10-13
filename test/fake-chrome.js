export function fakeChrome() {
  let nextID = 100, activeID = 1;
  const tabState = new Map([[1, { id: 1, windowId: 1, url: 'https://personal.example', title: 'Personal tab', status: 'complete' }]]);
  const scriptCalls = [], messages = [], saved = {};
  const groupState = new Map(); let nextGroupID = 10;
  const get = async id => { if (!tabState.has(id)) throw new Error('No tab'); return { ...tabState.get(id) }; };
  return {
    tabState, groupState, scriptCalls, messages, saved,
    tabs: {
      get,
      create: async ({ url }) => { const tab = { id: nextID++, windowId: 1, url, title: 'Agent page', status: 'complete' }; tabState.set(tab.id, tab); activeID = tab.id; return { ...tab }; },
      update: async (id, changes) => { const tab = await get(id); Object.assign(tab, changes); tabState.set(id, tab); if (changes.active) activeID = id; return tab; },
      remove: async id => { await get(id); tabState.delete(id); },
      group: async ({ tabIds, groupId }) => {
        const tabs = await Promise.all(tabIds.map(get));
        const id = groupId ?? nextGroupID++;
        groupState.set(id, { ...(groupState.get(id) || {}), id, windowId: tabs[0].windowId });
        for (const tab of tabs) tabState.get(tab.id).groupId = id;
        return id;
      },
      query: async () => [await get(activeID)],
      captureVisibleTab: async () => 'data:image/png;base64,aW1hZ2U=',
      sendMessage: async (tabID, message) => { messages.push({ tabID, message }); return { ok: true }; }
    },
    windows: { update: async () => {} },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabGroups: {
      get: async id => { if (!groupState.has(id)) throw new Error('No group'); return { ...groupState.get(id) }; },
      update: async (id, changes) => { Object.assign(groupState.get(id), changes); }
    },
    storage: { session: { set: async value => { Object.assign(saved, structuredClone(value)); } } },
    scripting: { executeScript: async request => {
      scriptCalls.push(request);
      if (request.files) return [];
      const tab = await get(request.target.tabId);
      return [{ result: { title: tab.title, documentID: `doc-${tab.id}`, ok: true } }];
    } }
  };
}
