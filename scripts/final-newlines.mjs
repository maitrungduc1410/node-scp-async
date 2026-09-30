// Adds a missing final newline to every tracked text file. CI runs it before linting, because
// some ways of pushing drop final newlines and Biome would fail every file they touched.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0');

for (const file of files) {
  if (file === '') continue;
  let data;
  try {
    data = readFileSync(file);
  } catch {
    continue; // deleted in the working tree, or a submodule
  }
  if (data.length === 0 || data.at(-1) === 0x0a) continue;
  if (data.subarray(0, 8000).includes(0)) continue; // binary
  appendFileSync(file, '\n');
  console.log(`added a final newline to ${file}`);
}
