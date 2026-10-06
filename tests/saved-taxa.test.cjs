const { test } = require('node:test');
const assert = require('node:assert/strict');
const extension = require('./extension-path.cjs');
const taxa = require(extension + '/scripts/saved-taxa.js');

test('old saved taxa, empty settings and optional exclusion presets round-trip without migration', () => {
  const old = [{ id: 3, name: '鸟纲' }, { id: 48460, name: '全部生物' }];
  assert.deepEqual(taxa.storageKeys, ['savedTaxa']);
  assert.deepEqual(taxa.read({ savedTaxa: old }), old);
  assert.deepEqual(taxa.read({}), old);
  assert.deepEqual(taxa.read({ savedTaxa: [] }), []);
  assert.deepEqual(taxa.parse(taxa.format(old)), old);
  const text = '125816 !50186 = 自订组合\n125816 = All\n125816 !050186,3,50186 = Other\n3';
  const expected = [
    { id: 125816, name: '自订组合', withoutTaxonIds: [50186] },
    { id: 125816, name: 'All' },
    { id: 125816, name: 'Other', withoutTaxonIds: [3, 50186] },
    { id: 3, name: '' }
  ];
  assert.deepEqual(taxa.parse(text), expected);
  const original = JSON.stringify(expected);
  assert.deepEqual(taxa.parse(taxa.format(expected)), expected);
  assert.equal(JSON.stringify(expected), original);
  assert.equal(taxa.key(expected[0]), '125816!50186');
  assert.equal(taxa.key(expected[1]), '125816');
  assert.equal(taxa.key(expected[2]), '125816!3,50186');
});

test('deduplication uses positive root plus canonical excluded IDs, not root alone', () => {
  assert.deepEqual(taxa.parse('3 !4，5 = A\n003 !5,04,5 = duplicate\n3 !6 = B\n3 = C\n3 = duplicate'), [
    { id: 3, name: 'A', withoutTaxonIds: [4, 5] },
    { id: 3, name: 'B', withoutTaxonIds: [6] },
    { id: 3, name: 'C' }
  ]);
  assert.deepEqual(taxa.normalize([{ id: 3, name: ' 名稱 ', withoutTaxonIds: [] }]), [{ id: 3, name: '名稱' }]);
  assert.deepEqual(taxa.parse('3 !4 = custom = name'), [{ id: 3, name: 'custom = name', withoutTaxonIds: [4] }]);
});

test('malformed exclusion settings reject atomically, with bounded positive integer IDs', () => {
  for (const line of ['3 !', '3 ! = Name', '3 !4,', '3 !,4', '3 !4,,5', '3 !4 5', '3 !0', '3 !-4', '3 !1.5', '3 !1e3', '3 !9007199254740992', '3 &without_taxon_id=4', '0 = Name']) {
    assert.throws(() => taxa.parse('3 = valid\n' + line), undefined, line);
  }
  assert.throws(() => taxa.parse('3 !' + Array.from({ length: 21 }, (_, i) => i + 1).join(',')), /20/);
  assert.throws(() => taxa.parse(Array.from({ length: 101 }, (_, i) => i + 1).join('\n')), /100/);
  assert.throws(() => taxa.normalize([{ id: 3, withoutTaxonIds: [4, 'bad'] }]));
});
