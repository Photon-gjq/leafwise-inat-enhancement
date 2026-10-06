const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const build = info => path.resolve(__dirname, '../../build', info.project.name.split('-')[0]);
async function inject(page, info, names) {
  for (const name of names) await page.addScriptTag({ path: path.join(build(info), 'scripts', name) });
}
const helpers = ['i18n-catalog.js', 'i18n.js'];

test('all 50 locales translate quick region and taxon controls without altering custom names', async ({page}, info) => {
  test.setTimeout(120000);
  const names = require('../../src/i18n/locales.json');
  let lang='en';
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({contentType:'text/html',body:
    `<!doctype html><html lang="${lang}"><meta charset="utf-8"><body><div id="filters"><h1>Native</h1></div></body></html>`}));
  for(const code of Object.keys(names)){
    lang=code;await page.goto('https://www.inaturalist.org/observations?place_id=6803&taxon_id=3');
    await page.evaluate(()=>{
      const api={runtime:{sendMessage:async()=>({ok:true,library:{queries:[],groups:[{id:'p1',name:'我的自訂地區',place:'6803'}]}})},storage:{sync:{get:async()=>({savedUsernames:['observer'],savedTaxa:[{id:3,name:'我的自訂類群'},{id:3,name:'我的排除組合',withoutTaxonIds:[50186]}]})},onChanged:{addListener:()=>{}}}};
      window.chrome=api;window.browser=api;
    });
    await inject(page,info,[...helpers,'url-filters.js','saved-users.js','saved-taxa.js','content.js','higher-taxa-core.js','explore-tools.js','quick-places.js','higher-taxa-panel.js']);
    const quick=page.locator('#leafwise-quick-places');
    const labels=await page.evaluate(()=>({label:LeafwiseI18n.t('快速選擇地點組合…'),manage:LeafwiseI18n.t('管理常用地區…')}));
    await expect(quick.locator('#place-choice')).toHaveAttribute('aria-label',labels.label);
    await expect(quick.locator('#place-choice option[value="settings"]')).toHaveText(labels.manage);
    await expect(quick.locator('#place-choice')).toHaveValue('p1');
    await expect(quick.locator('#place-choice option[value="p1"]')).toHaveText('我的自訂地區');
    await expect(quick.locator('#taxon-choice')).toHaveAttribute('aria-label',await page.evaluate(()=>LeafwiseI18n.t('选择常用类群')));
    await expect(quick.locator('#taxon-choice option[value="settings"]')).toHaveText(await page.evaluate(()=>LeafwiseI18n.t('管理常用类群…')));
    await expect(quick.locator('#taxon-choice option[value="taxon:3"]')).toHaveText('我的自訂類群');
    await expect(quick.locator('#taxon-choice')).toHaveValue('taxon:3');
    await expect(quick.locator('#taxon-choice option[value="taxon:3!50186"]')).toHaveText(await page.evaluate(()=>`我的排除組合 · ${LeafwiseI18n.t('排除 {0}',50186)}`));
    await expect(quick).toHaveAttribute('dir',['ar','he','fa'].includes(code)?'rtl':'ltr');
    await expect(quick.locator('#qg-inat-higher-taxa-trigger button')).toHaveText(await page.evaluate(()=>LeafwiseI18n.t('類群對比')));
    await expect(page.locator('#qg-inat-user-filters-summary')).toBeHidden();
    await quick.locator('#qg-inat-higher-taxa-trigger button').click();
    await expect(page.locator('#qg-inat-user-filters-summary button')).toHaveText(await page.evaluate(()=>LeafwiseI18n.t('用户筛选：未启用')));
    await expect(page.locator('#filters h1')).toContainText('Native');
    await page.evaluate(() => {
      history.replaceState({}, '', '/observations/identify?place_id=6803&taxon_id=3&without_taxon_id=50186');
      const identify = document.createElement('div'); identify.id = 'Identify';
      identify.innerHTML = '<div><form class="SearchBar"><input name="place_id" type="hidden"></form></div>';
      document.body.append(identify);
    });
    await expect(quick).toHaveAttribute('data-page','identify');
    await expect(quick.locator('#taxon-choice')).toHaveValue('taxon:3!50186');
    await expect(quick.locator('#place-choice')).toHaveValue('p1');
    await expect(quick.locator('#qg-inat-higher-taxa-trigger')).toBeHidden();
    await expect(quick.locator('#taxon-choice')).toHaveAttribute('aria-label',await page.evaluate(()=>LeafwiseI18n.t('选择常用类群')));
    await expect(quick.locator('#place-choice')).toHaveAttribute('aria-label',labels.label);
  }
});

