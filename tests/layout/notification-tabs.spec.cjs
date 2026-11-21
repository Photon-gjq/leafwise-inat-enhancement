const { test, expect } = require('@playwright/test');
const path = require('node:path');

const own = { id: 10, userId: 7, taxonId: 100, current: true, createdAt: '2026-10-01T10:00:00Z' };
const ident = (extra = {}) => ({ id: 20, userId: 8, taxonId: 100, current: true, createdAt: '2026-10-01T11:00:00Z', ...extra });
const row = (id, href, text = id) => `<li id="${id}"><a href="${href}">${text}</a></li>`;
const list = rows => '<ul>' + rows.join('') + '<li><center><a href="/home">Dashboard</a></center></li></ul>';
const many = n => list(Array.from({ length: n }, (_, i) => row('r' + i, '/observations/' + (100 + i) + '#activity_comment_' + (1000 + i))));
const updates = list([
  row('same', '/observations/101#activity_identification_20'),
  row('other', '/observations/202#activity_identification_20'),
  row('ancestor', '/observations/303#activity_identification_20'),
  row('descendant', '/observations/404#activity_identification_20'),
  row('duplicate', '/observations/404#activity_identification_21'),
  row('remark', '/observations/505#activity_identification_20'),
  row('unknown', '/observations/606#activity_identification_20'),
  row('comment', '/observations/707#activity_comment_22')
]);

async function fixture(page, info, options = {}) {
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="' + (options.lang || 'en') + '"><meta charset="utf-8"><style>body{font:14px Arial}#updatessubnav{width:320px;max-width:100%}ul{padding:0}li{display:block}button{cursor:pointer}input{box-sizing:border-box}</style>'
    + '<div id="header"><ul><li class="navtab user"><a class="profile_link" href="/people/7">User</a></li>'
    + '<li id="messagesnav"><div id="messagessubnav"></div></li>'
    + '<li id="updatesnav"><div id="updatessubnav"><div>Loading</div></div></li></ul></div></html>' }));
  await page.addInitScript(({ options, own, reference }) => {
    window.sent = []; window.created = []; window.historyResolvers = []; window.redirectResolvers = [];
    window.failPaths = []; window.storageFailed = false; window.delayHistory = options.delay === true;
    window.historyFailed = options.fail === true;
    window.fixtures = { 101: [own, reference], 202: [own, { ...reference, taxonId: 200 }],
      303: [own, { ...reference, taxonId: 99 }], 404: [own, { ...reference, taxonId: 101 }, { ...reference, id: 21, taxonId: 101 }],
      505: [own, { ...reference, hasRemark: true }] };
    const listeners = [];
    const read = () => JSON.parse(localStorage.getItem('fixture-storage') || '{}');
    if (options.saved && !localStorage.getItem('fixture-storage')) localStorage.setItem('fixture-storage', JSON.stringify({ leafwiseNotificationFilterV1: true }));
    const storage = {
      get: async key => { if (window.storageFailed) throw Error('storage'); const data = read(); return { [key]: data[key] }; },
      set: async values => {
        if (window.storageFailed) throw Error('storage');
        const data = read(), changes = {};
        for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: data[key], newValue: value }; data[key] = value; }
        localStorage.setItem('fixture-storage', JSON.stringify(data));
        queueMicrotask(() => listeners.forEach(listener => listener(changes, 'local')));
      }
    };
    const api = { storage: { local: storage, onChanged: { addListener: fn => listeners.push(fn) } }, runtime: {
      sendMessage: async message => {
        window.sent.push(message);
        if (message.type === 'leafwise-notification-queue') {
          window.queueService ||= window.LeafwiseNotificationQueue.createService({ storage, createTab: async tab => {
            if (window.failPaths.includes(new URL(tab.url).pathname)) throw Error('blocked');
            window.created.push(tab);
          } });
          try { return await window.queueService(message, { tab: { windowId: 7 } }); } catch { return { ok: false }; }
        }
        if (message.type === 'leafwise-update-identifications') {
          if (window.delayHistory) await new Promise(resolve => window.historyResolvers.push(resolve));
          return window.historyFailed ? { ok: false } : { ok: true, observations:
            Object.fromEntries(message.observationIds.map(id => [id, window.fixtures[id] || null])) };
        }
        throw Error('Unexpected message');
      }
    } };
    window.chrome = api; window.browser = api;
    window.fetch = async () => { throw Error('offline'); };
  }, { options, own, reference: ident() });
  await page.goto('https://www.inaturalist.org/home');
  const directory = path.resolve(__dirname, '../../build', info.project.name.split('-')[0], 'scripts');
  const mount = async () => {
    for (const script of ['i18n-catalog.js', 'i18n.js', 'notification-filter.js', 'notification-queue.js', 'notification-tabs.js']) await page.addScriptTag({ path: path.join(directory, script) });
  };
  await mount();
  const replace = async html => page.locator('#updatessubnav').evaluate((menu, value) => { menu.innerHTML = value; }, html);
  if (!options.empty) await replace(options.html || updates);
  return { mount, replace, directory, button: page.locator('.leafwise-notification-open'),
    checkbox: page.locator('.leafwise-notification-filter'), count: page.locator('.leafwise-notification-count'),
    hint: page.locator('.leafwise-notification-filter-status'), batch: page.locator('.leafwise-notification-batch'),
    status: page.locator('.leafwise-notification-status') };
}
const createdPaths = page => page.evaluate(() => window.created.map(tab => new URL(tab.url).pathname));

