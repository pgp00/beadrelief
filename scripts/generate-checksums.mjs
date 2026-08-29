import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const files = [
  'samples/beadrelief-heart-project.json',
  'samples/beadrelief-heart-p2s.3mf',
  'samples/beadrelief-heart-source.png',
  'samples/beadrelief-p2s-layered-sample.3mf',
  'samples/beadrelief-p2s-sample.3mf',
];
const content = `${(await Promise.all(files.map(async (file) => (
  `${createHash('sha256').update(await readFile(file)).digest('hex')}  ${file.replaceAll('\\', '/')}`
)))).join('\n')}\n`;

if (process.argv.includes('--check')) {
  if (await readFile('SHA256SUMS', 'utf8') !== content) throw new Error('SHA256SUMS is out of date.');
} else {
  await writeFile('SHA256SUMS', content);
}
