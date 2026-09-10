const { test } = require('node:test');
const assert = require('node:assert/strict');
const extension = require('./extension-path.cjs');
const core = require(extension + '/scripts/uploader-ai-core.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const candidate = (score, id = 1) => ({ id, score, name: 'Test', vision: true, ancestor: false });
const snapshot = (score, confident = false) => ({ items: [candidate(score)], confident });

test('native 0–100 scores: preserve zero, decimals and reject unknown values', () => {
  for (const value of [0, 0.9, 80, 100]) assert.equal(core.score(value), value);
  for (const value of [null, undefined, '', '90', false, NaN, Infinity, -1, 100.1]) assert.equal(core.score(value), null);
});
test('strict threshold: above 80 qualifies; exactly 80 and low scores do not use header fallback', () => {
  assert.equal(core.decide(snapshot(80.01), {}).apply, true);
  for (const value of [0, 0.9, 40, 80]) assert.equal(core.decide(snapshot(value, true), {}).apply, false);
});
test('missing score uses official common-ancestor indication only', () => {
  assert.equal(core.decide(snapshot(undefined, true), {}).apply, true);
  assert.equal(core.decide(snapshot(undefined, false), {}).apply, false);
  assert.equal(core.decide(snapshot(null, 'true'), {}).apply, false);
});
test('official-only mode requires a header even for a high numeric score', () => {
  assert.equal(core.decide(snapshot(99), { mode: 'official' }).apply, false);
  assert.equal(core.decide(snapshot(15, true), { mode: 'official' }).apply, true);
});
test('select first displayed best suggestion, never common ancestor or higher-scored later item', () => {
  const items = [{...candidate(99, 999), ancestor: true}, candidate(45, 1), candidate(98, 2)];
  const result = core.decide({ items, confident: true }, {});
  assert.equal(result.candidate.id, 1); assert.equal(result.apply, false);
  assert.equal(core.decide({ items, confident: true }, { mode: 'official' }).candidate.id, 1);
  assert.equal(core.decide({ items: [items[0]], confident: true }, {}).apply, false);
});
test('invalid settings and empty/non-CV menus cannot produce an automatic selection', () => {
  assert.throws(() => core.settings({threshold:'bad'}));
  assert.throws(() => core.settings({threshold:''}));
  assert.throws(() => core.settings({threshold:101}));
  assert.throws(() => core.settings({mode:'anything'}));
  assert.equal(core.settings({}).onlyEmpty, true);
  for (const items of [[], [{...candidate(99), vision:false}], [candidate(99,-1)]]) assert.equal(core.decide({items},{}).apply,false);
});
test('visible fallback recognizes both Chinese forms and English without accepting uncertain text', () => {
  for (const text of ['我们非常确定它属于这个属：','我們非常確定它屬於這個科：',"We're pretty sure this is in the genus:"]) assert.equal(core.confidentHeader(text),true);
  for (const text of ['我们没有足够的信心给出推荐鉴定','沒有足夠的信心','not confident','Here are our top suggestions']) assert.equal(core.confidentHeader(text),false);
});

test('uploader has the correct execution world and no extension API access', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
  const main = manifest.content_scripts.filter(script => script.world === 'MAIN');
  assert.equal(main.length, process.env.LEAFWISE_TARGET === 'firefox' ? 0 : 1);
  const uploader = manifest.content_scripts[0];
  assert.ok(uploader.matches.every(url => url.endsWith('/observations/upload*')));
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const file of uploader.js) {
    const code = fs.readFileSync(path.join(extension, file), 'utf8');
    assert.doesNotMatch(code, /\b(?:browser|chrome)\./);
    if (process.env.LEAFWISE_TARGET !== 'firefox') assert.doesNotMatch(code, /wrappedJSObject/);
  }
});

test('browser initialization works with an isolated window and preserves page CommonJS shims', () => {
  for (const isolated of [false, true]) {
    const pageModule = { exports: { existing: true } };
    const context = vm.createContext({ module: pageModule, window: {} });
    if (!isolated) vm.runInContext('globalThis.window = globalThis', context);
    vm.runInContext(fs.readFileSync(path.join(extension, 'scripts/uploader-ai-core.js'), 'utf8'), context);
    assert.equal(typeof context.LeafwiseUploadCore.decide, 'function');
    assert.deepEqual(pageModule.exports, { existing: true });
  }
});
