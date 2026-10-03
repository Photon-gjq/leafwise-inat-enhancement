const { test, expect } = require('@playwright/test');
const path = require('node:path');

const initial = `<!doctype html><meta charset="utf-8">
<div id="header"><ul><li id="messagesnav" class="navtab messages"><div class="dropdown"><div id="messagessubnav" class="dropdown-menu"></div></div></li>
<li id="updatesnav" class="navtab updates"><div class="dropdown open"><div id="updatessubnav" class="dropdown-menu"><div class="loadingwrapper">載入中</div></div></div></li></ul></div>`;

const updates = `<ul>
<li><a href="https://www.inaturalist.org/observations/101#activity_identification_first">第一則</a></li>
<li><a href="/observations/202#activity_comment_second">第二則</a></li>
<li><a href="/observations/101#activity_identification_third">同一觀察的第三則</a></li>
<li><a href="https://evil.example/observations/303">站外連結</a></li>
<li><a href="/observations?user_id=someone">觀察搜尋</a></li>
<li><center><a class="readmore" href="/home">查看您的儀表板</a></center></li></ul>`;

test('notification dropdown opens unique observations only after explicit click', async ({ page }, testInfo) => {
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({ contentType: 'text/html', body: initial }));
  await page.goto('https://www.inaturalist.org/home');
  await page.evaluate(() => {
    window.sent = [];
    window.chrome = { runtime: { sendMessage: async message => {
      window.sent.push(message);
      return { ok: true, opened: message.observationIds.length };
    } } };
    window.browser = window.chrome;
  });
  const directory = path.resolve(__dirname, '../../build', testInfo.project.name.split('-')[0], 'scripts');
  await page.addScriptTag({ path: path.join(directory, 'notification-filter.js') });
  await page.addScriptTag({ path: path.join(directory, 'notification-tabs.js') });
  await expect(page.locator('#updatessubnav .leafwise-open-update-observations')).toHaveCount(0);
  await page.locator('#updatessubnav').evaluate((menu, html) => { menu.innerHTML = html; }, updates);
  const button = page.locator('#updatessubnav .leafwise-open-update-observations button');
  await expect(button).toHaveText('一鍵開啟這些觀察（2）');
  await button.click();
  await expect.poll(() => page.evaluate(() => window.sent.length)).toBe(1);
  expect(await page.evaluate(() => window.sent[0].observationIds)).toEqual(['101', '202']);
  await expect(page.locator('#messagessubnav .leafwise-open-update-observations')).toHaveCount(0);
});

const id = (taxonId = 100, extra = {}) => ({
  id: 20, userId: 8, taxonId, current: true, createdAt: '2026-10-01T11:00:00Z', ...extra
});
const own = { id: 10, userId: 7, taxonId: 100, current: true, createdAt: '2026-10-01T10:00:00Z' };
const filterUpdates = '<ul>' + [
  ['same', 101, 'identification_20'],
  ['other', 202, 'identification_20'],
  ['ancestor', 303, 'identification_20'],
  ['descendant', 404, 'identification_20'],
  ['duplicate', 404, 'identification_21'],
  ['remark', 505, 'identification_20'],
  ['unknown', 606, 'identification_20'],
  ['comment', 707, 'comment_22']
].map(([name, observation, anchor]) => '<li id="' + name + '"><a href="/observations/' + observation + '#activity_' + anchor + '">' + name + '</a></li>').join('')
  + '<li><center><a href="/home">Dashboard</a></center></li></ul>';

