import { readdir, readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { zipSync } from 'fflate';

const sourceDirectories = [
  'bridge',
  'extension',
  'scripts',
  'docs',
  'examples',
  'test',
  '.github',
  '.opencode/skills',
];
const sourceFiles = [
  'package.json',
  'package-lock.json',
  'README.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'LICENSE',
  'eslint.config.js',
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.prettierrc.json',
  '.prettierignore',
];
// ZIP timestamps use local date components; keep those constant across time zones.
const fixedDate = new Date(2020, 0, 1);

async function collect(root, relative, entries) {
  const segments = relative.replaceAll('\\', '/').split('/');
  if (
    segments.some(
      (segment) =>
        ['.local', 'node_modules', '.git', 'dist', 'coverage'].includes(segment) ||
        segment === '.env' ||
        segment.startsWith('.env.'),
    )
  )
    return;
  const filename = path.join(root, relative);
  const info = await lstat(filename);
  if (info.isSymbolicLink())
    throw new Error(`Release packaging does not follow symlinks: ${relative}`);
  if (info.isDirectory()) {
    for (const entry of (await readdir(filename)).sort())
      await collect(root, `${relative}/${entry}`, entries);
  } else if (info.isFile()) entries[relative.replaceAll('\\', '/')] = await readFile(filename);
}

export async function releaseArchives(root) {
  const source = {};
  // Explicit allowlist: never traverse .local/, node_modules/, dist/, or .git/.
  for (const entry of [...sourceDirectories, ...sourceFiles]) await collect(root, entry, source);
  const pkg = JSON.parse(source['package.json']);
  const manifest = JSON.parse(source['extension/manifest.json']);
  if (manifest.version !== pkg.version)
    throw new Error('Package and extension versions must match before packaging.');
  const extension = {};
  for (const [name, bytes] of Object.entries(source)) {
    if (name.startsWith('extension/')) extension[name.slice('extension/'.length)] = bytes;
  }
  extension.LICENSE = source.LICENSE;
  const namespaced = Object.fromEntries(
    Object.entries(source).map(([name, bytes]) => [`opencode-in-chrome/${name}`, bytes]),
  );
  const options = { level: 9, mtime: fixedDate };
  return {
    [`opencode-in-chrome-${pkg.version}.zip`]: zipSync(namespaced, options),
    [`opencode-in-chrome-extension-${pkg.version}.zip`]: zipSync(extension, options),
  };
}

export async function writeArchives(root, output) {
  const archives = await releaseArchives(root);
  await mkdir(output, { recursive: true });
  const sums = [];
  for (const [name, bytes] of Object.entries(archives)) {
    await writeFile(path.join(output, name), bytes);
    sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  }
  await writeFile(path.join(output, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
  return Object.keys(archives);
}
