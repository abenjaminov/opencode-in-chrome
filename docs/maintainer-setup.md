# Repository owner settings

The repository code includes MIT licensing, CODEOWNERS, checks, dependency updates, and tagged release automation. The following GitHub settings require **repository admin access**. A contributor with push access cannot enable them. They have not been enabled by the code changes alone.

## Protect main

In **Settings → Rules → Rulesets**, create an active branch ruleset targeting `main` (or use classic branch protection):

- Require a pull request before merging.
- Require one approving review; dismiss stale approvals when new commits are pushed.
- Require code-owner review. `.github/CODEOWNERS` names `@abenjaminov`; update it when the maintainer team changes.
- Require status checks `test (ubuntu-latest)` and `test (windows-latest)`; require the branch to be up to date.
- Block force pushes and branch deletion.
- Decide whether maintainers need an explicit bypass for emergencies or solo maintenance. An author cannot approve their own PR; required reviews need another eligible reviewer.

Do not treat the presence of CODEOWNERS or a green badge as evidence that these rules are enforced.

## Private vulnerability reporting

In **Settings → Security → Code security**, enable **Private vulnerability reporting**. The Security tab should then offer **Report a vulnerability**. Confirm the feature is enabled before advertising a private reporting link. Set up maintainer notifications so reports receive a response.

If GitHub reporting is unavailable, add an actual private maintainer contact to SECURITY.md. Do not use a public bug report for tokens or exploit details.

## Discoverability

Edit the repository's **About** panel:

- Description: `Session-owned Chrome tabs for OpenCode: authenticated local MCP, visible agent cursor, and easy project setup.`
- Website: `https://github.com/abenjaminov/opencode-in-chrome#readme`
- Topics: `opencode`, `chrome-extension`, `mcp`, `browser-automation`, `ai-agents`.

The README includes an explicitly labeled illustration. Replace or supplement it with an actual short demo showing a public test page, the orange cursor, owned tab groups, and the setup popup. Hide tokens, private tabs, and account information in recordings.

## Release permissions

Tagged releases use `.github/workflows/release.yml`. Ensure Actions are enabled and organization policies permit that job's `contents: write` permission. Only publish after both platform checks pass. Push a tag matching package and Chrome versions, such as `v0.4.0`; the workflow creates the release, source/extension archives, checksums, and changelog-based notes.
