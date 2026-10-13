const $ = id => document.getElementById(id);
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response.error) throw new Error(response.error);
  return response.result;
}
function error(error) { $('error').hidden = false; $('error').textContent = error.message; }
async function refresh() {
  const state = await request({ type: 'state' });
  $('status').textContent = !state.ready ? '○ Bridge disconnected' : state.enabled ? '● Ready — sessions can open tabs' : '○ Browser access disabled';
}
$('settings-form').onsubmit = async event => {
  event.preventDefault(); $('error').hidden = true;
  try {
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!granted) throw new Error('Website permission is needed for browser tools and screenshots.');
    await request({ type: 'settings', url: $('url').value, token: $('token').value.trim() });
    await refresh();
  } catch (e) { error(e); }
};
$('disable').onclick = async () => {
  try { await request({ type: 'disable' }); await refresh(); } catch (e) { error(e); }
};
try {
  const state = await request({ type: 'state' });
  $('url').value = state.settings.url || 'http://127.0.0.1:8790'; $('token').value = state.settings.token || '';
  await refresh();
} catch (e) { error(e); }
setInterval(() => { void refresh().catch(error); }, 1000);
