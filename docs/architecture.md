# Architecture

```text
OpenCode conversation
  └─ MCP stdio (session ID in ai.opencode/sessionID metadata)
      └─ stdio adapter → shared Node daemon, bound to 127.0.0.1
          └─ authenticated WebSocket /browser, protocol version 2
              └─ Chrome service worker
                  └─ session-owned tabs + isolated-world content scripts
```

## Modules

| Path                           | Responsibility                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `bridge/config.js`             | Validate/read/write local credentials; validate setup options                         |
| `bridge/setup.js`              | Generate credentials and print project-local MCP registration                         |
| `bridge/main.js`               | Start HTTP and stdio MCP transports; manage process shutdown                          |
| `bridge/shared-main.js`        | Start/reuse the daemon and expose stdio MCP for each project                          |
| `bridge/shared-process.js`     | Authenticated daemon discovery, race-safe startup, and port-conflict refusal          |
| `bridge/shared-client.js`      | Forward validated tool calls and cancellation to the shared daemon                    |
| `bridge/shared-server.js`      | Authenticated shared tool endpoint, fixed schemas, one BrowserHub, and shutdown       |
| `bridge/http.js`               | Enforce loopback host/origin/token boundaries and validate handshakes                 |
| `bridge/hub.js`                | Route sessions, track generations and pending calls, forward cancellation             |
| `bridge/tools.js`              | Fixed MCP schemas, descriptions, and result conversion                                |
| `extension/background.js`      | Pairing/settings, authentication lifecycle, per-session command queues, Chrome events |
| `extension/session-browser.js` | Owned-tab lifecycle, persistence, generation checks, script execution, visual marking |
| `extension/content.js`         | Page snapshots, scoped element refs, fixed DOM actions, orange overlay/cursor         |
| `extension/popup.*`            | One-time pairing and global enable/disable controls                                   |

There is no build step, arbitrary page-evaluation tool, or conversation UI in the extension.

## Installation and release tools

`scripts/install.js` uses `installation.js` to validate an explicit target directory, bootstrap missing dependencies through npm, preserve local pairing settings, check conflicting listeners, and call OpenCode's registration CLI without rewriting project configuration. It copies the reusable installation skill into the target project's `.opencode/skills/` directory and refuses to overwrite a differing skill.

With `--global`, it registers `bridge/shared-main.js` globally and does not write a project-local skill. Package-runner installations use one user-wide permanent directory in global mode and per-project directories otherwise. The installed daemon path is always permanent, never the package-runner cache.

`scripts/pair.js` creates a private local pairing page from validated configuration. It opens through the operating system's default browser launcher with no shell interpolation. The user transfers the token into Chrome directly. `scripts/doctor.js` uses `diagnostics.js` for safe human/JSON reports; it does not log response bodies, account URLs, or tokens. `bridge/listen.js` supplies actionable startup errors for occupied ports and denied listeners.

`scripts/package.js` uses `archives.js` to build deterministic standalone-project and extension-only ZIPs plus checksums. A source allowlist excludes private/runtime directories; symlinks are rejected. Tagged releases run all platform checks before publication. Package/manifest/tag versions must agree.

## Connection lifecycle

1. The worker restricts storage to trusted extension contexts and restores session-owned tabs from `chrome.storage.session`. It starts suspended and invalidates old generations.
2. It connects to the configured loopback URL, rechecks website permission, and sends `hello` with the token, enabled preference, and ownership bindings.
3. The bridge checks host/origin, authenticates the token, and validates all ownership bindings before replacing a connected browser. It replies `ready`.
4. Only after `ready` does the worker enable controls. The bridge accepts MCP commands only for protocol version 2 while browser access is enabled.
5. Disconnect suspends page controls, changes generations, rejects pending bridge calls, and schedules reconnection. Pairing changes also suspend controls before reconnecting.

The standalone bridge supports one browser connection and one stdio MCP client. In global mode, every project gets a stdio MCP adapter, and all adapters forward authenticated HTTP `/call` requests to one daemon. Concurrent startup attempts rely on exclusive loopback port binding: one daemon wins, and all adapters reuse its authenticated status. A mismatched token, standalone listener, or unrelated process is never terminated or replaced.

The daemon validates session metadata, fixed tool names and input schemas, and a 128 KiB request-body limit. Closing an adapter does not stop the daemon. Cancelling a call aborts its HTTP request; the response-close event aborts the corresponding BrowserHub action and forwards cancellation to Chrome. There is no automatic action retry. An authenticated `/shutdown` endpoint cancels pending work, closes Chrome, and stops the listener. Each new tool call checks daemon availability before dispatch, and the next call or adapter startup launches a fresh daemon if needed. The extension can restore session-owned bindings on reconnect; an early call fails safely until Chrome connects.

