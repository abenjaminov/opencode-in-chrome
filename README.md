# OpenCode in Chrome — session-owned browser tabs

A Manifest V3 Chrome extension and local MCP bridge. Once paired and enabled, an OpenCode conversation can create and control its own tabs automatically. The extension has a small setup popup; the conversation stays in OpenCode.

```text
OpenCode session → MCP stdio → localhost bridge → extension → session-owned Chrome tabs
```

New tabs use your normal Chrome profile and its existing logins. Cookies stay in Chrome.

## Visible agent control

Session-owned tabs are marked with an **orange OpenCode tab group**, with a short session identifier. The page shows **OpenCode · Tab under agent control** in the upper-right corner.

During clicks, typing, dropdown changes, and checkbox actions, a separate **orange agent cursor** moves to the target, highlights the element, and pulses as the action is performed. Scrolling also displays the agent cursor. This is a page overlay; it does not move or follow your actual mouse pointer and does not intercept your clicks.

Disabling browser access removes the page overlay and changes its tab group to grey. After upgrading, reload the extension in `chrome://extensions` and accept the tab-group permission if Chrome prompts. Existing owned tabs regain their indicators automatically.

Requires [Node.js](https://nodejs.org/) 24+, Chrome 120+, and [OpenCode **V2**](https://opencode.ai/v2/docs/) configured with a model provider. JavaScript ES modules run without a build step.

**Security:** new tabs share the Chrome profile's signed-in accounts. Start with a dedicated Chrome profile and read [SECURITY.md](SECURITY.md) for risks, implemented safeguards, and token rotation. Session-owned tabs are not an account sandbox.

## Install

Clone the repository into a permanent location, then install dependencies:

```sh
git clone https://github.com/abenjaminov/opencode-in-chrome.git
cd opencode-in-chrome
npm ci
npm run setup
```

On Windows, use `npm.cmd` if PowerShell's execution policy blocks `npm`:

```powershell
npm.cmd ci
npm.cmd run setup
```

Setup creates ignored `.local/config.json` with a random pairing `token` and localhost `port` (default `8790`). It prints the URL, token, and exact MCP registration command. Running setup again preserves your token. `.local/mcp-config.json` contains an equivalent OpenCode V2 configuration snippet.

Run the printed command from the OpenCode project that should have these browser tools:

```powershell
opencode mcp add chrome -- "C:\path\to\node.exe" "C:\path\to\opencode-in-chrome\bridge\main.js"
opencode mcp list
```

OpenCode starts the bridge over stdio. Keep OpenCode running; do not start a second bridge with `npm start` on the same port.

On Linux/macOS the printed command uses the corresponding absolute Node and repository paths. For example:

```sh
opencode mcp add chrome -- /usr/local/bin/node /home/me/opencode-in-chrome/bridge/main.js
```

Use the command printed by setup instead of copying these illustrative paths. Verify your installation with `node --version`, `opencode --version`, and `opencode mcp list`.

The registration is project-local: all conversations in that configured project can use the browser tools. One bridge process per port is supported. Concurrent bridge instances in different project locations need separate ports/configurations; global registration is not a shared-daemon setup.

## One-time Chrome setup

1. Open `chrome://extensions` in your regular profile and enable **Developer mode**.
2. Click **Load unpacked**, selecting this folder's **`extension`** subfolder.
3. Click the extension's toolbar icon.
4. Enter the bridge URL and pairing token, then click **Save & enable browser**.
5. Accept Chrome's website-access permission prompt. The popup should say **Ready — sessions can open tabs**.
6. Close the popup and use your usual OpenCode conversation.

For example: **“Open a new tab, search for dbt, and summarize the results.”**

No session selection or manual tab connection is needed. The calling OpenCode session is identified by its `ai.opencode/sessionID` MCP metadata. OpenCode's own tool permissions continue to apply in its normal interface.

## Upgrade from the original side-panel version

Reload the extension in `chrome://extensions`, close the old side panel, and open the toolbar popup once. Your URL/token are retained. Click **Save & enable browser** and accept the updated website permission. Reconnect `chrome` in OpenCode's `/mcps` interface to reload the bridge if it has not already been restarted.

The original manually connected tabs are released from automation. They remain open and are not adopted as session-owned tabs.

## Tools

| Tool | Behavior |
| --- | --- |
| `open_tab` | Create a new session-owned tab at an optional HTTP/HTTPS URL; defaults to `about:blank` |
| `list_tabs` | List this session's own tabs and its current tab |
| `focus_tab` | Activate an owned tab and make it the session's current tab |
| `close_tab` | Close an owned tab |
| `navigate` | Navigate an owned tab to HTTP/HTTPS |
| `read_page` | Page title, URL, up to 40,000 characters of text, and 300 visible interactive elements with refs |
| `click` / `type` | Click or replace editable text using element refs |
| `select` / `check` | Set native dropdown or checkbox/radio values |
| `scroll` | Scroll vertically |
| `screenshot` | Activate an owned tab and capture its viewport as an MCP image |

Operations accept an optional `tabID`; when omitted, they target this session's current tab. `open_tab` returns the new ID. Use explicit IDs when working across several tabs. Start with `read_page` before interacting; refs belong to that tab's latest snapshot and expire after another snapshot or navigation.

Tabs opened by links/popups from an owned tab inherit that session's ownership. Closing an owned tab removes it from the session's list. Ownership survives extension-worker and bridge reconnections while Chrome is running. Chrome browser restarts clear these temporary ownership records; restored personal tabs are not adopted.

## Controls and boundaries

- The toolbar popup has **Disable browser access** to stop new automation and invalidate queued commands. **Save & enable browser** restores access.
- Each session can manipulate only tabs it created, including child tabs. Existing personal tabs and other sessions' tabs are excluded from tool access.
- The extension requests optional website access once so created tabs can navigate across sites and screenshots work without a toolbar click on each new tab. No cookie-reading permission is requested.
- The bridge binds only localhost, authenticates HTTP/WebSocket traffic with the pairing token, and requires session metadata for tools.
- Pairing storage is restricted to trusted extension contexts. Disable, bridge disconnect, and MCP cancellation invalidate pending work and notify content scripts. Actions already completed cannot be undone.
- Main-frame DOM interactions and viewport screenshots are supported. Cross-origin frames, file uploads, trusted keyboard/pointer input, and console/network inspection are not implemented. Some sites reject synthetic DOM input. Chrome internal and other protected pages cannot be scripted.

## Troubleshooting

- **Bridge disconnected:** check `opencode mcp list`, the URL/token, and whether another process is using port 8790.
- **Reload/enable message:** reload the extension and click **Save & enable browser** in its popup.
- **Tool missing:** reconnect `chrome` in OpenCode's `/mcps` interface. Tools are available to sessions whose project has this MCP server configured.
- **Tab not owned:** call `open_tab` or use a tab ID returned by `list_tabs` for the calling session.
- **Page changed/ref expired:** call `read_page` again.
- **Changed bridge code:** reconnect `chrome` in OpenCode. **Changed extension code:** reload it in `chrome://extensions`.

## Verify

```powershell
npm.cmd test
```

Tests exercise real MCP discovery/calls over authenticated WebSocket transport, automatic session tab creation, multi-tab operations, cross-session/personal-tab isolation, reconnect persistence, disabling, stale refs, and DOM form interaction. A browser smoke test requires loading the unpacked extension in Chrome.

GitHub Actions runs the test suite on Windows and Linux with Node.js 24. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and smoke-test instructions.

## Update or uninstall

To update: pull the repository changes, run `npm ci`, reload the unpacked extension, and reconnect `chrome` in OpenCode. Pairing settings are preserved.

To uninstall: disable browser access, disconnect `chrome` in OpenCode, remove only its `mcp.servers.chrome` configuration entry, and remove the extension at `chrome://extensions`. Delete `.local/` if you also want to discard the token. Tabs created by the agent remain open for you to close normally.