test('captures all 60 before a click; opens only 10; menu shrink, refresh and worker restart preserve the other 50', async ({ page }, info) => {
  const ui = await fixture(page, info, { empty: true });
  await expect(ui.button).toHaveCount(0);
  await ui.replace(many(60));
  await expect(ui.count).toHaveText('Waiting to open: 60 pages');
  await expect(ui.button).toHaveText('Open next batch (10)');
  expect(await createdPaths(page)).toEqual([]);
  await ui.button.click();
  await expect(ui.count).toHaveText('Waiting to open: 50 pages');
  expect((await createdPaths(page)).length).toBe(10);
  await ui.replace(many(9));
  await expect(ui.count).toHaveText('Waiting to open: 50 pages');
  await page.reload(); await ui.mount(); await ui.replace(many(9));
  await expect(ui.count).toHaveText('Waiting to open: 50 pages');
  await ui.button.click();
  await expect(ui.count).toHaveText('Waiting to open: 40 pages');
  expect(await createdPaths(page)).toEqual(Array.from({ length: 10 }, (_, i) => '/observations/' + (110 + i)));
});

test('filters exact IDs only; hidden items survive opening and become available when the switch is turned off', async ({ page }, info) => {
  const ui = await fixture(page, info);
  await expect(ui.count).toHaveText('Waiting to open: 7 pages');
  await page.locator('#same').evaluate(row => row.style.setProperty('display', 'inline-block', 'important'));
  await ui.checkbox.check();
  await expect(page.locator('#same')).toBeHidden();
  for (const id of ['other', 'ancestor', 'descendant', 'duplicate', 'remark', 'unknown', 'comment']) await expect(page.locator('#' + id)).toBeVisible();
  await expect(ui.count).toHaveText('Waiting to open: 6 pages · 1 pages hidden by filter');
  await expect(ui.hint).toHaveText('Uncertain updates kept');
  await ui.button.click();
  expect(await createdPaths(page)).toEqual(['/observations/202', '/observations/303', '/observations/404', '/observations/505', '/observations/606', '/observations/707']);
  await expect(ui.button).toBeDisabled();
  await ui.checkbox.uncheck();
  await expect(ui.count).toHaveText('Waiting to open: 1 pages');
  expect(await page.locator('#same').evaluate(row => [row.hidden, row.style.display, row.style.getPropertyPriority('display')])).toEqual([false, 'inline-block', 'important']);
  await ui.button.click();
  expect((await createdPaths(page)).at(-1)).toBe('/observations/101');
});

