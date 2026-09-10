import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const targets = ['chrome', 'firefox'];
export const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
export const version = readJSON('package.json').version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a browser-compatible x.y.z version in package.json');

export function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}

export function build(target) {
  if (!targets.includes(target)) throw new Error(`Unknown target: ${target}`);
  const destination = path.join(root, 'build', target);
  // Only remove these two fixed generated directories, never arbitrary paths.
  if (!targets.some(name => destination === path.join(root, 'build', name))) throw new Error('Invalid build path');
  fs.rmSync(destination, { force: true, recursive: true });
  fs.cpSync(path.join(root, 'src'), destination, { recursive: true });
  const manifest = { ...readJSON('src/manifest.json'), ...readJSON(`platforms/${target}.json`), version };
  const uploader = manifest.content_scripts[0];
  if (target === 'chrome') uploader.world = 'MAIN';
  fs.copyFileSync(path.join(root, `platforms/${target}-page-data.js`), path.join(destination, 'scripts/uploader-page-data.js'));
  // Shared source uses the Chrome namespace; Firefox uses its Promise API.
  // All API calls keep the same argument/response contract across targets.
  if (target === 'firefox') {
    for (const file of files(destination).filter(file => file.endsWith('.js'))) {
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\bchrome\./g, 'browser.'));
    }
  } else {
    const background = path.join(destination, 'scripts/background.js');
    fs.writeFileSync(background, 'importScripts("higher-taxa-core.js", "higher-taxa-service.js");\n\n' + fs.readFileSync(background, 'utf8'));
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built ${target} ${version}`);
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const target of targets) build(target);
}
