import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { configURL as defaultConfigURL } from './config.js';
import { portAvailable } from '../scripts/diagnostics.js';

export async function sharedStatus(config) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${config.port}/status`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(1000),
      redirect: 'error',
    });
  } catch {
    return null;
  }
  if (response.status !== 200)
    throw new Error(
      `Port ${config.port} is occupied by another bridge or service. Disconnect it or choose a different port; nothing was stopped.`,
    );
  const status = await response.json();
  if (status.mode !== 'shared' || typeof status.bridgeID !== 'string')
    throw new Error(
      `Port ${config.port} is not a shared Chrome bridge. Disconnect the project-local bridge before enabling global mode.`,
    );
  return status;
}

export async function ensureSharedDaemon(
  config,
  { configURL = defaultConfigURL, daemonURL = new URL('./shared-daemon.js', import.meta.url) } = {},
) {
  const running = await sharedStatus(config);
  if (running) return running;
  if (!(await portAvailable(config.port))) {
    const raced = await sharedStatus(config);
    if (raced) return raced;
    throw new Error(
      `Port ${config.port} is occupied but the shared bridge is unreachable. No process was stopped.`,
    );
  }
  const child = spawn(
    process.execPath,
    [fileURLToPath(daemonURL), '--config', fileURLToPath(configURL)],
    {
      cwd: fileURLToPath(new URL('../', daemonURL)),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  for (let attempt = 0; attempt < 50; attempt++) {
    await setTimeout(100);
    const ready = await sharedStatus(config);
    if (ready) return ready;
  }
  throw new Error(
    'Shared Chrome bridge did not start. Run npm run doctor from its installation directory.',
  );
}
