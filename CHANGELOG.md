# Changelog

## Unreleased

- Add session-owned network inspection, redacted headers and opt-in bodies, console/error logs, bounded CPU profiles, and main-frame performance timeline trace exports.
- Coordinate debugger leases across inspection, clicks and recordings, with bounded buffers, automatic expiry, navigation invalidation and cleanup on disable/disconnect.
- Add real-Chrome diagnostics regression and fix the shared request schema for the Zod 4 dependency now on main.
- Add self-declared, immutable task plans with verified step capture and local WebM/action-manifest export; exclude failed attempts while transparently labelling edited walkthroughs.
- Add deterministic selector-based actions, observable pre/postconditions and goal checks, recording cancellation, bounded capture, and private artifacts without FFmpeg or automatic replay.
- Add the offscreen permission for built-in WebCodecs encoding and a real Chrome recording regression with a failed attempt excluded.
- Replace synthetic DOM clicks with hit-tested browser-level mouse movement, press, and release using the Chrome debugger API on session-owned tabs.
- Report clicks as dispatched with application acceptance unknown; revalidate after hover handlers and warn about uncertain outcomes after mouse-down.
- Add the debugger permission and document extension reload, debugging banners, and DevTools conflicts.
- Add a real Chrome regression for trusted pointer handlers and dropdown selection, plus stale/covered-target and cancellation tests.

## 0.6.0

- Add `install --global` for automatic Chrome tools in every OpenCode project through one shared per-user daemon.
- Start the daemon on demand and reuse it across concurrent project adapters without port conflicts or per-project pairing.
- Preserve conversation-owned tabs, authenticated loopback access, fixed tool schemas, and cancellation across the shared transport.
- Keep the daemon alive when adapters close, provide explicit shared shutdown, and refuse to replace unrelated listeners.
- Add concurrent multi-project, startup-race, authentication, cancellation, reconnect, and global-installer tests.

## 0.5.0

- Add a publishable CLI for `npx` and `bunx` that defaults to the current project and keeps runtime files outside package-runner caches.
- Preserve existing installations and pairing settings, isolate permanent installations per project, and refuse to replace an existing Chrome MCP on first install.
- Ship a publishable dependency lockfile and install only runtime dependencies without lifecycle scripts.
- Automatically select macOS, Windows, or Linux pairing instructions with accessible tabs and an extension-folder copy button.
- Explain macOS folder selection with Command + Shift + G and retry MCP readiness while the server starts.
- Add CLI and package-distribution tests and macOS CI coverage.

## 0.4.0

- Add MIT licensing, code ownership rules, and owner instructions for protected branches and confidential vulnerability reporting.
- Add a one-command project installer that installs missing dependencies, preserves pairing, registers MCP through OpenCode's CLI, and installs a reusable agent skill.
- Add a private local pairing page with clipboard support; installer and diagnostics never print the pairing token.
- Add `npm run doctor` with human-readable and JSON readiness reports, plus actionable port-conflict startup errors.
- Publish reproducible standalone-project and extension-only ZIPs with SHA-256 checksums through tagged-release automation.
- Add a labeled control illustration, easier onboarding, and contributor/release instructions.

## 0.3.2

- Keep page controls suspended until the bridge acknowledges authentication, including pairing and reconnection.
- Prevent a new snapshot from reviving a delayed interaction using old element refs.
- Reject malformed ownership data before replacing an authenticated browser connection.
- Validate missing/invalid command expiry instead of accepting commands without deadlines.
- Share bridge configuration validation between startup and setup; support `--port` and tighten existing POSIX token-file permissions.
- Add a supervised OpenCode V2 permission example and architecture documentation.
- Add ESLint, Prettier, editor defaults, version checks, dependency-update automation, and Windows/Linux quality checks.

## 0.3.1

Initial standalone repository release:

- Twelve MCP tools for automatically created session-owned Chrome tabs.
- Orange tab groups, page indicators, target highlights, and an independent agent cursor.
- Authenticated localhost transport and trusted-context-only credential storage.
- Disconnect suspension, disable controls, cancellation forwarding, command expiry, and stale element refs.
- Installation instructions, security model, and Windows/Linux tests.
