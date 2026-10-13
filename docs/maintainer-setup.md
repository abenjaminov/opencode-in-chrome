# Repository owner settings

The repository is maintained at [asaf-labs/opencode-in-chrome](https://github.com/asaf-labs/opencode-in-chrome). It includes MIT licensing, CODEOWNERS, checks, dependency updates, and tagged release automation. The GitHub settings below require **repository admin access**; contributor push access is not enough.

## Protect main

Classic branch protection for `main` is configured with the following requirements. Manage it under **Settings → Branches**; equivalent rules can also be implemented with an active ruleset:

- Require a pull request before merging.
- Require one approving review; dismiss stale approvals when new commits are pushed.
- Require code-owner review. `.github/CODEOWNERS` names `@abenjaminov` and `@AsafBenjaminov`; update it when the maintainer team changes. GitHub accepts an eligible code owner's approval; it does not require every listed owner to approve.
- Require status checks `test (ubuntu-latest)` and `test (windows-latest)`; require the branch to be up to date.
- Block force pushes and branch deletion.
- Administrators are included in enforcement. An author cannot approve their own PR; required reviews need another eligible reviewer. Future changes should use reviewed PRs, not direct pushes to `main`.

Do not treat the presence of CODEOWNERS or a green badge as evidence that these rules are enforced.

## Private vulnerability reporting

**Private vulnerability reporting is enabled.** Submit confidential reports through [Report a vulnerability](https://github.com/asaf-labs/opencode-in-chrome/security/advisories/new). Manage the feature under **Settings → Security → Code security**. Set up maintainer notifications so reports receive a response.

If GitHub reporting is unavailable, add an actual private maintainer contact to SECURITY.md. Do not use a public bug report for tokens or exploit details.

## Discoverability

The repository's **About** panel is configured as follows:

- Description: `Session-owned Chrome tabs for OpenCode: authenticated local MCP, visible agent cursor, and easy project setup.`
- Website: `https://github.com/asaf-labs/opencode-in-chrome#readme`
- Topics: `opencode`, `chrome-extension`, `mcp`, `browser-automation`, `ai-agents`.

The README includes an explicitly labeled illustration. Replace or supplement it with an actual short demo showing a public test page, the orange cursor, owned tab groups, and the setup popup. Hide tokens, private tabs, and account information in recordings.

## Release permissions

Tagged releases use `.github/workflows/release.yml`. Ensure Actions are enabled and organization policies permit that job's `contents: write` permission. Only publish after both platform checks pass. Push a tag matching package and Chrome versions, such as `v0.4.0`; the workflow creates the release, source/extension archives, checksums, and changelog-based notes.
