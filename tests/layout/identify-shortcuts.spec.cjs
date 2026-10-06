const { test, expect } = require('@playwright/test');
const path = require('node:path');
const scripts = info => path.resolve(__dirname, '../../build', info.project.name.split('-')[0], 'scripts');
const files = ['i18n-catalog.js', 'i18n.js', 'url-filters.js', 'saved-users.js', 'saved-taxa.js', 'content.js', 'higher-taxa-core.js', 'explore-tools.js', 'quick-places.js', 'higher-taxa-panel.js'];
// Public DOM shape follows Identify's app.jsx, search_bar.jsx and
// place_autocomplete.jsx at b1274a0b6cbf757600ff435135867b7b4021f33c.
const fixture = lang => `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;min-width:980px;font:14px Arial;color:#333}.container-fluid{padding:0 15px}.row{margin:0 -15px}.col-xs-12{padding:0 15px}h2{font-size:30px;margin:20px 0 10px}.SearchBar{margin-bottom:20px}
.form-group{display:inline-block;vertical-align:middle}input[type=search]{width:220px}input,button{padding:6px 12px;height:34px;border:1px solid #ccc;border-radius:4px;background:white;font:14px Arial}.pull-right{float:right}[dir=rtl] .pull-right{float:left}.mainrow{background:#eee;padding:30px}.SearchBar.disabled{opacity:.5;pointer-events:none}
</style><body><div id="Identify"><div class="container-fluid"><div class="row"><div class="col-xs-12"><h2>Identify</h2></div></div>
<div class="row"><div class="col-xs-12" id="search-column"><form class="SearchBar form-inline">
<div class="pull-right"><button id="mark-all" type="button">Mark all as reviewed</button></div>
<span class="form-group"><input id="native-taxon" type="search" placeholder="Taxon"></span>
<span class="form-group PlaceAutocomplete"><input name="place_name" type="search" placeholder="Place"><input name="place_id" type="hidden"></span>
<button id="native-go" type="submit">Go</button> <button id="native-filters" type="button">Filters</button>
<span class="form-group"><label><input id="reviewed" type="checkbox"> Reviewed</label></span></form></div></div>
<div class="row mainrow"><div class="ObservationsGrid">Observation grid</div></div></div></div></body></html>`;

async function prepare(page, lang = 'en') {
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body: fixture(lang) }));
  await page.addInitScript(() => {
    const listeners = new Set();
    const seeds = { sync: { savedTaxa: [
      { id: 125816, name: 'All' },
      { id: 125816, name: 'My custom <b>name</b>', withoutTaxonIds: [50186] },
      { id: 125816, name: 'Other', withoutTaxonIds: [3, 50186] }
    ], savedUsernames: ['observer'] }, local: { leafwiseExploreLibraryV1: { queries: [], groups: [{ id: 'p1', name: 'My region', place: '7613,10301' }] } } };
    const area = name => ({
      get: async () => JSON.parse(localStorage.getItem(name) || JSON.stringify(seeds[name] || {})),
      set: async values => {
        const data = JSON.parse(localStorage.getItem(name) || JSON.stringify(seeds[name] || {}));
        localStorage.setItem(name, JSON.stringify({ ...data, ...values }));
        const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { oldValue: data[key], newValue }]));
        listeners.forEach(listener => listener(changes, name));
      }
    });
    const api = { runtime: { sendMessage: async message => {
      if (message.type === 'qg-open-options') { window.optionsOpened = (window.optionsOpened || 0) + 1; return { ok: true }; }
      if (message.type !== 'leafwise-explore-library' || message.action !== 'list') throw new Error('Unexpected action');
      return { ok: true, library: (await area('local').get()).leafwiseExploreLibraryV1 };
    } }, storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: listener => listeners.add(listener) } } };
    window.chrome = api; window.browser = api;
    window.nativeActions = [];
    document.addEventListener('click', event => { if (event.target.matches('#mark-all, #native-go, #native-filters, #reviewed')) window.nativeActions.push(event.target.id); });
    document.addEventListener('submit', event => { event.preventDefault(); window.nativeActions.push('submit'); });
  });
}
async function inject(page, info) {
  for (const file of files) await page.addScriptTag({ path: path.join(scripts(info), file) });
}
const quick = page => page.locator('#leafwise-quick-places');