## Commands, cancellation, and refs

The bridge attaches a random request ID, session generation, and 25-second deadline. The worker queues commands per session; different sessions can run concurrently. SessionBrowser checks ownership and generation before work and after asynchronous boundaries. Content actions recheck enabled state, cancellation, snapshot revision, and DOM validity after the cursor animation before interaction.

`read_page` creates a fresh ref map. A monotonically increasing ref counter avoids accidentally reusing old names; snapshot revision checks also stop a pending action when a new snapshot replaces its map. Document IDs and URL checks prevent refs crossing documents or same-document navigation.

For `click`, the content script prepares viewport CSS coordinates from a visible, unobstructed client rectangle without calling `el.click()`. The worker validates the original ref, document, snapshot/control revisions, and hit target, attaches `chrome.debugger` to the owned tab, and dispatches mouse movement. It revalidates after hover handlers before sending press/release, checks cancellation/generation/expiry between operations, and detaches in cleanup. Attachment failures never fall back to DOM clicks. The result is `{ tabID, dispatched: true, applicationAccepted: null }`, not an application-state assertion. Once a press is attempted, errors warn that the page may already have changed; no retry is automatic. DOM validation and browser input remain separate operations, so page changes can still race dispatch.

MCP cancellation and timeouts send `cancel` to the worker. Queued work is marked cancelled; executing page interactions receive an extension message. Disable and disconnect notify all owned tabs. These are best-effort stops, not rollback: an already-issued Chrome call or network request may complete.

## Persistence and trust

- `.local/config.json`: token and port; ignored by Git.
- `.local/mcp-config.json`: generated machine-specific OpenCode registration; ignored by Git.
- `chrome.storage.local`: pairing and enabled preference; restricted to trusted contexts.
- `chrome.storage.session`: temporary ownership, current tab, group IDs, and generations; cleared by a Chrome browser restart.
- Bridge memory: pending requests, routing bindings, and the last 100 activity summaries.

Session ownership is a tab-targeting boundary, not account isolation. Session IDs are trusted MCP routing metadata, not credentials. Page content is untrusted data. See [SECURITY.md](../SECURITY.md) for the complete threat model.

## Tab inspection

`bridge/inspection-tools.js` defines opt-in inspection and bounded network/console/profile tools. `extension/inspections.js` scopes event buffers to session/tab/generation, sanitizes captured metadata and invalidates IDs on navigation. `inspection-profiles.js` uses fixed CPU profiler commands and a bundled isolated-world PerformanceObserver helper, not global Chromium tracing. `inspection-privacy.js` bounds and redacts output.

`debugger-sessions.js` coordinates reference-counted attachments across clicks, recording and inspection, including pending-attach cancellation and detach invalidation. `bridge/inspection-artifacts.js` persists sanitized profiles/timelines at generated private local paths and returns only paths/summaries. See [inspection contract](inspection.md).

## Verified recordings

`bridge/recording-tools.js` declares strict schemas for an immutable task plan and start/run/finish/cancel tools. `extension/recordings.js` scopes plans to a session-owned tab, checks ordered preconditions/postconditions, and accepts only verified segments. `recording-capture.js` temporarily attaches the debugger, captures bounded JPEG screencast frames, and shares its attachment with the existing guarded click path. Nested actions inherit parent cancellation and must stay in that same tab.

`recording-offscreen.js` receives authenticated extension-only encoding messages. `video-encoder.js` samples accepted segments onto a captioned canvas, encodes VP8 through WebCodecs, and `webm.js` builds the container with a deterministic timeline. `bridge/recording-artifacts.js` saves video/manifest into generated private `.local/recordings/` directories before returning only paths. No capture happens outside planned steps; excluded attempts are counted, not rolled back. See [recordings](recordings.md) for the contract and limitations.

## Verification

`npm run check` runs lint, formatting, metadata checks, and automated tests. Tests cover authenticated transport with a real MCP client/server pair, session ownership with a simulated Chrome API, the worker readiness lifecycle, configuration validation, and DOM/cancellation behavior with jsdom. `CHROME_BINARY=/path/to/chrome npm run test:browser` uses an isolated real Chrome profile and local page to verify trusted pointer/mouse events and hit-testing. Its scripting/debugger adapter drives the same SessionBrowser click path through a test CDP connection; actual extension attachment and permission prompts still require the manual smoke test in [CONTRIBUTING.md](../CONTRIBUTING.md).
