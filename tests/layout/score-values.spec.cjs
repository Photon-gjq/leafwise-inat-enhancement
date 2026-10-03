const { test, expect } = require('@playwright/test');
const path = require('node:path');

// Synthetic raw API scores deliberately straddle 1. No image/account data.
const pairs = [
  [39.7, 31.5], [34.9, 42.2], [15.2, 18.3], [4.3, 1.7],
  [1.01, 1.2], [1, 1], [0.999, 0.85], [0.316, 0.382],
  [0.25, 0.302], [0.17, 0.206], [0.00123456, 0.00234567], [0, 0]
];
const results = pairs.map(([combined_score, vision_score], index) => ({
  taxon: { id: 100 + index }, combined_score, vision_score
}));
const texts = [
  '39.7(31.5)', '34.9(42.2)', '15.2(18.3)', '4.3(1.7)',
  '1.0(1.2)', '1.0(1.0)', '0.999(0.85)', '0.316(0.382)',
  '0.25(0.302)', '0.17(0.206)', '0.00123(0.00235)', '0.0(0.0)'
];

function fixture(upload) {
  const rows = results.map(({ taxon }) => `<li class="ac-result"><div class="ac vision" data-taxon-id="${taxon.id}"><span class="title">Taxon ${taxon.id}</span><a class="ac-view">View</a></div></li>`).join('');
  const menu = `<ul class="ac-menu taxon-autocomplete">${rows}<li class="manual"><div class="ac" data-taxon-id="999">Manual search</div></li></ul>`;
  return `<!doctype html><meta charset="utf-8"><style>
    body{font:16px Arial}.ac-menu{display:block;width:620px}.ac-result{list-style:none;min-height:50px}
    .ac{display:flex;align-items:center}.title{flex:1}.ac-view{padding:10px}
  </style><body>${upload
    ? `<div class="ObsCardComponent"><div class="card" data-id="a"><div class="TaxonAutocomplete"><input name="taxon_name"><input name="taxon_id">${menu}</div></div></div>`
    : `<div class="id_tab">${menu}</div>`}`;
}

for (const upload of [true, false]) for (const version of ['v1', 'v2']) {
  test(`${upload ? 'upload' : 'observation'} ${version}: raw scores across 1 stay unscaled and keep menu order on reopen`, async ({ page }, testInfo) => {
    const url = `https://www.inaturalist.org/observations/${upload ? 'upload' : '123'}`;
    const endpoint = `https://api.inaturalist.org/${version}/computervision/${upload ? 'score_image' : 'score_observation/9fd4c85a-95e3-4fc7-ae61-c46675021754'}`;
    let requests = 0;
    await page.route(url, route => route.fulfill({ body: fixture(upload), contentType: 'text/html' }));
    await page.route(`${endpoint}*`, route => {
      requests++;
      return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ results }) });
    });
    await page.goto(url);
    await page.evaluate(({ results, upload }) => {
      window.testScores = results;
      // The uploader's native candidates expose visionScore, not combined_score.
      window.LeafwiseUploadPageData = element => {
        if (!upload) return null; // Exercise the detail-page DOM-marker fallback.
        const result = element.querySelector?.('[data-taxon-id]');
        const score = window.testScores.find(entry => entry.taxon.id === Number(result?.dataset.taxonId));
        return score ? { id: score.taxon.id, isVisionResult: true, isCommonAncestor: false, visionScore: score.vision_score } : null;
      };
    }, { results, upload });
    const target = testInfo.project.name.split('-')[0];
    const directory = path.resolve(__dirname, '../../build', target, 'scripts');
    const scripts = ['vision-score-data.js', 'vision-score-style.js', 'vision-score-bridge.js'];
    scripts.push(...(upload ? ['uploader-ai-core.js', 'uploader-ai-adapter.js'] : ['observation-ai-adapter.js']));
    for (const script of scripts) await page.addScriptTag({ path: path.join(directory, script) });
    const returned = await page.evaluate(async ({ endpoint, upload }) => {
      if (!upload) return (await fetch(`${endpoint}?fields=(vision_score:!t,taxon:(id:!t))`)).json();
      const body = new FormData();
      body.append('fields', JSON.stringify({ vision_score: true, taxon: { id: true } }));
      body.append('image', 'synthetic-thumbnail');
      return (await fetch(endpoint, { method: 'POST', body })).json();
    }, { endpoint, upload });
    expect(returned).toEqual({ results }); // Bridge must not change the native response.
    const badges = page.locator('.ac.vision .leafwise-ai-score');
    await expect(badges).toHaveText(texts);
    await expect(page.locator('.manual .leafwise-ai-score')).toHaveCount(0);
    expect(await page.locator('.ac.vision').evaluateAll(rows => rows.map(row => Number(row.dataset.taxonId))))
      .toEqual(results.map(entry => entry.taxon.id));
    await expect(badges.nth(7)).toHaveAttribute('title', /0\.316.*0\.382/);
    await expect(badges.nth(10)).toHaveAttribute('title', /0\.00123456.*0\.00234567/);
    if (upload) {
      const actual = await page.evaluate(() => LeafwiseUploadAdapter.read(document.querySelector('.card')).items.map(item => [item.score, item.visionScore]));
      expect(actual).toEqual(pairs);
    }
    await page.evaluate(upload => {
      const menu = document.querySelector('.ac-menu');
      menu.hidden = true;
      document.querySelectorAll('.leafwise-ai-score').forEach(badge => badge.remove());
      menu.hidden = false;
      if (upload) LeafwiseUploadAdapter.scanScores();
    }, upload);
    await expect(badges).toHaveText(texts);
    expect(requests).toBe(1);
  });
}
