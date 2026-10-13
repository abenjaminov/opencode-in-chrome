# Changelog

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
