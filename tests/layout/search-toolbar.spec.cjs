const { test, expect } = require('@playwright/test');
const path = require('node:path');

// Native float/container shape and sizes follow iNaturalist's index.html.haml
// and observations/search.scss at b1274a0b6cbf757600ff435135867b7b4021f33c.
// The small-screen adaptive mode below is an additional stress test, not a
// claim that the official search page has a responsive mobile layout.
const fixture = (language, adaptive = false) => `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8">
<style>
  *{box-sizing:border-box}body{margin:0;font:14px/1.5 Arial;color:#333;min-width:${adaptive ? '0' : '980px'}}
  .container{max-width:1170px;padding:0 15px;margin:auto}#filters{padding:20px 0}#filters:after{content:'';display:table;clear:both}
  #filters h1{float:left;margin:20px 0 10px;font-size:36px;line-height:1.1}[dir=rtl] #filters h1{float:right}
  .pull-right{float:right}[dir=rtl] .pull-right{float:left}
  #filter-container,.primary-filters{margin-top:20px;display:flex;align-items:flex-start;gap:5px;margin-inline-end:5px}
  input,button{height:34px;padding:6px 12px;border:1px solid #ccc;background:white;font:14px Arial;border-radius:4px}
  .primary-filters input{width:250px}.primary-filters button{color:white;background:#f16f3a}
  #filter-container button{background:#777;color:white}.stats{clear:both;background:#555;color:white;padding:25px;font-size:22px}
  ${adaptive ? '.primary-filters{clear:both;width:100%;flex-wrap:wrap}.primary-filters input{width:140px;max-width:100%}' : ''}
</style><body><div class="container"><div id="filters"><h1>Observations</h1>
<input name="user_id" type="hidden" value="observer" ng-model="params.user_id">
<div id="filter-container" class="pull-right"><button id="native-filters">Filters</button></div>
<div class="primary-filters pull-right"><div><input name="taxon_name" value="Birds"></div><span><input id="place_name" placeholder="Location"></span><button id="native-go">Go</button></div>
</div></div><div class="stats">World · 37,764 observations · 294 taxa</div><main id="observations-search"></main></body></html>`;

async function setup(page, info, language, adaptive = false, delayed = false) {
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body: fixture(language, adaptive) }));
  await page.goto('https://www.inaturalist.org/observations?taxon_id=3&user_id=observer');
  const baseline = await nativeBoxes(page);
  await page.evaluate(delayed => {
    const data = { savedUsernames: ['observer'], savedTaxa: [{ id: 3, name: 'A very long custom taxon name '.repeat(4) }] };
    const api = { runtime: { sendMessage: async () => ({ ok: true, library: { queries: [], groups: [{ id: 'p1', name: 'A very long region group name '.repeat(4), place: '7613,10301' }] } }) },
      storage: { sync: { get: async () => data }, onChanged: { addListener: () => {} } } };
    window.chrome = api; window.browser = api;
    document.querySelector('#native-filters').onclick = () => window.nativeClicks = (window.nativeClicks || 0) + 1;
    if (delayed) { window.nativeHeader = document.querySelector('#filters').outerHTML; document.querySelector('#filters').remove(); }
  }, delayed);
  const directory = path.resolve(__dirname, '../../build', info.project.name.split('-')[0], 'scripts');
  const files = ['i18n-catalog.js', 'i18n.js', 'url-filters.js', 'saved-users.js', 'saved-taxa.js', 'content.js', 'higher-taxa-core.js', 'explore-tools.js', 'quick-places.js', 'higher-taxa-panel.js'];
  for (const file of files) await page.addScriptTag({ path: path.join(directory, file) });
  if (delayed) {
    for (const file of ['content.js', 'quick-places.js', 'higher-taxa-panel.js']) await page.addScriptTag({ path: path.join(directory, file) });
    await page.evaluate(() => document.querySelector('.container').insertAdjacentHTML('beforeend', nativeHeader));
  }
  await expect(page.locator('#leafwise-quick-places #taxon-choice')).toHaveValue('taxon:3');
  await expect(page.locator('#qg-inat-higher-taxa > #qg-inat-user-filters-summary')).toHaveCount(1);
  return baseline;
}

async function nativeBoxes(page) {
  return page.evaluate(() => ({
    nodes: ['#filters h1', '[name=taxon_name]', '#place_name', '#native-go', '#native-filters'].map(selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    }), scrollWidth: document.documentElement.scrollWidth
  }));
}

for (const language of ['en', 'ar']) {
  test(`compact toolbar preserves native header geometry and only wraps its own controls: ${language}`, async ({ page }, info) => {
    for (const width of [1500, 1100, 980, 375]) {
      await page.setViewportSize({ width, height: 850 });
      const baseline = await setup(page, info, language);
      expect(await nativeBoxes(page)).toEqual(baseline);
      const quick = page.locator('#leafwise-quick-places'), box = await quick.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(Math.max(...baseline.nodes.map(node => node.y + node.height)));
      const container = await page.locator('#filters').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(container.x);
      expect(box.x + box.width).toBeLessThanOrEqual(container.x + container.width + 1);
      await expect(page.locator('#filters h1')).toHaveText('Observations');
      await expect(page.locator('#qg-inat-user-filters-summary')).toBeHidden();
      await expect(page.locator('#qg-inat-user-filters')).toBeHidden();
      await page.locator('#native-filters').click();
      expect(await page.evaluate(() => nativeClicks)).toBe(1);
      if (width === 1100) await page.screenshot({ path: info.outputPath(`compact-header-${language}.png`), fullPage: true });
    }
  });
}

test('narrow adaptive host and whole-header remount retain one toolbar and both user controls inside comparison', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 850 });
  const baseline = await setup(page, info, 'en', true, true);
  expect(await nativeBoxes(page)).toEqual(baseline);
  await expect(page.locator('#qg-inat-user-filters-summary')).toBeHidden();
  await page.evaluate(() => {
    const header = document.querySelector('#filters');
    const replacement = document.createRange().createContextualFragment(nativeHeader).firstElementChild;
    header.replaceWith(replacement);
  });
  await expect(page.locator('#filters > #leafwise-quick-places')).toHaveCount(1);
  await expect(page.locator('#qg-inat-higher-taxa-trigger')).toHaveCount(1);
  await expect(page.locator('#qg-inat-higher-taxa > #qg-inat-user-filters')).toHaveCount(1);
  await page.locator('#qg-inat-higher-taxa-trigger button').click();
  await page.locator('#qg-inat-user-filters-summary button').click();
  await expect(page.locator('#qg-inat-user-filters #source')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: info.outputPath('compact-toolbar-mobile-expanded.png'), fullPage: true });
  await page.locator('#qg-inat-higher-taxa .close').click();
  await expect(page.locator('#qg-inat-user-filters #source')).toBeHidden();
  await page.evaluate(() => history.replaceState({}, '', '/observations/123'));
  await expect(page.locator('#leafwise-quick-places')).toBeHidden();
  await page.evaluate(() => history.replaceState({}, '', '/observations?taxon_id=3'));
  await expect(page.locator('#leafwise-quick-places')).toBeVisible();
  await expect(page.locator('#qg-inat-user-filters')).toHaveCount(1);
});
