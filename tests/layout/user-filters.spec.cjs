const { test, expect } = require('@playwright/test');
const path = require('node:path');

// Match the official Angular filter menu: the visible autocomplete has no
// ng-model, while the hidden user_id is bound to params.user_id. Angular may
// update its value without dispatching native input/change events.
const fixture = `<!doctype html><meta charset="utf-8"><div id="filters">
  <h1>Observations</h1><div id="filter-dropdown">
    <div id="more-filters"><div class="row"><div class="col-xs-4">
      <div class="form-group"><input name="user_name"><input name="user_id" type="hidden" ng-model="params.user_id"></div>
      <input name="place_id" type="hidden">
    </div><div class="col-xs-4"></div></div></div>
  </div><div id="filters-footer"><button class="btn-primary">Update search</button><button class="btn-default">Reset</button></div>
</div><main id="observations-search"></main>`;

async function open(page, info, query = '?user_id=observer&place_id=7613&taxon_id=3&month=9') {
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto('https://www.inaturalist.org/observations' + query);
  await page.evaluate(() => {
    const params = new URL(location.href).searchParams;
    document.querySelector('[name=user_name]').value = params.get('user_id') || '';
    document.querySelector('[name=user_id]').value = params.get('user_id') || '';
    document.querySelector('[name=place_id]').value = params.get('place_id') || '';
    const api = { runtime: { sendMessage: async () => ({ ok: true }) }, storage: {
      sync: { get: async () => ({ savedUsernames: ['observer'] }) }, onChanged: { addListener: () => {} }
    } };
    window.chrome = api; window.browser = api;
    document.querySelector('.btn-primary').addEventListener('click', () => {
      const url = new URL(location.href);
      for (const key of ['user_id', 'place_id']) {
        const value = document.querySelector(`[name=${key}]`).value;
        if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
      }
      history.replaceState({}, '', url);
    });
    document.querySelector('.btn-default').addEventListener('click', () => {
      for (const input of document.querySelectorAll('#filters input')) input.value = '';
      history.replaceState({}, '', '/observations');
    });
  });
  const directory = path.resolve(__dirname, '../../build', info.project.name.split('-')[0], 'scripts');
  for (const file of ['url-filters.js', 'saved-users.js', 'content.js']) await page.addScriptTag({ path: path.join(directory, file) });
  const modal = page.locator('#qg-inat-native-filter-tools');
  await expect(modal.locator('#modal-source')).toBeEnabled();
  return modal;
}

test('native clear removes the source draft even before the URL changes and never resurrects it on update', async ({ page }, info) => {
  const modal = await open(page, info);
  await expect(modal.locator('#modal-source')).toHaveValue('user:observer');
  await page.evaluate(() => {
    document.querySelector('[name=user_name]').value = '';
    document.querySelector('[name=user_id]').value = '';
  });
  await expect(modal.locator('#modal-source')).toHaveValue('none');
  await expect(modal.locator('#modal-source-name')).toHaveValue('');
  await page.locator('.btn-primary').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('user_id')).toBeNull();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('qgInatPendingUnobservedUser'))).toBeNull();
  await page.locator('.btn-primary').click();
  expect(new URL(page.url()).searchParams.get('user_id')).toBeNull();
  expect(new URL(page.url()).searchParams.get('place_id')).toBe('7613');
  expect(new URL(page.url()).searchParams.get('month')).toBe('9');
});

test('URL removal is authoritative even while native controls still display an old user', async ({ page }, info) => {
  const modal = await open(page, info);
  await page.evaluate(() => history.replaceState({}, '', '/observations?place_id=7613'));
  await expect(modal.locator('#modal-source')).toHaveValue('none');
  await expect(modal.locator('#modal-source-name')).toHaveValue('');
});

test('clearing native modeled user does not fall back to a stale visible autocomplete label', async ({ page }, info) => {
  const modal = await open(page, info);
  await page.evaluate(() => { document.querySelector('[name=user_id]').value = ''; });
  await expect(modal.locator('#modal-source')).toHaveValue('none');
  await page.locator('.btn-primary').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('user_id')).toBeNull();
});

test('native user changes and reset update both extension forms without overwriting custom typing', async ({ page }, info) => {
  const modal = await open(page, info);
  await page.evaluate(() => { document.querySelector('[name=user_id]').value = 'other_observer'; });
  await expect(modal.locator('#modal-source-name')).toHaveValue('other_observer');
  await modal.locator('#modal-source').selectOption('custom');
  await modal.locator('#modal-source-name').fill('draft_observer');
  await expect(modal.locator('#modal-source-name')).toHaveValue('draft_observer');
  await page.locator('.btn-default').click();
  await expect(modal.locator('#modal-source')).toHaveValue('none');
  await page.locator('#qg-inat-user-filters-summary button').click();
  await expect(page.locator('#qg-inat-user-filters #source')).toHaveValue('none');
  await page.locator('.btn-primary').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('user_id')).toBeNull();
  expect(new URL(page.url()).searchParams.get('place_id')).toBeNull();
});

test('source and exclusion chosen in the extension survive native update independently', async ({ page }, info) => {
  const modal = await open(page, info, '?place_id=7613');
  await modal.locator('#modal-source').selectOption('user:observer');
  await modal.locator('#modal-exclude').selectOption('custom');
  await modal.locator('#modal-exclude-name').fill('other_observer');
  await page.locator('.btn-primary').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('unobserved_by_user_id')).toBe('other_observer');
  expect(new URL(page.url()).searchParams.get('user_id')).toBe('observer');
  expect(new URL(page.url()).searchParams.get('place_id')).toBe('7613');
});
