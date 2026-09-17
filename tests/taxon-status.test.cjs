const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const extension = require('./extension-path.cjs');
const status = require(path.join(extension, 'scripts/taxon-status.js'));

function link(attributes, isTaxonName = false) {
  return {
    getAttribute: name => attributes[name] ?? null,
    matches: selector => isTaxonName && selector === 'a.taxon-name',
    closest: () => null,
    getClientRects: () => [{}]
  };
}

test('current observation taxon follows the live DOM href before API fallback', () => {
  const current = link({ href: '/taxa/12345-Test' }, true);
  const doc = { querySelectorAll: selector => selector.includes('.ObservationShow .TaxonSummary') && selector.includes('href') ? [current] : [] };
  assert.equal(status.currentObservationTaxonId(doc, 'https://www.inaturalist.org/observations/99'), 12345);
});

test('current observation taxon also accepts the data attribute used by redraws', () => {
  const current = link({ 'data-taxon-id': '54321' });
  const doc = { querySelectorAll: selector => selector === '.ObservationShow .TaxonSummary a[data-taxon-id]' ? [current] : [] };
  assert.equal(status.currentObservationTaxonId(doc, 'https://www.inaturalist.org/observations/99'), 54321);
});