test('filter failure retains unknowns and never changes native hrefs or repeatedly requests the same history', async ({ page }, info) => {
  const ui = await fixture(page, info, { fail: true });
  const before = await page.locator('#updatessubnav li > a').evaluateAll(links => links.map(link => link.href));
  await ui.checkbox.check();
  await expect(ui.button).toBeEnabled(); await expect(ui.count).toHaveText('Waiting to open: 7 pages');
  await expect(ui.hint).toHaveText('Uncertain updates kept');
  expect(await page.locator('#updatessubnav li > a').evaluateAll(links => links.map(link => link.href))).toEqual(before);
  expect(await page.evaluate(() => window.sent.filter(m => m.type === 'leafwise-update-identifications').length)).toBe(1);
});

test('turning off during history loading ignores late responses and restores the complete queue', async ({ page }, info) => {
  const ui = await fixture(page, info, { delay: true });
  await ui.checkbox.check(); await expect(ui.hint).toHaveText('Checking identifications…'); await expect(ui.button).toBeDisabled();
  await ui.checkbox.uncheck(); await page.evaluate(() => window.historyResolvers.forEach(resolve => resolve()));
  await expect(ui.button).toBeEnabled(); await expect(page.locator('#same')).toBeVisible();
  await ui.button.click(); expect((await createdPaths(page)).length).toBe(7);
});

test('new menu snapshots merge; repeated injection is inert; new events can requeue an already opened observation', async ({ page }, info) => {
  const ui = await fixture(page, info, { html: list([row('one', '/observations/101#activity_comment_1')]) });
  await expect(ui.button).toBeEnabled(); await ui.button.click();
  await expect(ui.count).toHaveText('Waiting to open: 0 pages');
  await ui.replace(list([row('old', '/observations/101#activity_comment_1'), row('new', '/observations/202#activity_comment_2')]));
  await expect(ui.count).toHaveText('Waiting to open: 1 pages');
  await ui.mount(); await expect(ui.checkbox).toHaveCount(1);
  await ui.replace(list([row('newer', '/observations/101#activity_comment_3')]));
  await expect(ui.count).toHaveText('Waiting to open: 2 pages');
  await ui.button.click(); expect(await createdPaths(page)).toEqual(['/observations/101', '/observations/202', '/observations/101']);
});

test('batch preference persists and invalid values never change the opening limit', async ({ page }, info) => {
  const ui = await fixture(page, info, { html: many(25) });
  await expect(ui.button).toBeEnabled();
  await ui.batch.fill('5'); await ui.batch.dispatchEvent('change');
  await expect(ui.button).toHaveText('Open next batch (5)');
  await ui.batch.fill('0'); await ui.batch.dispatchEvent('change');
  await expect(ui.status).toHaveText('Enter a whole number from 1 to 50.');
  await ui.button.click(); expect((await createdPaths(page)).length).toBe(5);
  await page.reload(); await ui.mount(); await ui.replace(many(9));
  await expect(ui.batch).toHaveValue('5'); await expect(ui.count).toHaveText('Waiting to open: 20 pages');
});

test('partial tab failures are retryable and storage failure cannot consume entries or create pages', async ({ page }, info) => {
  const ui = await fixture(page, info, { html: many(3) });
  await expect(ui.button).toBeEnabled();
  await page.evaluate(() => { window.failPaths = ['/observations/101']; });
  await ui.button.click(); await expect(ui.count).toHaveText('Waiting to open: 1 pages');
  expect(await createdPaths(page)).toEqual(['/observations/100', '/observations/102']);
  await page.evaluate(() => { window.storageFailed = true; });
  await ui.button.click(); await expect(ui.status).toHaveText('Cannot save queue; retry');
  await expect(ui.button).toBeDisabled(); expect((await createdPaths(page)).length).toBe(2);
  await page.evaluate(() => { window.storageFailed = false; window.failPaths = []; });
  await page.locator('.leafwise-notification-retry').click();
  await expect(ui.button).toBeEnabled(); await ui.button.click();
  await expect(ui.count).toHaveText('Waiting to open: 0 pages');
  expect((await createdPaths(page)).at(-1)).toBe('/observations/101');
});

