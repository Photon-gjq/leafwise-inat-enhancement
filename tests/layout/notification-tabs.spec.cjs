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