test('all 50 locales render the translated notification action and keep native content intact', async ({ page }, info) => {
  test.setTimeout(120000);
  const names = require('../../src/i18n/locales.json');
  let lang = 'en';
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body:
    `<!doctype html><html lang="${lang}"><meta charset="utf-8"><body><p id="native">停止</p><li id="updatesnav"><div id="updatessubnav"><ul><li><a href="/observations/101">Native update</a></li><li><center>Dashboard</center></li></ul></div></li></body></html>` }));
  for (const code of Object.keys(names)) {
    lang = code;
    await page.goto('https://www.inaturalist.org/home');
    await inject(page, info, [...helpers, 'notification-filter.js', 'notification-tabs.js']);
    const expected = await page.evaluate(() => LeafwiseI18n.t('一鍵開啟這些觀察（{0}）', 1));
    await expect(page.locator('.leafwise-open-update-observations button')).toHaveText(expected);
    const filterText = await page.evaluate(() => LeafwiseI18n.t('僅顯示非完全贊同的鑑定'));
    await expect(page.locator('.leafwise-open-update-observations label span')).toHaveText(filterText);
    await page.locator('.leafwise-notification-filter').check();
    const filtered = await page.evaluate(() => LeafwiseI18n.t('開啟篩選後的觀察（{0}）', 1));
    await expect(page.locator('.leafwise-open-update-observations button')).toHaveText(filtered);
    await expect(page.locator('.leafwise-open-update-observations')).toHaveAttribute('dir', ['ar', 'he', 'fa'].includes(code) ? 'rtl' : 'ltr');
    expect(expected).not.toContain('{0}');
    await expect(page.locator('#native')).toHaveText('停止');
  }
});

for (const code of ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'fr', 'ja', 'ar']) {
  test(`uploader labels, safe templates and collapsed geometry: ${code}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body:
      `<!doctype html><html lang="${code}"><meta charset="utf-8"><style>body{margin:0}.nav_add_obs{position:fixed;top:50px;left:0;right:0;height:50px;background:white}.select{width:120px}#imageGrid{margin:160px 20px}.card{position:relative;width:250px;height:200px;border:1px solid}.remove-card{position:absolute;right:-10px;top:-10px;width:28px;height:28px}</style><body><div class="uploader"><nav class="nav_add_obs"><li class="select"><form><label>Native checkbox<input type="checkbox"></label></form></li></nav><div id="imageGrid"><div class="card"><button class="remove-card">×</button></div></div></div><p id="native">手動分類</p></body></html>` }));
    await page.goto('https://www.inaturalist.org/observations/upload');
    await page.evaluate(() => {
      window.module = { exports: { native: true } };
      window.LeafwiseUploadAdapter = { cards: () => [], close: () => {} };
    });
    const before = await page.locator('.nav_add_obs').boundingBox();
    await inject(page, info, [...helpers, 'uploader-ai-core.js', 'uploader-ai-panel.js']);
    const labels = await page.evaluate(() => ({ expand: LeafwiseI18n.t('展開'), stop: LeafwiseI18n.t('停止'), score: LeafwiseI18n.t('綜合分數 >') }));
    const panel = page.locator('#leafwise-upload-ai');
    await expect(panel.locator('#toggle')).toHaveText(labels.expand);
    const box = await panel.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(1024);
    expect((await page.locator('.nav_add_obs').boundingBox()).height).toBe(before.height);
    await page.locator('.remove-card').click();
    await panel.locator('#toggle').click();
    await expect(panel.locator('#stop')).toHaveText(labels.stop);
    await expect(panel.locator('#threshold-label')).toContainText(labels.score);
    await expect(panel.locator('section')).toHaveAttribute('dir', code === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('#native')).toHaveText('手動分類');
    expect(await page.evaluate(() => module.exports.native)).toBe(true);
    const safe = await page.evaluate(() => {
      LeafwiseTranslations.locales.en['Stop'] = '$& <img src=x onerror=alert(1)>';
      document.documentElement.lang = 'en';
      return LeafwiseI18n.html('<button>停止</button><style>.停止{color:red}</style>');
    });
    expect(safe).toContain('$&amp; &lt;img');
    expect(safe).toContain('.停止{color:red}');
    await page.screenshot({ path: info.outputPath(`i18n-${code}.png`) });
  });
}

test('settings follow last site language and never translate saved input', async ({ page }, info) => {
  const html = fs.readFileSync(path.join(build(info), 'options/options.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://www.inaturalist.org/options-fixture');
  await page.evaluate(() => {
    const saved = { savedUsernames: ['observer'], savedTaxa: [{ id: 3, name: '我的自訂名稱' }] };
    const api = { runtime:{sendMessage:async()=>({ok:true,library:{queries:[],groups:[]}})}, storage: { local: { get: async () => ({ leafwiseLastSiteLocale: 'fr' }) }, sync: { get: async () => saved, set: async value => { window.savedResult = value; } } } };
    window.chrome = api; window.browser = api;
  });
  await inject(page, info, [...helpers, 'saved-users.js', 'saved-taxa.js','higher-taxa-core.js','explore-tools.js']);
  await page.addScriptTag({ path: path.join(build(info), 'options/options.js') });
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#page-title')).toHaveText('Paramètres Leafwise');
  await expect(page.locator('#taxa')).toHaveValue('3 = 我的自訂名稱');
  await expect(page.locator('#username')).toHaveValue('observer');
  await page.locator('#users-form button').click();
  expect(await page.evaluate(() => savedResult.savedUsernames)).toEqual(['observer']);
});
