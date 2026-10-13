import path from 'node:path';
import { repositoryRoot } from './installation.js';
import { writeArchives } from './archives.js';

const output = path.join(repositoryRoot, 'dist');
for (const name of await writeArchives(repositoryRoot, output))
  console.log(path.join(output, name));
console.log(path.join(output, 'SHA256SUMS.txt'));
