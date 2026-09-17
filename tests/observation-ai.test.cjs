const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const extension = require('./extension-path.cjs');

test('observation suggestions use combined-score storage and reject visual-score fallback', () => {
  const code = fs.readFileSync(path.join(extension, 'scripts/observation-ai-adapter.js'), 'utf8');
  assert.match(code, /LeafwiseVisionScores/);
  assert.match(code, /Number\(data\.id\) === id/);
  assert.doesNotMatch(code, /visionScore/);
  assert.match(code, /new root\.MutationObserver\(schedule\)/);
  assert.match(code, /setInterval\?\.\(scan, 1200\)/);
  assert.match(code, /addEventListener\?\.\("leafwise:cv-combined-scores", schedule\)/);
  assert.match(code, /removeEventListener\?\.\("leafwise:cv-combined-scores", schedule\)/);
  assert.match(code, /observer\.disconnect\(\)/);
});

test('observation content script shares the uploader score style and page-data adapter', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
  const entry = manifest.content_scripts.find(group => group.js.includes('scripts/observation-ai-adapter.js'));
  assert.deepEqual(entry.js, [
    'scripts/vision-score-data.js', 'scripts/vision-score-style.js',
    'scripts/uploader-page-data.js', 'scripts/observation-ai-adapter.js'
  ]);
});