async function filterFixture(page, info, options = {}) {
  await page.route('https://www.inaturalist.org/**', route => route.fulfill({
    contentType: 'text/html', body: initial + '<ul><li class="navtab user"><a class="profile_link" href="/people/7">User</a></li></ul>'
      + '<style>#updatessubnav li{display:block}#updatessubnav{width:320px}</style>'
  }));
  await page.goto('https://www.inaturalist.org/home');
  await page.evaluate(({ options, own, ident }) => {
    window.sent = [];
    window.historyResolvers = [];
    window.savedPreference = options.saved === true;
    window.delayHistory = options.delay === true;
    window.historyFailed = options.fail === true;
    window.fixtures = {
      101: [own, ident],
      202: [own, { ...ident, taxonId: 200 }],
      303: [own, { ...ident, taxonId: 99 }],
      404: [own, { ...ident, taxonId: 101 }, { ...ident, id: 21, taxonId: 101 }],
      505: [own, { ...ident, hasRemark: true }]
    };
    const api = {
      storage: { local: {
        get: async () => ({ leafwiseNotificationFilterV1: window.savedPreference }),
        set: async value => { window.savedPreference = value.leafwiseNotificationFilterV1; }
      } },
      runtime: { sendMessage: async message => {
        window.sent.push(message);
        if (message.type === 'leafwise-update-identifications') {
          const observations = Object.fromEntries(message.observationIds.map(key => [key, window.fixtures[key] || null]));
          if (window.delayHistory) await new Promise(resolve => window.historyResolvers.push(resolve));
          return window.historyFailed ? { ok: false } : { ok: true, observations };
        }
        return { ok: true, opened: message.observationIds.length };
      } }
    };
    window.chrome = api;
    window.browser = api;
  }, { options, own, ident: id() });
  const directory = path.resolve(__dirname, '../../build', info.project.name.split('-')[0], 'scripts');
  for (const script of ['notification-filter.js', 'notification-tabs.js']) {
    await page.addScriptTag({ path: path.join(directory, script) });
  }
  await page.locator('#updatessubnav').evaluate((menu, html) => { menu.innerHTML = html; }, filterUpdates);
  return {
    checkbox: page.locator('.leafwise-notification-filter'),
    button: page.locator('.leafwise-open-update-observations button'),
    hint: page.locator('.leafwise-notification-filter-status'),
    directory
  };
}

test('filter hides exact matches only, retains hierarchy changes, comments and unknowns, and opens visible unique observations', async ({ page }, info) => {
  const { checkbox, button, hint } = await filterFixture(page, info);
  await expect(checkbox).not.toBeChecked();
  await expect(button).toHaveText('一鍵開啟這些觀察（7）');
  expect(await page.evaluate(() => window.sent.length)).toBe(0);
  await page.locator('#same').evaluate(row => row.style.setProperty('display', 'inline-block', 'important'));
  await checkbox.check();
  await expect(page.locator('#same')).toBeHidden();
  for (const name of ['other', 'ancestor', 'descendant', 'duplicate', 'remark', 'unknown', 'comment']) {
    await expect(page.locator('#' + name)).toBeVisible();
  }
  await expect(hint).toHaveText('無法判斷的消息已保留');
  await expect(button).toHaveText('開啟篩選後的觀察（6）');
  expect(await page.evaluate(() => window.sent[0].observationIds)).toEqual([101, 202, 303, 404, 505, 606]);
  await button.click();
  expect(await page.evaluate(() => window.sent.find(message => message.type === 'leafwise-open-update-observations').observationIds))
    .toEqual(['202', '303', '404', '505', '606', '707']);
  await checkbox.uncheck();
  await expect(page.locator('#same')).toBeVisible();
  expect(await page.locator('#same').evaluate(row => [row.hidden, row.style.display, row.style.getPropertyPriority('display')]))
    .toEqual([false, 'inline-block', 'important']);
  expect(await page.evaluate(() => window.savedPreference)).toBe(false);
});

test('failed API retains every update without repeated requests or modifying native links', async ({ page }, info) => {
  const { checkbox, button, hint } = await filterFixture(page, info, { fail: true });
  const before = await page.locator('#updatessubnav li > a').evaluateAll(links => links.map(link => link.href));
  await checkbox.check();
  await expect(button).toHaveText('開啟篩選後的觀察（7）');
  await expect(button).toBeEnabled();
  await expect(hint).toHaveText('無法判斷的消息已保留');
  await expect(page.locator('#same')).toBeVisible();
  expect(await page.evaluate(() => window.sent.length)).toBe(1);
  expect(await page.locator('#updatessubnav li > a').evaluateAll(links => links.map(link => link.href))).toEqual(before);
});

