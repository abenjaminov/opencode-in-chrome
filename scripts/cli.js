#!/usr/bin/env node
import { installFromPackage, parseCLIOptions } from './cli-installation.js';

try {
  const options = parseCLIOptions(process.argv.slice(2));
  if (options.help) {
    console.log(
      'Usage: opencode-in-chrome install [--project <directory>] [--port <port>] [--no-open]',
    );
    console.log(
      'Installs permanently for the current project and opens private pairing instructions.',
    );
    console.log(
      'Requires Node.js 24+, npm, Chrome 120+, and OpenCode V2. Bun can launch the CLI via bunx; do not use --bun.',
    );
  } else {
    const result = await installFromPackage(options);
    console.log(`\nChrome MCP registered for: ${result.project}`);
    console.log(`Permanent installation: ${result.root}`);
    console.log(
      'Complete the local pairing page in a dedicated Chrome profile. Do not share its token.',
    );
    console.log(`Verify from the installation directory: npm run doctor`);
    console.log('MCP connected does not mean Chrome is paired and enabled yet.');
  }
} catch (error) {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
}
