const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extension = require('./extension-path.cjs');
const read = file => fs.readFileSync(path.join(extension, 'scripts', file), 'utf8');

function setup(lang, overrides = {}) {
  const doc = {
    documentElement: { getAttribute: () => lang },
    querySelector: () => null,
    createTreeWalker: () => ({ nextNode: () => null }),
    querySelectorAll: () => []
  };
  const context = vm.createContext({ document: doc, navigator: { language: 'zh-CN' }, ...overrides });
  vm.runInContext(read('i18n-catalog.js'), context);
  vm.runInContext(read('i18n.js'), context);
  return context;
}

test('exactly 50 supported variants have all required translations and matching placeholders', () => {
  const { LeafwiseTranslations: data } = setup('en');
  const required = require('../src/i18n/required-keys.json');
  const slots = value => [...value.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
  assert.equal(Object.keys(data.names).length, 50);
  assert.deepEqual(Object.keys(data.locales).sort(), Object.keys(data.names).sort());
  for (const [code, catalog] of Object.entries(data.locales)) {
    for (const key of required) {
      assert.ok(catalog[key] || data.locales[code.split('-')[0]]?.[key], `${code}: ${key}`);
    }
    for (const [key, value] of Object.entries(catalog)) assert.deepEqual(slots(value), slots(key), `${code}: ${key}`);
  }
});

test('site locale takes priority over browser language, with explicit aliases and fallback', () => {
  const context = setup('fr-CA');
  const api = context.LeafwiseI18n;
  assert.equal(api.locale(), 'fr-CA');
  assert.equal(api.t('保存常用用户'), 'Enregistrer les utilisateurs');
  for (const [input, code] of [['zh-Hans', 'zh-CN'], ['zh-Hant', 'zh-TW'], ['zh-Hant-HK', 'zh-HK'], ['zh_MO', 'zh-TW'], ['iw', 'he'], ['en-GB', 'en-GB'], ['xx', 'en']]) {
    assert.equal(api.normalize(input), code);
  }
  assert.equal(setup('unsupported').LeafwiseI18n.t('停止'), 'Stop');
  const noLang = setup('');
  noLang.document.querySelector = () => ({ content: 'ja' });
  assert.equal(noLang.LeafwiseI18n.locale(), 'ja');
});

test('parameters are inserted once and are not treated as HTML, translations or placeholders', () => {
  const api = setup('en').LeafwiseI18n;
  const name = '<b>停止 {1} $&</b>';
  assert.equal(api.t('来源 {0}', name), 'Source ' + name);
  assert.equal(api.t('来源 {0}'), 'Source {0}');
  assert.equal(api.legacy('Invalid native detail'), 'Invalid native detail');
  assert.equal(api.legacy('年份须介于 1700 与 9999。'), '年份须介于 1700 与 9999。');
  assert.equal(api.t('A missing optional translation'), 'A missing optional translation');
  assert.equal(api.t('toString'), 'toString');
  assert.equal(api.t('__proto__'), '__proto__');
  assert.equal(api.t(undefined), '');
});

test('options reuse last site locale without changing any saved user data', async () => {
  const saved = { leafwiseLastSiteLocale: 'ar', savedTaxa: [{ id: 3, name: '自訂名稱' }] };
  const context = setup('en');
  const before = JSON.stringify(saved);
  const code = await context.LeafwiseI18n.initializeOptions({ storage: { local: { get: async () => saved } } });
  assert.equal(code, 'ar');
  assert.equal(context.document.documentElement.dir, 'rtl');
  assert.equal(context.document.documentElement.lang, 'ar');
  assert.equal(JSON.stringify(saved), before);
});

test('legacy core errors are localized only at the presentation boundary', () => {
  const context = setup('en');
  const source = context.LeafwiseTranslations.source;
  const message = Object.entries(source).find(([, key]) => key === '{0} requires a single positive integer ID.')[0];
  assert.equal(context.LeafwiseI18n.legacy(message.replace('{0}', 'custom ID')), 'custom ID requires a single positive integer ID.');
  assert.equal(context.LeafwiseI18n.legacy('首選綜合分數 15.9 未超過 80；沒有官方「非常確定」提示，保留原值'),
    'Top combined score 15.9 does not exceed 80; No official confident hint; original value kept');
});
