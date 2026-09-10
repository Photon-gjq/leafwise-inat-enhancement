const { test, expect } = require('@playwright/test');
const path = require('node:path');

// Reduced layout of the official uploader at d65e6756e8c249d9e56798138cd55a90649a2409:
// fixed toolbar; fixed .leftColumn with no explicit top; sibling #imageGrid.
// The calendar is a geometry/interaction fixture, not the official React picker.
const fixture = `<!doctype html><meta charset="utf-8"><title>Uploader layout regression</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eee;font:14px Arial;color:#333}
.site-header{position:fixed;top:0;height:52px;left:0;right:0;background:white;z-index:1001;padding:15px;font-size:20px}
.nav_add_obs{position:fixed;top:52px;height:50px;left:0;right:0;z-index:1000;background:white;padding:12px 20px}
.uploader{margin-top:100px}.uploader>.container-fluid{margin-top:20px;padding:0 20px}
.row-fluid .col-fixed-250{width:250px;overflow:visible;position:fixed;z-index:10}
.row-fluid .col-offset-290{margin-left:275px;position:inherit}
.left-col-padding{padding-left:5px;padding-right:10px}.head{font-size:18px}
input,button{font:inherit}input{height:32px;padding:5px;width:100%}.field{margin:10px 0;position:relative}
.calendar{position:absolute;top:100%;left:0;z-index:100;width:260px;background:white;border:1px solid #ccc;padding:8px}
.days{display:grid;grid-template-columns:repeat(7,1fr)}.days button{height:34px;border:0;background:white;cursor:pointer}
.time-fields{display:flex;gap:8px}.time-fields input{width:60px}.calendar[hidden]{display:none}
#imageGridObs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px;padding:3px}
.card{height:260px;background:white;border:3px solid #74ac00;border-radius:5px;padding:15px}
.photo{height:150px;background:#dce8d4;display:grid;place-items:center}
</style><body>
<header class="site-header">iNaturalist · layout test</header><div class="uploader">
<nav class="nav_add_obs"><label><input style="width:auto;height:auto" id="select-all" type="checkbox" checked>全選 410 份觀察</label></nav>
<div class="container-fluid"><div class="row-fluid">
<aside class="col-fixed-250 leftColumn"><div class="left-col-padding"><p class="head">正在編輯 410 份觀察</p><p>詳情</p>
<div class="field"><input aria-label="物種名稱" value="手動保留"></div>
<div class="field"><input id="batch-date" aria-label="批次日期" value="2026/08/15 18:30">
<div class="calendar" hidden><p>八月 2026</p><div class="days">${Array.from({length:31},(_,i)=>`<button type="button" data-day="${i+1}">${i+1}</button>`).join('')}</div>
<div class="time-fields"><label>時<input aria-label="小時" value="18"></label><label>分<input aria-label="分鐘" value="30"></label><button id="save-time" type="button">確定</button></div></div></div>
<div class="field"><input aria-label="批次地點" placeholder="位置"></div></div></aside>
<div id="imageGrid" class="col-offset-290 col-md-12"><div id="imageGridObs">${Array.from({length:410},(_,i)=>`<div class="ObsCardComponent"><div class="card" data-id="${i}"><div class="photo">測試觀察 ${i+1}</div><p>物種名稱</p></div></div>`).join('')}</div></div>
</div></div></div>
<script>
const date = document.querySelector('#batch-date');
date.addEventListener('click',()=>document.querySelector('.calendar').hidden=false);
document.querySelectorAll('[data-day]').forEach(button=>button.addEventListener('click',()=>date.value='2026/08/'+button.dataset.day.padStart(2,'0')+' 18:30'));
document.querySelector('#save-time').addEventListener('click',()=>{date.value=date.value.slice(0,10)+' '+document.querySelector('[aria-label=小時]').value+':'+document.querySelector('[aria-label=分鐘]').value;document.querySelector('.calendar').hidden=true});
// Like the uploader's unselectAll: shadow controls retarget to their host.
document.body.addEventListener('click',event=>{if(!event.target.closest('a,.card,button,.leftColumn,.calendar,.nav_add_obs,input,.form-group,select'))document.querySelector('#select-all').checked=false});
// Reproduce the uploader's jQuery UI selectable mousedown cancellation.
// A shadow input retargets to the host, which is absent from the cancel list.
document.querySelector('.uploader').addEventListener('mousedown',event=>{if(event.button===0&&!event.target.closest('.card,.glyphicon,input,button,.input-group-addon,.intro,select,.leftColumn,.bootstrap-datetimepicker-widget,a,li,.rw-datetimepicker,textarea'))event.preventDefault()});
window.LeafwiseUploadAdapter={cards:()=>Array.from(document.querySelectorAll('.card')),key:card=>card.dataset.id,find:id=>document.querySelector('[data-id="'+id+'"]'),close:()=>{},editable:()=>true,filled:()=>true,hasPhoto:()=>false,menu:()=>null,visible:()=>false};
</script>`;

async function load(page) {
  await page.route('https://www.inaturalist.org/observations/upload',route=>route.fulfill({body:fixture,contentType:'text/html'}));
  await page.goto('https://www.inaturalist.org/observations/upload');
}
async function inject(page, testInfo) {
  const target = testInfo.project.name.split('-')[0];
  const directory = path.resolve(__dirname, '../../build', target, 'scripts');
  await page.addScriptTag({path:path.join(directory, 'uploader-ai-core.js')});
  await page.addScriptTag({path:path.join(directory, 'uploader-ai-panel.js')});
}

