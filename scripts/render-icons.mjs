import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets', 'leafwise-icon.svg');
const destination = path.join(root, 'src', 'icons');
const sizes = [16, 32, 48, 128];

fs.mkdirSync(destination, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 128, height: 128 } });
  await page.goto(pathToFileURL(source).href);
  for (const size of sizes) {
    await page.evaluate(value => {
      document.documentElement.setAttribute('width', value);
      document.documentElement.setAttribute('height', value);
    }, size);
    await page.locator('svg').screenshot({ path: path.join(destination, `leafwise-${size}.png`), omitBackground: true });
  }
} finally {
  await browser.close();
}