test('switching off during loading ignores late replies and restores unfiltered opening', async ({ page }, info) => {
  const { checkbox, button, hint } = await filterFixture(page, info, { delay: true });
  await checkbox.check();
  await expect(hint).toHaveText('正在篩選鑑定…');
  await expect(button).toBeDisabled();
  await checkbox.uncheck();
  await page.evaluate(() => window.historyResolvers[0]());
  await expect(button).toHaveText('一鍵開啟這些觀察（7）');
  await expect(page.locator('#same')).toBeVisible();
  await button.click();
  expect(await page.evaluate(() => window.sent.at(-1).observationIds)).toEqual(['101', '202', '303', '404', '505', '606', '707']);
});

test('menu replacement and repeated injection preserve one switch and ignore stale results', async ({ page }, info) => {
  const { checkbox, button, directory } = await filterFixture(page, info, { delay: true });
  await checkbox.check();
  await expect.poll(() => page.evaluate(() => window.historyResolvers.length)).toBe(1);
  await page.locator('#updatessubnav').evaluate(menu => {
    menu.innerHTML = '<ul><li id="replacement"><a href="/observations/202#activity_identification_20">New menu</a></li><li><center>Dashboard</center></li></ul>';
  });
  await expect.poll(() => page.evaluate(() => window.historyResolvers.length)).toBe(2);
  await page.addScriptTag({ path: path.join(directory, 'notification-tabs.js') });
  await expect(checkbox).toHaveCount(1);
  await page.evaluate(() => window.historyResolvers[0]());
  await expect(button).toBeDisabled();
  await page.evaluate(() => window.historyResolvers[1]());
  await expect(button).toBeEnabled();
  await expect(button).toHaveText('開啟篩選後的觀察（1）');
  await expect(page.locator('#replacement')).toBeVisible();
});

test('saved preference applies to asynchronously loaded updates; same-list new anchors refresh data', async ({ page }, info) => {
  const { checkbox, button } = await filterFixture(page, info, { saved: true });
  await expect(checkbox).toBeChecked();
  await expect(page.locator('#same')).toBeHidden();
  await page.evaluate(() => {
    window.fixtures[101] = [...window.fixtures[101], { ...window.fixtures[101][1], id: 30 }];
    document.querySelector('#same a').href = '/observations/101#activity_identification_30';
  });
  await expect.poll(() => page.evaluate(() => window.sent.filter(message => message.type === 'leafwise-update-identifications').length)).toBe(2);
  await expect(page.locator('#same')).toBeHidden();
  await expect(button).toBeEnabled();
});

test('missing viewer and later viewer changes keep uncertain updates and discard old-account results', async ({ page }, info) => {
  const { checkbox, hint, button } = await filterFixture(page, info, { delay: true });
  await checkbox.check();
  await expect.poll(() => page.evaluate(() => window.historyResolvers.length)).toBe(1);
  await page.evaluate(() => {
    document.querySelector('.profile_link').href = '/people/9';
    window.delayHistory = false;
    window.historyResolvers[0]();
  });
  await expect(page.locator('#same')).toBeVisible();
  await expect(hint).toHaveText('無法判斷的消息已保留');
  await expect(button).toBeEnabled();
  const requests = await page.evaluate(() => window.sent.length);
  await checkbox.uncheck();
  await page.locator('.profile_link').evaluate(link => link.remove());
  await checkbox.check();
  await expect(hint).toHaveText('無法判斷的消息已保留');
  expect(await page.evaluate(() => window.sent.length)).toBe(requests);
});

test('pagehide restores rows and back-forward cache resume rechecks the filter', async ({ page }, info) => {
  const { checkbox } = await filterFixture(page, info);
  await checkbox.check();
  await expect(page.locator('#same')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#same')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('#same')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#same')).toBeVisible();
});
