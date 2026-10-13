import { install, parseInstallOptions } from './installation.js';

try {
  const options = parseInstallOptions(process.argv.slice(2));
  if (options.help) {
    console.log(
      'Usage: npm run install:opencode -- --project <existing-project-directory> [--port 8790]',
    );
    console.log(
      'Installs missing dependencies, preserves pairing settings, registers project-local MCP, and copies the installation skill. Does not print the token.',
    );
  } else {
    const result = await install(options);
    console.log(`\nChrome MCP registered for: ${result.project}`);
    console.log(`Bridge URL: http://127.0.0.1:${result.port}`);
    console.log(`Installation skill: ${result.skillPath}`);
    console.log(
      `\nNext: run npm run pair from ${result.root} for private, local pairing instructions.`,
    );
    console.log(
      "Load this checkout's extension/ folder in a dedicated Chrome profile and complete the popup permission prompt.",
    );
    console.log('Then run npm run doctor. MCP connected and Chrome ready are separate checks.');
    console.log(
      'If switching projects, disconnect chrome in the old project before connecting it in the new project.',
    );
  }
} catch (error) {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
}
