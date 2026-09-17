const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const extension = require('./extension-path.cjs');

const bridge = require(path.join(extension, 'scripts/vision-score-bridge.js'));
const data = require(path.join(extension, 'scripts/vision-score-data.js'));
const style = require(path.join(extension, 'scripts/vision-score-style.js'));

test('bridge captures combined scores by taxon id and preserves the native response', () => {
  const response = { results: [
    { taxon: { id: 11 }, combined_score: 81.94, vision_score: 77 },
    { taxon: { id: 12 }, combined_score: 0, vision_score: 99 },
    { taxon: { id: 13 }, combined_score: null }
  ] };
  assert.equal(bridge.capture(response), response);
  assert.equal(response.results[0].taxon.leafwiseCombinedScore, 81.94);
  assert.equal(response.results[1].taxon.leafwiseCombinedScore, 0);
  assert.equal(response.results[2].taxon.leafwiseCombinedScore, undefined);
});

test('bridge forwards the original score_image call once with its GPS and date intact', async () => {
  let calls = 0;
  const params = { image: { name: 'native thumbnail' }, lat: 22.3, lng: 114.2, observed_on: '2026-09-17' };
  const owner = { score_image: async actual => {
    calls++; assert.equal(actual, params);
    return { results: [{ taxon: { id: 8 }, combined_score: 72, vision_score: 99 }] };
  } };
  assert.equal(bridge.wrap(owner, 'score_image'), true);
  const response = await owner.score_image(params);
  assert.equal(calls, 1);
  assert.equal(response.results[0].taxon.leafwiseCombinedScore, 72);
});

test('response store matches by taxon id and visible-menu overlap, never by order', () => {
  let now = 1000;
  const store = data.createStore(() => now);
  store.add({ capturedAt: now, scores: [{ id: 2, combinedScore: 20 }, { id: 1, combinedScore: 10 }] });
  now += 10;
  store.add({ capturedAt: now, scores: [{ id: 1, combinedScore: 91 }, { id: 3, combinedScore: 83 }] });
  assert.equal(store.value({ id: 1 }, 1, [1, 3]), 91);
  assert.equal(store.value({ id: 2, leafwiseCombinedScore: 44 }, 2, [1, 2]), 44);
  assert.equal(store.value({ id: 99 }, 99, [99]), null);
  assert.equal(store.value({ id: 88, visionScore: 100 }, 88, [88]), null);
});

test('compact score style uses one decimal without a percent sign', () => {
  const properties = new Map();
  const row = { classList: { add() {}, remove() {} }, style: {
    setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name)
  } };
  const badge = { style: {}, setAttribute() {}, textContent: '', parentElement: null };
  const result = {
    querySelector: selector => selector === '.leafwise-ai-score' ? badge : null,
    querySelectorAll: () => [], append: node => { node.parentElement = result; }
  };
  assert.equal(style.decorate(result, row, 81.94), badge);
  assert.equal(badge.textContent, '81.9');
  assert.equal(badge.textContent.includes('%'), false);
  assert.match(properties.get('--leafwise-score-accent'), /^rgb\(/);
});
