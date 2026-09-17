const { test } = require('node:test');
const assert = require('node:assert/strict');
const extension = require('./extension-path.cjs');
const core = require(extension + '/scripts/uploader-ai-core.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const candidate = (score, id = 1) => ({ id, score, name: 'Test', vision: true, ancestor: false });
const ancestor = (id = 999, name = 'Official ancestor') => ({ id, score: null, name, vision: true, ancestor: true });
const snapshot = (score, confident = false) => ({ items: [...(confident ? [ancestor()] : []), candidate(score)], confident });

test('native 0–100 combined scores preserve zero and decimals and reject unknown values', () => {
  for (const value of [0, 0.9, 80, 100]) assert.equal(core.score(value), value);
  for (const value of [null, undefined, '', '90', false, NaN, Infinity, -1, 100.1]) assert.equal(core.score(value), null);
});
test('strict threshold: above 80 selects the first suggestion', () => {
  assert.equal(core.decide(snapshot(80.01), {}).apply, true);
  assert.equal(core.decide(snapshot(80.01), {}).candidate.id, 1);
});
test('a readable score at or below the threshold falls back to the official ancestor', () => {
  for (const value of [0, 0.9, 40, 80]) {
    const result = core.decide(snapshot(value, true), {});
    assert.equal(result.apply, true);
    assert.equal(result.candidate.id, 999);
    assert.equal(result.score, null);
    assert.match(result.reason, /未超過 80；填入官方/);
  }
  const noOfficial = core.decide(snapshot(40, false), {});
  assert.equal(noOfficial.apply, false);
  assert.match(noOfficial.reason, /沒有官方/);
});
test('missing score uses official common-ancestor indication only', () => {
  const result = core.decide(snapshot(undefined, true), {});
  assert.equal(result.apply, true);
  assert.equal(result.candidate.id, 999);
  assert.equal(core.decide(snapshot(undefined, false), {}).apply, false);
  assert.equal(core.decide({ items: [candidate(null)], confident: 'true' }, {}).apply, false);
});
test('official-only mode selects the official ancestor, never its more specific best suggestion', () => {
  assert.equal(core.decide(snapshot(99), { mode: 'official' }).apply, false);
  const result = core.decide({ items: [ancestor(777, 'Leaf beetles'), candidate(5.39, 123)], confident: true }, { mode: 'official' });
  assert.equal(result.apply, true);
  assert.equal(result.candidate.id, 777);
  assert.equal(result.candidate.name, 'Leaf beetles');
  assert.equal(result.score, null);
});
test('score mode selects the first displayed best suggestion when its numeric score is available', () => {
  const items = [ancestor(), candidate(81, 1), candidate(98, 2)];
  const result = core.decide({ items, confident: true }, {});
  assert.equal(result.candidate.id, 1); assert.equal(result.apply, true);
  assert.equal(core.decide({ items, confident: true }, { mode: 'official' }).candidate.id, 999);
});
test('a confident header without a selectable official ancestor does not authorize a child suggestion', () => {
  const result = core.decide({ items: [candidate(undefined, 1)], confident: true }, { mode: 'official' });
  assert.equal(result.apply, false);
  assert.match(result.reason, /無法確認官方確定類群/);
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
  assert.equal(main.length, process.env.LEAFWISE_TARGET === 'firefox' ? 1 : 3);
  const bridge = manifest.content_scripts.find(script => script.js.includes('scripts/vision-score-bridge.js'));
  assert.equal(bridge.world, 'MAIN');
  const uploader = manifest.content_scripts.find(script => script.js.includes('scripts/uploader-ai-panel.js'));
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
