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
    window.storageListeners = []; window.settingsCalls = 0;
    const api = { runtime: { sendMessage: async message => {
      if (message.type === 'qg-open-options') {
        window.settingsCalls++;
        return { ok: !window.settingsFailure };
      }
      return { ok: true, library: {groups:[],queries:[]} };
    } }, storage: {
      sync: { get: async () => ({ savedUsernames: ['observer'] }) }, onChanged: { addListener: listener => storageListeners.push(listener) }
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
  for (const file of ['url-filters.js', 'saved-users.js', 'saved-taxa.js', 'content.js', 'higher-taxa-core.js', 'explore-tools.js', 'quick-places.js', 'higher-taxa-panel.js']) await page.addScriptTag({ path: path.join(directory, file) });
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

test('native user changes and reset update the sole filter controls without overwriting custom typing', async ({ page }, info) => {
  const modal = await open(page, info);
  await page.evaluate(() => { document.querySelector('[name=user_id]').value = 'other_observer'; });
  await expect(modal.locator('#modal-source-name')).toHaveValue('other_observer');
  await modal.locator('#modal-source').selectOption('custom');
  await modal.locator('#modal-source-name').fill('draft_observer');
  await expect(modal.locator('#modal-source-name')).toHaveValue('draft_observer');
  await page.locator('.btn-default').click();
  await expect(modal.locator('#modal-source')).toHaveValue('none');
  await page.locator('#qg-inat-higher-taxa-trigger button').click();
  await expect(page.locator('#qg-inat-user-filters, #qg-inat-user-filters-summary')).toHaveCount(0);
  await expect(page.locator('#qg-inat-higher-taxa #user-choice')).toBeEnabled();
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

test('filter swap and drafts remain independent of opening and closing comparison', async ({ page }, info) => {
  const modal = await open(page, info);
  const panel = page.locator('#qg-inat-higher-taxa');
  await expect(page.locator('#qg-inat-user-filters, #qg-inat-user-filters-summary')).toHaveCount(0);
  await page.locator('#qg-inat-higher-taxa-trigger button').click();
  await modal.locator('#modal-source').selectOption('custom');
  await modal.locator('#modal-source-name').fill('draft_observer');
  await modal.locator('#modal-exclude').selectOption('user:observer');
  await modal.locator('#modal-swap').click();
  await expect(modal.locator('#modal-source')).toHaveValue('user:observer');
  await expect(modal.locator('#modal-exclude-name')).toHaveValue('draft_observer');
  await panel.locator('.close').click();
  await expect(modal.locator('#modal-source')).toBeVisible();
  await page.locator('#qg-inat-higher-taxa-trigger button').click();
  await expect(modal.locator('#modal-exclude-name')).toHaveValue('draft_observer');
  await expect(modal.locator('#modal-source')).toHaveValue('user:observer');
  // User-filter input events are not comparison edits: native place changes
  // should still update an unedited comparison rather than preserve a draft.
  await page.evaluate(() => history.replaceState({}, '', '/observations?user_id=observer&taxon_id=3&month=9'));
  await expect(panel.locator('#place')).toHaveValue('');
  await expect(panel.locator('#status')).not.toContainText('保留当前填写内容');
});

test('native update applies user filters and preserves taxon, places and dates', async ({ page }, info) => {
  const modal = await open(page, info);
  await modal.locator('#modal-source').selectOption('custom');
  await modal.locator('#modal-source-name').fill('new_observer');
  await modal.locator('#modal-exclude').selectOption('user:observer');
  await page.locator('.btn-primary').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('unobserved_by_user_id')).toBe('observer');
  const params = new URL(page.url()).searchParams;
  expect(params.get('user_id')).toBe('new_observer');
  expect(params.get('unobserved_by_user_id')).toBe('observer');
  expect(params.get('taxon_id')).toBe('3'); expect(params.get('place_id')).toBe('7613'); expect(params.get('month')).toBe('9');
});

test('clearing exclusion through the native filter controls does not resurrect it', async ({ page }, info) => {
  const modal = await open(page, info, '?user_id=observer&unobserved_by_user_id=other_observer&taxon_id=3');
  await expect(modal.locator('#modal-exclude-name')).toHaveValue('other_observer');
  await modal.locator('#modal-exclude').selectOption('none');
  await page.locator('.btn-primary').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('unobserved_by_user_id')).toBeNull();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('qgInatPendingUnobservedUser'))).toBeNull();
  await page.locator('.btn-primary').click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('qgInatPendingUnobservedUser'))).toBeNull();
  expect(new URL(page.url()).searchParams.get('unobserved_by_user_id')).toBeNull();
  expect(new URL(page.url()).searchParams.get('user_id')).toBe('observer');
});

