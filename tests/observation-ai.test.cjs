const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extension = require('./extension-path.cjs');

test('observation suggestions use combined-score storage and reject visual-score fallback', () => {
  const code = fs.readFileSync(path.join(extension, 'scripts/observation-ai-adapter.js'), 'utf8');
  assert.match(code, /LeafwiseVisionScores/);
  assert.match(code, /Number\(data\.id\) === id/);
  assert.match(code, /classList\?\.contains\("vision"\)/);
  assert.doesNotMatch(code, /visionScore/);
  assert.match(code, /new root\.MutationObserver\(schedule\)/);
  assert.match(code, /setInterval\?\.\(scan, 1200\)/);
  assert.match(code, /addEventListener\?\.\("leafwise:cv-combined-scores", schedule\)/);
  assert.match(code, /removeEventListener\?\.\("leafwise:cv-combined-scores", schedule\)/);
  assert.match(code, /observer\.disconnect\(\)/);
});

test('observation detail decorates official DOM vision rows without page jQuery data', () => {
  const listeners = new Map();
  const decorated = [];
  let disconnected = false, clearedTimer = null;
  const addEventListener = (type, listener, options = {}) => {
    const entries = listeners.get(type) || [];
    entries.push({ listener, once: options.once === true }); listeners.set(type, entries);
  };
  const removeEventListener = (type, listener) => {
    listeners.set(type, (listeners.get(type) || []).filter(entry => entry.listener !== listener));
  };
  const dispatch = type => {
    for (const entry of [...(listeners.get(type) || [])]) {
      entry.listener({ type });
      if (entry.once) removeEventListener(type, entry.listener);
    }
  };
  const result = (id, vision) => ({
    id,
    classList: { contains: name => name === 'vision' && vision },
    getAttribute: name => name === 'data-taxon-id' ? String(id) : null
  });
  const rows = [result(42, true), result(43, false)].map(entry => ({
    matches: selector => selector === 'li',
    querySelector: selector => selector === '[data-taxon-id]' ? entry : null
  }));
  const menu = {
    isConnected: true, hidden: false,
    getClientRects: () => [1],
    querySelectorAll: selector => selector === 'li' ? rows : []
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const context = vm.createContext({
    location: { pathname: '/observations/400958933' },
    document: { body: {}, querySelectorAll: () => [menu] },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    MutationObserver,
    requestAnimationFrame: callback => callback(),
    setInterval: () => 73,
    clearInterval: timer => { clearedTimer = timer; },
    addEventListener, removeEventListener,
    LeafwiseVisionScoreStyle: {
      decorate: (entry, _row, value) => decorated.push({ id: entry.id, value })
    },
    LeafwiseVisionScores: {
      value: (_data, id, ids) => id === 42 && ids.join(',') === '42,43' ? 82.5 : null
    },
    LeafwiseUploadPageData: () => null
  });
  vm.runInContext(fs.readFileSync(path.join(extension, 'scripts/observation-ai-adapter.js'), 'utf8'), context);
  assert.deepEqual(decorated, [{ id: 42, value: 82.5 }, { id: 43, value: null }]);
  decorated.length = 0;
  dispatch('leafwise:cv-combined-scores');
  assert.deepEqual(decorated, [{ id: 42, value: 82.5 }, { id: 43, value: null }]);
  dispatch('pagehide');
  assert.equal(disconnected, true);
  assert.equal(clearedTimer, 73);
  assert.equal((listeners.get('leafwise:cv-combined-scores') || []).length, 0);
});

test('observation content script shares the uploader score style and page-data adapter', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
  const entry = manifest.content_scripts.find(group => group.js.includes('scripts/observation-ai-adapter.js'));
  assert.deepEqual(entry.js, [
    'scripts/vision-score-data.js', 'scripts/vision-score-style.js',
    'scripts/uploader-page-data.js', 'scripts/observation-ai-adapter.js'
  ]);
});
