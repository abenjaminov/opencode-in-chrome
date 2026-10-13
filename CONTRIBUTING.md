# Contributing

Use Node.js 24+ and run:

```sh
npm ci
npm run check
```

There is no build step. The unpacked Chrome extension lives in `extension/`; the Node MCP bridge lives in `bridge/`. Tests use Node's test runner, a real MCP client/server pair, a simulated Chrome API, and jsdom for DOM interaction.

Use `npm run format` to apply Prettier and `npm run lint` for ESLint. `npm run check` also validates package/lockfile/Chrome version consistency and runs all tests. Keep JavaScript ES modules and two-space indentation. Runtime MCP version is read from `package.json`.

See [architecture](docs/architecture.md) for module boundaries and connection lifecycle. To bump a release, run `npm version <version> --no-git-tag-version`, update `extension/manifest.json` to match, and add a changelog entry.

When changing the extension, reload it at `chrome://extensions`. When changing bridge code, reconnect the `chrome` server in OpenCode's `/mcps` interface. After changing permissions, Chrome may require enabling the extension again.

## Pull requests

- Keep browser tools limited to session-owned tabs.
- Test changes that affect ownership, authentication, cancellation, or persistence.
- Preserve the distinction between page content (untrusted data) and extension code.
- Explain added Chrome permissions and their effects on the security model.
- Do not commit `.local/`, pairing tokens, local OpenCode configuration, browser-profile data, scraped private information, or screenshots containing account identifiers.
- Document behavior/installation changes in README.md and security changes in SECURITY.md.

For a manual smoke test, use the public sandbox at `https://www.scrapethissite.com/`. Verify automatic tab creation, reading, form interaction, the orange agent cursor, disable/re-enable, and reconnect. Use a dedicated browser profile for testing changes.