test('queue inspection and confirmed clearing preserve seen markers; cancelling leaves everything intact', async ({ page }, info) => {
  const ui = await fixture(page, info, { html: many(3) });
  await expect(ui.button).toBeEnabled();
  await page.locator('.leafwise-notification-list summary').click();
  await expect(page.locator('.leafwise-notification-list ol button')).toHaveCount(3);
  await page.locator('.leafwise-notification-list ol button').nth(1).click();
  await expect(ui.count).toHaveText('Waiting to open: 2 pages');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.leafwise-notification-clear').click(); await expect(ui.count).toHaveText('Waiting to open: 2 pages');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.leafwise-notification-clear').click(); await expect(ui.count).toHaveText('Waiting to open: 0 pages');
  await ui.replace(many(3)); await expect(ui.count).toHaveText('Waiting to open: 0 pages');
  await page.reload(); await ui.mount(); await ui.replace(many(3)); await expect(ui.button).toBeDisabled();
});

test('mention resolutions deduplicate observations and flags, skip journals, and keep failed permalinks', async ({ page }, info) => {
  const ui = await fixture(page, info, { empty: true });
  await page.evaluate(() => {
    window.permalinkRequests = [];
    window.fetch = async (url, options) => {
      window.permalinkRequests.push({ url, credentials: options.credentials });
      const target = { 801: '/observations/101#activity_comment_801', 802: '/flags/202', 803: '/journal/user/1' }[new URL(url).pathname.split('/').at(-1)];
      if (!target) throw Error('offline');
      return { url: location.origin + target, body: { cancel: async () => {} } };
    };
  });
  await ui.replace(list([
    row('same', '/observations/101#activity_identification_20'), row('mention', '/comments/801'),
    row('flag', '/flags/202'), row('flag-comment', '/flags/202#activity_comment_802'), row('flag-mention', '/comments/802'),
    row('journal', '/comments/803'), row('failed', '/identifications/804'), row('favorite', '/observations/303'),
    row('external', 'https://evil.example/observations/404'), row('edit', '/flags/303/edit')
  ]));
  await expect(ui.button).toBeEnabled(); await ui.checkbox.check(); await expect(page.locator('#same')).toBeHidden();
  await expect(ui.count).toHaveText('Waiting to open: 4 pages');
  await ui.button.click();
  expect(await createdPaths(page)).toEqual(['/observations/101', '/flags/202', '/identifications/804', '/observations/303']);
  expect(await page.evaluate(() => window.permalinkRequests.every(item => item.credentials === 'omit'))).toBe(true);
  expect(await page.evaluate(() => window.permalinkRequests.length)).toBe(4);
});

