import fs from 'node:fs';
import path from 'node:path';
import { root } from './build.mjs';

const manifestPath = path.join(root, 'build', 'firefox', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const extensionId = manifest.browser_specific_settings?.gecko?.id;
const { version } = manifest;
if (!extensionId || !version) throw new Error('Firefox manifest must contain a Gecko extension ID and version');

const endpoint = new URL(
  `addons/addon/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(version)}/`,
  'https://addons.mozilla.org/api/v5/'
);
const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
if (response.status !== 200 && response.status !== 404) {
  throw new Error(`AMO version check failed with HTTP ${response.status}`);
}
const exists = response.status === 200;
console.log(`Firefox ${version} ${exists ? 'already exists' : 'is not present'} on AMO`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `exists=${exists}\nversion=${version}\n`);
}
