import { writeFile, chmod } from 'node:fs/promises';
import { validateConfig } from '../bridge/config.js';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

export function pairingHTML(config, root) {
  validateConfig(config);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Pair OpenCode in Chrome</title><style>
body{max-width:720px;margin:48px auto;padding:0 24px;background:#101014;color:#eee;font:16px/1.6 system-ui}
h1{color:#fb923c}code,input{font-family:monospace}input{display:block;box-sizing:border-box;width:100%;padding:12px;background:#202026;color:#fff;border:1px solid #555;border-radius:6px}button{margin:12px 8px 12px 0;padding:10px 16px;cursor:pointer}code{overflow-wrap:anywhere}li{margin-bottom:12px}
</style></head><body><h1>Pair OpenCode in Chrome</h1>
<p>This page is local and contains your private pairing token. Do not share it, screenshot it, or upload it.</p>
<ol><li>In a dedicated Chrome profile, open <code>chrome://extensions</code> and enable Developer mode.</li>
<li>Choose <strong>Load unpacked</strong> and select <code>${escape(root)}/extension</code>.</li>
<li>Open the extension toolbar popup. Set its URL to <code>http://127.0.0.1:${config.port}</code>.</li>
<li>Copy the token below into the popup, choose <strong>Save &amp; enable browser</strong>, and accept the website permission prompt.</li>
<li>In the target project's OpenCode session, open <code>/mcps</code> and connect <code>chrome</code>. The popup should say <strong>Ready — sessions can open tabs</strong>.</li></ol>
<label for="token">Pairing token</label><input id="token" type="password" readonly value="${config.token}" autocomplete="off">
<button id="copy">Copy token</button><button id="reveal">Show / hide token</button><span id="result" role="status"></span>
<p>After pairing, run <code>npm run doctor</code> from the extension repository. You can close or delete this page; regenerate it with <code>npm run pair</code> if needed.</p>
<script>
const token=document.getElementById('token');
document.getElementById('reveal').onclick=()=>{token.type=token.type==='password'?'text':'password'};
document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(token.value);document.getElementById('result').textContent='Copied'}catch{token.type='text';token.select();document.getElementById('result').textContent='Press Ctrl+C (or Cmd+C) to copy'}};
</script></body></html>`;
}

export async function writePairingPage(config, root, filename) {
  await writeFile(filename, pairingHTML(config, root), { mode: 0o600 });
  await chmod(filename, 0o600);
}