for (const viewport of [{width:1536,height:864},{width:1280,height:720},{width:1024,height:576}]) {
  test(`410 observations: sidebar and full date/time picker remain usable at ${viewport.width}x${viewport.height}`, async ({page},testInfo)=>{
    await page.setViewportSize(viewport);
    await load(page);
    const before = await page.locator('.leftColumn').boundingBox();
    await inject(page,testInfo);
    await expect(page.locator('#leafwise-upload-ai')).toBeVisible();
    const after = await page.locator('.leftColumn').boundingBox();
    expect(after.y, 'AI panel must not push the fixed sidebar down').toBe(before.y);
    const panel = await page.locator('#leafwise-upload-ai').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(after.x+after.width);
    await page.getByLabel('批次日期',{exact:true}).click();
    const calendar = await page.locator('.calendar').boundingBox();
    expect(calendar.y+calendar.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width === 1280) await page.screenshot({path:testInfo.outputPath('date-time-visible.png')});
    await page.locator('[data-day="31"]').click();
    await page.getByLabel('小時',{exact:true}).fill('09');
    await page.getByLabel('分鐘',{exact:true}).fill('45');
    await page.getByRole('button',{name:'確定',exact:true}).click();
    await expect(page.getByLabel('批次日期',{exact:true})).toHaveValue('2026/08/31 09:45');
    await page.getByLabel('批次地點',{exact:true}).fill('測試地點');
    await expect(page.locator('#select-all')).toBeChecked();
  });
}

test('expanding a long report and using AI controls preserves the sidebar and selected observations',async({page},testInfo)=>{
  await page.setViewportSize({width:1280,height:720});
  await load(page);const before=await page.locator('.leftColumn').boundingBox();
  await inject(page,testInfo);
  await page.getByRole('button',{name:'僅檢查建議',exact:true}).click();
  await page.locator('#leafwise-upload-ai').getByText('處理明細',{exact:false}).click();
  await expect(page.locator('#leafwise-upload-ai').locator('tbody tr')).toHaveCount(410);
  expect((await page.locator('.leftColumn').boundingBox()).y).toBe(before.y);
  await expect(page.locator('#select-all')).toBeChecked();
  await page.evaluate(()=>window.scrollTo(0,800));
  await expect(page.getByLabel('批次日期',{exact:true})).toBeInViewport();
  await page.getByLabel('批次日期',{exact:true}).click();
  await expect(page.locator('#save-time')).toBeInViewport();
});

test('wait for the real image column, then remount when the site replaces it',async({page},testInfo)=>{
  await load(page);
  await page.evaluate(()=>{window.oldGrid=document.querySelector('#imageGrid');window.oldGrid.remove()});
  const before=await page.locator('.leftColumn').boundingBox();
  await inject(page,testInfo);
  await expect(page.locator('#leafwise-upload-ai')).toHaveCount(0);
  await page.evaluate(()=>document.querySelector('.row-fluid').append(window.oldGrid));
  await expect(page.locator('#imageGrid > #leafwise-upload-ai')).toHaveCount(1);
  await page.evaluate(()=>{const grid=document.querySelector('#imageGrid');const next=document.createElement('div');next.id='imageGrid';next.className=grid.className;next.append(document.createElement('div'));grid.replaceWith(next)});
  await expect(page.locator('#imageGrid > #leafwise-upload-ai')).toHaveCount(1);
  expect((await page.locator('.leftColumn').boundingBox()).y).toBe(before.y);
});

for (const automatic of [false,true]) {
  test(`stop ${automatic?'automatic':'manual'} processing, edit both settings with mouse and keyboard, then rerun`,async({page},testInfo)=>{
    await load(page);
    await page.evaluate(()=>{
      const card=document.querySelector('.card');
      window.suggestionReady=false;window.opened=0;window.selectedTaxon=null;
      Object.assign(window.LeafwiseUploadAdapter,{
        cards:()=>[card],find:()=>card,filled:()=>window.selectedTaxon!==null,hasPhoto:()=>true,
        signature:()=>String(window.selectedTaxon),open:()=>{window.opened++},
        read:()=>window.suggestionReady?{confident:false,items:[{id:123,name:'Controlled suggestion',vision:true,ancestor:false,score:85}]}:null,
        click:(_card,id)=>{window.selectedTaxon=id},taxonID:()=>String(window.selectedTaxon)
      });
    });
    await inject(page,testInfo);
    const panel=page.locator('#leafwise-upload-ai');
    const threshold=panel.locator('#threshold'),mode=panel.locator('#mode'),apply=panel.locator('#apply');
    if(automatic)await panel.locator('#auto').click();else await apply.click();
    await expect.poll(()=>page.evaluate(()=>window.opened)).toBe(1);
    await expect(threshold).toBeDisabled();await expect(mode).toBeDisabled();
    await panel.locator('#stop').click();
    await expect(threshold).toBeEnabled();await expect(mode).toBeEnabled();
    await expect(panel.locator('#auto')).not.toBeChecked();
    // fill/selectOption could bypass the broken mouse focus. Use real input.
    await threshold.click();await expect(threshold).toBeFocused();
    await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('90');await page.keyboard.press('Tab');
    await mode.click();await expect(mode).toBeFocused();
    await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    await expect(mode).toHaveValue('official');
    await mode.click();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
    await expect(mode).toHaveValue('score');await expect(threshold).toHaveValue('90');
    await page.evaluate(()=>{window.suggestionReady=true});
    expect(await page.evaluate(()=>window.selectedTaxon)).toBeNull();
    await apply.click();await expect(apply).toBeEnabled();
    await expect(panel.locator('tbody')).toContainText('未超過 90');
    expect(await page.evaluate(()=>window.selectedTaxon)).toBeNull();
    await threshold.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('80');await page.keyboard.press('Tab');
    await apply.click();await expect(apply).toBeEnabled();
    expect(await page.evaluate(()=>window.selectedTaxon)).toBe(123);
    await expect(page.locator('#select-all')).toBeChecked();
  });
}
