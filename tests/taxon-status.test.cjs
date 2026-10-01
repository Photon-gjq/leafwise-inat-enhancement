const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const extension = require('./extension-path.cjs');
const status = require(path.join(extension, 'scripts/taxon-status.js'));

test('selected region comes from native observation links, not a preferred-name or stale URL', () => {
  const href = 'https://www.inaturalist.org/taxa/3?place_id=10301';
  let chosen = true;
  let links = [link({href:'/observations?taxon_id=3&place_id=6903'})];
  const trigger = {classList:{contains:()=>chosen}};
  const doc = {querySelector:()=>({querySelector:()=>trigger}),querySelectorAll:()=>links};
  assert.equal(status.selectedTaxonPlace(doc, href),6903);
  links = []; assert.equal(status.selectedTaxonPlace(doc,href),undefined);
  links = [link({href:'/observations?taxon_id=3&preferred_place_id=6903'})];
  assert.equal(status.selectedTaxonPlace(doc,href),undefined);
  links = [link({href:'/observations?taxon_id=3&place_id=6903'}),link({href:'/observations?taxon_id=3&place_id=7613'})];
  assert.equal(status.selectedTaxonPlace(doc,href),undefined);
  links = [link({href:'https://example.org/observations?taxon_id=3&place_id=6903'})];
  assert.equal(status.selectedTaxonPlace(doc,href),undefined);
  chosen=false; assert.equal(status.selectedTaxonPlace(doc,href),null);
  const absent={querySelector:()=>null};
  assert.equal(status.selectedTaxonPlace(absent,href),10301);
  assert.equal(status.selectedTaxonPlace(absent,href.replace('10301','bad')),undefined);
  assert.equal(status.selectedTaxonPlace(absent,href.split('?')[0]),null);
  assert.equal(new URL(status.ownObservationsURL(href,'observer',3,6903)).searchParams.get('place_id'),'6903');
  assert.equal(new URL(status.ownObservationsURL(href,'observer',3)).searchParams.has('place_id'),false);
});

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
