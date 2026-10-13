import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (process.env.RELEASE_TAG !== `v${version}`)
  throw new Error('Release tag must match package.json version.');
const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8');
const heading = `## ${version}\n`;
const start = changelog.indexOf(heading);
if (start < 0) throw new Error('Release requires a matching changelog entry.');
const notes = changelog
  .slice(start + heading.length)
  .split('\n## ')[0]
  .trim();
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(
  new URL('dist/RELEASE_NOTES.md', root),
  `${notes}\n\n## Downloads\n\n- \`opencode-in-chrome-${version}.zip\`: complete standalone project with bridge, extension, installer, skill, docs, and tests. Extract, then run \`npm run install:opencode -- --project <target-project>\`.\n- \`opencode-in-chrome-extension-${version}.zip\`: unpacked Chrome extension only; still requires a compatible installed bridge.\n- \`SHA256SUMS.txt\`: checksums for both archives.\n\nSee [installation instructions](https://github.com/asaf-labs/opencode-in-chrome#easy-install-recommended).\n`,
);
