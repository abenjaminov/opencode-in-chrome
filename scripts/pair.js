import path from 'node:path';
import { spawn } from 'node:child_process';
import { readConfig } from '../bridge/config.js';
import { repositoryRoot } from './installation.js';
import { writePairingPage } from './pairing.js';

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--no-open'))
    throw new Error('Usage: npm run pair -- [--no-open]');
  const filename = path.join(repositoryRoot, '.local/pairing.html');
  await writePairingPage(await readConfig(), repositoryRoot, filename);
  console.log(`Local pairing page: ${filename}`);
  console.log(
    'Contains a private token. Open it locally; do not share it or read it into agent context.',
  );
  if (!args.includes('--no-open')) {
    const command =
      process.platform === 'win32'
        ? 'explorer.exe'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';
    const child = spawn(command, [filename], { detached: true, stdio: 'ignore', shell: false });
    child.on('error', () =>
      console.error(
        'Could not open the browser automatically. Open the local pairing page yourself.',
      ),
    );
    child.unref();
  }
} catch (error) {
  console.error(
    `Pairing page failed: ${error.code === 'ENOENT' ? 'Run the installer or npm run setup first.' : error.message}`,
  );
  process.exitCode = 1;
}
