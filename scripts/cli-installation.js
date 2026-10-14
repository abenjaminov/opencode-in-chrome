import { glob, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { install, parseInstallOptions, repositoryRoot, runCommand } from './installation.js';

export function parseCLIOptions(args, cwd = process.cwd()) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') return { help: true };
  if (args[0] !== 'install') throw new Error('Expected install. Run opencode-in-chrome --help.');
  const noOpen = args.includes('--no-open');
  const installArgs = args.slice(1).filter((arg) => arg !== '--no-open');
  if (!installArgs.includes('--project')) installArgs.push('--project', cwd);
  return { ...parseInstallOptions(installArgs), noOpen };
}

export function installationDirectory(
  project,
  { platform = process.platform, home = homedir(), env = process.env } = {},
) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const base =
    platform === 'darwin'
      ? paths.join(home, 'Library', 'Application Support')
      : platform === 'win32'
        ? env.LOCALAPPDATA || paths.join(home, 'AppData', 'Local')
        : env.XDG_DATA_HOME && paths.isAbsolute(env.XDG_DATA_HOME)
          ? env.XDG_DATA_HOME
          : paths.join(home, '.local', 'share');
  const identity = platform === 'win32' ? project.toLowerCase() : project;
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 16);
  return paths.join(base, 'opencode-in-chrome', 'projects', hash);
}

export async function findNpmCLI({ execPath = process.execPath, env = process.env } = {}) {
  const directory = path.dirname(execPath);
  const candidates = [
    env.npm_execpath,
    path.resolve(directory, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.join(directory, 'node_modules/npm/bin/npm-cli.js'),
  ];
  for (const entry of (env.PATH || env.Path || '').split(path.delimiter)) {
    if (!entry) continue;
    candidates.push(path.join(entry, 'npm'), path.join(entry, 'node_modules/npm/bin/npm-cli.js'));
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    const filename = await realpath(candidate).catch(() => null);
    if (filename && path.basename(filename) === 'npm-cli.js') return filename;
  }
  throw new Error('npm was not found. Install Node.js 24+ with npm, then rerun npx or bunx.');
}

async function installationPayload(source) {
  const pkg = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const files = new Set(['package.json', 'README.md', 'LICENSE']);
  for await (const filename of glob(pkg.files, { cwd: source })) {
    if (filename !== 'npm-shrinkwrap.json') files.add(filename);
  }
  const payload = new Map();
  for (const filename of files) {
    if ((await lstat(path.join(source, filename))).isSymbolicLink())
      throw new Error(`Installation does not follow symlinks: ${filename}`);
    payload.set(filename, await readFile(path.join(source, filename)));
  }
  const lock = await readFile(path.join(source, 'package-lock.json')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return readFile(path.join(source, 'npm-shrinkwrap.json'));
  });
  payload.set('package-lock.json', lock);
  return payload;
}

export async function prepareInstallation(source, root, project) {
  const payload = await installationPayload(source);
  const markerPath = path.join(root, '.installer.json');
  const marker = await readFile(markerPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (marker !== null) {
    if (JSON.parse(marker).project !== project)
      throw new Error('This installation belongs to another project. No files were changed.');
    for (const [filename, bytes] of payload) {
      const target = path.join(root, filename);
      if ((await lstat(target)).isSymbolicLink() || !(await readFile(target)).equals(bytes))
        throw new Error(
          'An existing installation has different code. Keep using it or move it aside before upgrading; no files were changed.',
        );
    }
    return;
  }
  await mkdir(path.dirname(root), { recursive: true });
  try {
    await mkdir(root);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(
      'The installation directory already exists without an installer marker. No files were changed.',
      { cause: error },
    );
  }
  for (const [filename, bytes] of payload) {
    const target = path.join(root, filename);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  await writeFile(markerPath, JSON.stringify({ project }) + '\n', { flag: 'wx' });
}

export async function installFromPackage(
  options,
  {
    source = repositoryRoot,
    run = runCommand,
    installProject = install,
    locateNpm = findNpmCLI,
    directory = installationDirectory,
    nodeVersion = process.versions.node,
    bunVersion = process.versions.bun,
  } = {},
) {
  if (bunVersion)
    throw new Error('Use bunx without --bun; the bridge requires the Node.js runtime.');
  if (Number(nodeVersion.split('.')[0]) < 24)
    throw new Error(
      'Node.js 24+ is required. Install it from https://nodejs.org/; your default Node version is not changed by this installer.',
    );
  const project = await realpath(options.project);
  const version = run('opencode', ['--version'], project, { capture: true });
  if (!/\b(?:opencode\s+)?v?2\./.test(stripVTControlCharacters(version.stdout || '')))
    throw new Error('OpenCode V2 is required. Install it from https://opencode.ai/v2/docs/.');
  const root = directory(project);
  const listing = run('opencode', ['mcp', 'list'], project, { capture: true });
  const ownsInstallation = await lstat(path.join(root, '.installer.json'))
    .then(() => true)
    .catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return false;
    });
  if (
    !ownsInstallation &&
    /^\s*(?:[✓✔●✗×]\s*)?chrome\b/m.test(stripVTControlCharacters(listing.stdout || ''))
  )
    throw new Error(
      'chrome MCP is already configured. Reuse its existing checkout or remove only that registration before installing a new bridge.',
    );
  const npmCLI = await locateNpm();
  await prepareInstallation(source, root, project);
  const result = await installProject({ ...options, project, root, npmCLI, run });
  run(
    process.execPath,
    [path.join(root, 'scripts/pair.js'), ...(options.noOpen ? ['--no-open'] : [])],
    root,
  );
  return result;
}