test('the remaining settings entry preserves custom drafts and exposes failures in the filter menu', async ({ page }, info) => {
  const modal = await open(page, info);
  await modal.locator('#modal-source').selectOption('custom');
  await modal.locator('#modal-source-name').fill('draft_observer');
  await modal.locator('#modal-source').selectOption('settings');
  await expect.poll(() => page.evaluate(() => settingsCalls)).toBe(1);
  await expect(modal.locator('#modal-source')).toHaveValue('custom');
  await expect(modal.locator('#modal-source-name')).toHaveValue('draft_observer');
  await modal.locator('#modal-exclude').selectOption('user:observer');
  await page.evaluate(() => { window.settingsFailure = true; });
  await modal.locator('#modal-exclude').selectOption('settings');
  await expect(modal.locator('#modal-exclude')).toHaveValue('user:observer');
  await expect(modal.locator('#modal-message')).toContainText('无法打开设置');
  await page.evaluate(() => storageListeners.forEach(listener => listener({ savedUsernames: { newValue: ['observer', 'another'] } }, 'sync')));
  await expect(modal.locator('#modal-source option[value="user:another"]')).toHaveCount(1);
  await expect(modal.locator('#modal-source')).toHaveValue('custom');
  await expect(modal.locator('#modal-source-name')).toHaveValue('draft_observer');
  await expect(modal.locator('#modal-exclude')).toHaveValue('user:observer');
});

test('native menu remount and repeated injection keep only one filter group with no comparison entry', async ({ page }, info) => {
  const modal = await open(page, info);
  await modal.locator('#modal-exclude').selectOption('custom');
  await modal.locator('#modal-exclude-name').fill('draft_exclude');
  await page.evaluate(() => {
    const menu = document.querySelector('#more-filters');
    const replacement = menu.cloneNode(true);
    replacement.querySelector('#qg-inat-native-filter-tools').remove();
    menu.replaceWith(replacement);
    sessionStorage.setItem('qgInatUserFiltersCollapsed', '0');
  });
  const directory = path.resolve(__dirname, '../../build', info.project.name.split('-')[0], 'scripts');
  await page.addScriptTag({ path: path.join(directory, 'content.js') });
  await expect(page.locator('#more-filters > .row > .col-xs-4:nth-child(2) > #qg-inat-native-filter-tools')).toHaveCount(1);
  await expect(modal.locator('#modal-exclude-name')).toHaveValue('draft_exclude');
  await page.locator('#qg-inat-higher-taxa-trigger button').click();
  await expect(page.locator('#qg-inat-user-filters, #qg-inat-user-filters-summary, #qg-inat-higher-taxa .user-tools')).toHaveCount(0);
  await expect(page.locator('#qg-inat-higher-taxa #user-choice')).toBeVisible();
  await page.evaluate(() => history.replaceState({}, '', '/observations/123'));
  await expect(modal).toHaveCount(0);
  await page.evaluate(() => history.replaceState({}, '', '/observations?user_id=observer'));
  await expect(modal).toHaveCount(1);
  await expect(page.locator('#qg-inat-user-filters, #qg-inat-user-filters-summary')).toHaveCount(0);
});