test('replaced menus retain pending mentions, resolve with two workers, and pagehide rejects late results', async ({ page }, info) => {
  const ui = await fixture(page, info, { empty: true });
  await page.evaluate(() => {
    window.fetch = (url, options) => new Promise(resolve => window.redirectResolvers.push({ url, signal: options.signal,
      resolve: id => resolve({ url: location.origin + '/observations/' + id }) }));
  });
  await ui.replace(list([row('a', '/comments/801'), row('b', '/comments/802'), row('c', '/comments/803')]));
  await expect.poll(() => page.evaluate(() => window.redirectResolvers.length)).toBe(2);
  await ui.replace(list([row('d', '/comments/804')]));
  expect(await page.evaluate(() => window.redirectResolvers.length)).toBe(2);
  // Each resolution batch has two workers; new captures must not create a
  // second parallel batch while an earlier batch is active.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate(() => window.redirectResolvers.every(item => item.signal.aborted))).toBe(true);
  await page.evaluate(() => window.redirectResolvers.forEach((item, i) => item.resolve(100 + i)));
  await page.evaluate(() => { window.fetch = async () => { throw Error('offline'); }; window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  await expect(ui.button).toBeEnabled(); await expect(ui.count).toHaveText('Waiting to open: 4 pages');
  expect(await createdPaths(page)).toEqual([]);
});

test('timeout retains every queued mention without permanently disabling opening', async ({ page }, info) => {
  const ui = await fixture(page, info, { empty: true });
  await page.evaluate(() => {
    const original = window.setTimeout;
    window.setTimeout = (fn, delay, ...args) => original(fn, delay === 10000 ? 30 : delay, ...args);
    window.fetch = (url, { signal }) => new Promise((resolve, reject) => {
      if (signal.aborted) reject(Error('aborted')); else signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
    });
  });
  await ui.replace(list([row('a', '/comments/801'), row('b', '/comments/802'), row('c', '/comments/803')]));
  await expect(ui.button).toBeEnabled(); await expect(ui.count).toHaveText('Waiting to open: 3 pages');
  await ui.button.click(); expect(await createdPaths(page)).toEqual(['/comments/801', '/comments/802', '/comments/803']);
});

test('account changes isolate queues; logout hides saved items and never mixes late history', async ({ page }, info) => {
  const ui = await fixture(page, info, { saved: true, delay: true });
  await expect.poll(() => page.evaluate(() => window.historyResolvers.length)).toBe(1);
  await page.evaluate(() => { document.querySelector('.profile_link').href = '/people/9'; window.delayHistory = false; });
  await expect(ui.button).toBeDisabled();
  await ui.replace(list([row('account-nine', '/observations/909#activity_comment_1')]));
  await expect(ui.button).toBeEnabled();
  await page.evaluate(() => window.historyResolvers[0]());
  await expect(ui.count).toHaveText('Waiting to open: 1 pages');
  await ui.button.click(); await expect(ui.count).toHaveText('Waiting to open: 0 pages');
  await page.locator('.profile_link').evaluate(link => { link.href = '/people/7'; });
  await ui.replace(updates);
  await expect(page.locator('#same')).toBeHidden(); await expect(ui.count).toContainText('Waiting to open: 6 pages');
  await page.locator('.profile_link').evaluate(link => link.remove());
  await expect(ui.status).toHaveText('Sign in to save the queue'); await expect(ui.button).toBeDisabled();
});

test('pagehide restores native rows; BFcache rechecks filter and recovers a queue even without a native list', async ({ page }, info) => {
  const ui = await fixture(page, info, { saved: true });
  await expect(page.locator('#same')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await expect(page.locator('#same')).toBeVisible();
  await page.locator('#updatessubnav').evaluate(menu => { menu.innerHTML = ''; });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(ui.button).toBeEnabled(); await expect(ui.count).toContainText('Waiting to open: 6 pages');
});

test('native confirmation filtering still applies after the matching queue has already been opened', async ({ page }, info) => {
  const html = list([row('same', '/observations/101#activity_identification_20')]);
  const ui = await fixture(page, info, { html });
  await expect(ui.button).toBeEnabled(); await ui.button.click();
  await expect(ui.count).toHaveText('Waiting to open: 0 pages');
  await ui.checkbox.check(); await expect(page.locator('#same')).toBeHidden();
  await page.reload(); await ui.mount(); await ui.replace(html);
  await expect(ui.checkbox).toBeChecked(); await expect(page.locator('#same')).toBeHidden();
  await expect(ui.button).toBeDisabled();
});

for (const lang of ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'fr', 'de', 'ja', 'ar']) {
  test(`queue labels follow ${lang}, fit a narrow dropdown, and keep IDs and native content intact`, async ({ page }, info) => {
    const ui = await fixture(page, info, { lang, html: many(3) });
    await expect(ui.button).toBeEnabled();
    expect(await ui.button.textContent()).toBe(await page.evaluate(() => LeafwiseI18n.t('開啟下一批（{0}）', 3)));
    await page.locator('.leafwise-notification-list summary').click();
    expect(await page.locator('#r0 a').textContent()).toBe('r0');
    const bounds = await page.locator('.leafwise-open-update-observations').evaluate(node => {
      const outer = node.getBoundingClientRect();
      return [...node.querySelectorAll('button,input,summary')].filter(n => n.getClientRects().length).every(n => {
        const b = n.getBoundingClientRect(); return b.left >= outer.left - 1 && b.right <= outer.right + 1;
      });
    });
    expect(bounds).toBe(true);
    await expect(page.locator('.leafwise-open-update-observations')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    if (lang === 'zh-CN' || lang === 'ar') await page.screenshot({ path: info.outputPath('queue-' + lang + '.png') });
  });
}