test('Identify shortcuts replace full taxon presets and regions while preserving native filters and actions', async ({ page }, info) => {
  await prepare(page);
  const href = 'https://www.inaturalist.org/observations/identify?taxon_id=125816&without_taxon_id=50186&place_id=6903&reviewed=false&quality_grade=needs_id&user_id=observer&unobserved_by_user_id=other&month=9&project_id=12&per_page=30&page=5&leafwise_query=q1#grid';
  await page.goto(href); await inject(page, info);
  await expect(quick(page).locator('#taxon-choice')).toHaveValue('taxon:125816!50186');
  await expect(quick(page).locator('option[value="taxon:125816!50186"]')).toHaveText('My custom <b>name</b> · Exclude 50186');
  await expect(quick(page).locator('b')).toHaveCount(0);
  await expect(page.locator('#qg-inat-higher-taxa, #qg-inat-user-filters')).toHaveCount(0);
  await quick(page).locator('#taxon-choice').selectOption('settings');
  await expect.poll(() => page.evaluate(() => window.optionsOpened)).toBe(1);
  expect(page.url()).toBe(href);
  await quick(page).locator('#taxon-choice').selectOption('taxon:125816!3,50186');
  await expect.poll(() => new URL(page.url()).searchParams.get('without_taxon_id')).toBe('3,50186');
  let next = new URL(page.url());
  expect(next.pathname).toBe('/observations/identify'); expect(next.hash).toBe('#grid');
  for (const [key, value] of new URL(href).searchParams) if (!['taxon_id', 'without_taxon_id', 'page', 'leafwise_query'].includes(key)) expect(next.searchParams.get(key)).toBe(value);
  expect(next.searchParams.has('page')).toBe(false); expect(next.searchParams.has('leafwise_query')).toBe(false);
  await inject(page, info);
  await expect(quick(page).locator('#taxon-choice')).toHaveValue('taxon:125816!3,50186');
  await quick(page).locator('#place-choice').selectOption('p1');
  await expect.poll(() => new URL(page.url()).searchParams.get('place_id')).toBe('7613,10301');
  next = new URL(page.url()); expect(next.searchParams.get('without_taxon_id')).toBe('3,50186');
  await inject(page, info);
  await quick(page).locator('#taxon-choice').selectOption('taxon:125816');
  await expect.poll(() => new URL(page.url()).searchParams.get('without_taxon_id')).toBeNull();
  expect(new URL(page.url()).searchParams.get('taxon_id')).toBe('125816');
  await inject(page, info);
  await quick(page).locator('#taxon-choice').selectOption('any');
  await expect.poll(() => new URL(page.url()).searchParams.get('taxon_id')).toBeNull();
  await inject(page, info);
  await quick(page).locator('#place-choice').selectOption('any');
  await expect.poll(() => new URL(page.url()).searchParams.get('place_id')).toBe('any');
  expect(new URL(page.url()).searchParams.get('reviewed')).toBe('false');
  expect(await page.evaluate(() => window.nativeActions)).toEqual([]);
});

