import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { root, files, targets, version } from './build.mjs';

const destination = path.join(root, 'dist');
fs.mkdirSync(destination, { recursive: true });
const archives = [];
function archive(name, entries) {
  // A fixed DOS-compatible timestamp makes identical source reproducible.
  const input = Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, [value, { mtime: new Date(2020, 0, 1) }]]));
  const bytes = zipSync(input, { level: 9 });
  const unpacked = unzipSync(bytes);
  if (Object.keys(unpacked).length !== Object.keys(entries).length) throw new Error('Archive entry count mismatch');
  for (const [file, original] of Object.entries(entries)) {
    if (!Buffer.from(original).equals(Buffer.from(unpacked[file]))) throw new Error(`Archive changed ${file}`);
  }
  const manifest = JSON.parse(strFromU8(unpacked['manifest.json'] || unpacked['extension/manifest.json']));
  if (manifest.version !== version) throw new Error('Archive version mismatch');
  fs.writeFileSync(path.join(destination, name), bytes);
  archives.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  console.log(`Verified ${name} (${bytes.length} bytes)`);
}
for (const target of targets) {
  const buildDir = path.join(root, 'build', target);
  const entries = Object.fromEntries(files(buildDir).map(file => [path.relative(buildDir, file).split(path.sep).join('/'), fs.readFileSync(file)]));
  const docs = Object.fromEntries(['INSTALL.md', 'USAGE.md', 'REGIONS.md', 'PRIVACY.md'].map(name => [name, strToU8(fs.readFileSync(path.join(root, 'docs', name), 'utf8'))]));
  docs['NOTICE.md'] = strToU8(fs.readFileSync(path.join(root, 'NOTICE.md'), 'utf8'));
  archive(`Leafwise-${version}-${target}.zip`, { ...Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [`extension/${name}`, bytes])), ...docs });
  if (target === 'firefox') archive(`Leafwise-${version}-firefox-unsigned.xpi`, { ...entries, ...docs });
}
fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), archives.join('\n') + '\n');
