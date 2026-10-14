import { readConfig } from '../bridge/config.js';

try {
  const config = await readConfig();
  const response = await fetch(`http://127.0.0.1:${config.port}/shutdown`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(3000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error('The shared bridge could not be stopped. No settings were changed.');
  console.log(
    'Shared Chrome bridge stopped. The next Chrome tool call or adapter connection starts it again.',
  );
} catch (error) {
  console.error(`Stop failed: ${error.message}`);
  process.exitCode = 1;
}