test('Identify storage changes, native URL changes, delayed rendering and remounts refresh choices without applying them', async ({ page }, info) => {
  await prepare(page);
  const href = 'https://www.inaturalist.org/observations/identify?taxon_id=125816&without_taxon_id=50186&place_id=7613,10301&reviewed=true';
  await page.goto(href);
  await page.evaluate(() => { window.column = document.querySelector('#search-column'); window.column.remove(); });
  await inject(page, info); await inject(page, info);
  await expect(quick(page)).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#Identify .container-fluid').append(window.column));
  await expect(quick(page)).toBeVisible();
  await expect(quick(page)).toHaveCount(1);
  await expect(quick(page).locator('#taxon-choice')).toHaveValue('taxon:125816!50186');
  await page.evaluate(async () => {
    window.quickHost = document.querySelector('#leafwise-quick-places');
    await chrome.storage.sync.set({ savedTaxa: [{ id: 125816, name: 'Renamed', withoutTaxonIds: [50186] }] });
    await chrome.storage.local.set({ leafwiseExploreLibraryV1: { groups: [{ id: 'p2', name: 'Renamed region', place: '10301' }], queries: [] } });
    const old = document.querySelector('#search-column');
    const replacement = old.cloneNode(true); replacement.querySelector('#leafwise-quick-places').remove(); old.replaceWith(replacement);
  });
  await expect(quick(page).locator('#taxon-choice option[value="taxon:125816!50186"]')).toHaveText('Renamed · Exclude 50186');
  await expect(quick(page).locator('#place-choice option[value="p2"]')).toHaveText('Renamed region');
  expect(page.url()).toBe(href);
  expect(await page.evaluate(() => document.querySelector('#leafwise-quick-places') === window.quickHost)).toBe(true);
  await page.evaluate(() => history.pushState({}, '', '/observations/identify?taxon_id=125816&without_taxon_id=3&place_id=10301'));
  await expect(quick(page).locator('#taxon-choice')).toHaveValue('');
  await expect(quick(page).locator('#place-choice')).toHaveValue('p2');
  await page.evaluate(() => history.replaceState({}, '', '/observations/123'));
  await expect(quick(page)).toBeHidden();
  await page.evaluate(() => history.replaceState({}, '', '/observations/identify?taxon_id=125816&without_taxon_id=50186'));
  await expect(quick(page)).toBeVisible();
  await expect(quick(page).locator('#taxon-choice')).toHaveValue('taxon:125816!50186');
  await inject(page, info); await expect(quick(page)).toHaveCount(1);
  expect(await page.evaluate(() => window.nativeActions)).toEqual([]);
});

test('Identify reflects URL-omitted native preferred places without mistaking them for worldwide', async ({ page }, info) => {
  await prepare(page); await page.goto('https://www.inaturalist.org/observations/identify');
  await page.evaluate(() => { document.querySelector('[name="place_id"]').value = '10301,7613'; });
  await inject(page, info);
  await expect(quick(page).locator('#place-choice')).toHaveValue('p1');
  await page.evaluate(() => { document.querySelector('[name="place_id"]').value = 'native-place-uuid'; });
  await expect(quick(page).locator('#place-choice')).toHaveValue('');
  await quick(page).locator('#place-choice').selectOption('any');
  await expect.poll(() => new URL(page.url()).searchParams.get('place_id')).toBe('any');
  await inject(page, info); await expect(quick(page).locator('#place-choice')).toHaveValue('any');
});

test('Identify disabled or blind-experiment forms do not gain enabled shortcuts', async ({ page }, info) => {
  await prepare(page); await page.goto('https://www.inaturalist.org/observations/identify'); await inject(page, info);
  await expect(quick(page)).toBeVisible();
  await page.evaluate(() => document.querySelector('.SearchBar').classList.add('disabled'));
  await expect(quick(page)).toBeHidden();
  await page.evaluate(() => { document.querySelector('.SearchBar').classList.remove('disabled'); document.querySelector('#Identify').classList.add('blind'); });
  await expect(quick(page)).toBeHidden();
  await page.evaluate(() => document.querySelector('#Identify').classList.remove('blind'));
  await expect(quick(page)).toBeVisible();
});

for (const language of ['en', 'ar']) for (const width of [1280, 375]) {
  test(`Identify toolbar preserves native form geometry and controls: ${language}, ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 }); await prepare(page, language);
    await page.goto('https://www.inaturalist.org/observations/identify?taxon_id=125816&without_taxon_id=50186');
    const ids = ['native-taxon', 'native-go', 'native-filters', 'reviewed', 'mark-all'];
    const boxes = async () => Promise.all(ids.map(id => page.locator('#' + id).boundingBox()));
    const before = await boxes(); const initialWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    await inject(page, info); await expect(quick(page)).toBeVisible();
    expect(await boxes()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(initialWidth);
    expect(await quick(page).evaluate(host => host.previousElementSibling.matches('.SearchBar') && host.closest('form') === null)).toBe(true);
    await expect(quick(page)).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    await page.locator('#native-filters').click();
    expect(await page.evaluate(() => window.nativeActions)).toEqual(['native-filters']);
    await page.screenshot({ path: info.outputPath(`identify-shortcuts-${language}-${width}.png`), fullPage: true });
  });
}
