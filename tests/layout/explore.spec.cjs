const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs/promises');
test.setTimeout(45000);
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;font:14px Arial;color:#333}nav{padding:16px;border-bottom:1px solid #ddd}#filters{padding:12px 20px}h1{font-size:26px}main{padding-bottom:40px}</style><nav class="navtab user"><a class="observations_link" href="/observations/observer">我的觀察</a> <a class="profile_link" href="/people/7">個人頁</a></nav><div id="filters"><h1>觀察</h1></div><main id="observations-search"><div id="taxon_page"><h1>測試類群</h1></div></main>`;
async function prepare(page) {
 await page.route('https://www.inaturalist.org/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.addInitScript(()=>{
  const area=(name,defaults={})=>({
   get:async keys=>{const data=JSON.parse(localStorage.getItem(name)||JSON.stringify(defaults));return keys==null?data:Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]]));},
   set:async value=>localStorage.setItem(name,JSON.stringify({...JSON.parse(localStorage.getItem(name)||'{}'),...value})),
   remove:async keys=>{const data=JSON.parse(localStorage.getItem(name)||'{}');for(const key of keys)delete data[key];localStorage.setItem(name,JSON.stringify(data));}
  });
  let listener;const api={runtime:{id:'test-extension',onMessage:{addListener:f=>listener=f},sendMessage:message=>new Promise(resolve=>listener(message,{id:'test-extension'},resolve)),openOptionsPage:async()=>{}},action:{onClicked:{addListener:()=>{}}},storage:{local:area('local'),session:area('session'),sync:area('sync',{savedUsernames:['observer'],savedTaxa:[{id:3,name:'鳥綱'},{id:48460,name:'全部生物'}]}),onChanged:{addListener:()=>{}}}};
  window.chrome=api;window.browser=api;window.importScripts=()=>{};window.testRequests=[];
  const tree=ids=>({size:ids.length+1,results:[{id:3,parent_id:null,name:'Aves',rank:'class',rank_level:50,direct_obs_count:0,descendant_obs_count:ids.length},...ids.map(id=>({id,parent_id:3,name:'Order '+id,rank:'order',rank_level:40,direct_obs_count:1,descendant_obs_count:1}))]});
  window.fetch=async url=>{
   const u=new URL(url);window.testRequests.push(u.href);let data;
   if(u.pathname==='/v1/users/observer')data={results:[{id:7,login:'observer'}]};
   else if(u.pathname.startsWith('/v1/places/'))data={results:u.pathname.split('/').at(-1).split(',').map(Number).map(id=>({id,name:'API place '+id}))};
   else if(u.pathname.startsWith('/v1/taxa/'))data={results:u.pathname.split('/').at(-1).split(',').map(Number).map(id=>({id,name:'Taxon '+id,rank_level:50,ancestor_ids:[],preferred_common_name:id===1002?'測試目':'類群 '+id}))};
   else if(u.pathname==='/v1/observations/taxonomy'){
    let ids=Array.from({length:66},(_,i)=>1001+i);
    if(u.searchParams.has('user_id'))ids=u.searchParams.has('d1')?[1001]:u.searchParams.has('d2')?[1002]:u.searchParams.has('place_id')?[1001]:[1001,1002];
    data=tree(ids);
   }else if(u.pathname==='/v1/observations/species_counts')data={total_results:2};
   else if(u.pathname==='/v1/observations'){
    if(window.failRecords&&u.searchParams.has('order'))return {ok:false,status:503};
    data={total_results:7,results:[{id:u.searchParams.get('order')==='asc'?11:22,observed_on:u.searchParams.get('order')==='asc'?'2020-01-01':'2026-09-01',place_guess:'公開測試地點'}]};
   }else throw new Error('Unexpected request: '+url);
   return {ok:true,json:async()=>data};
  };
 });
}
async function inject(page,testInfo,personal=false) {
 const directory=path.resolve(__dirname,'../../build',testInfo.project.name.startsWith('firefox')?'firefox':'chrome','scripts');
 for(const file of ['higher-taxa-core.js','explore-tools.js','higher-taxa-service.js'])await page.addScriptTag({path:path.join(directory,file)});
 // Keep production service/message/storage behavior; skip throttling only in
 // this offline fake API. The real transport is tested separately.
 await page.evaluate(()=>{window.QGInatHigherTaxaService.createTransport=()=>async url=>{const r=await fetch(url);if(!r.ok)throw new Error('API '+r.status);return r.json()}});
 await page.addScriptTag({path:path.join(directory,'background.js')});
 for(const file of personal?['taxon-status.js']:['url-filters.js','saved-users.js','saved-taxa.js','higher-taxa-panel.js'])await page.addScriptTag({path:path.join(directory,file)});
}
async function open(page,testInfo,url='https://www.inaturalist.org/observations?user_id=observer&taxon_id=3&place_id=10301') {
 await prepare(page);await page.goto(url);await inject(page,testInfo);
 await page.locator('#qg-inat-higher-taxa-trigger').getByRole('button',{name:'類群對比',exact:true}).click();
 const panel=page.locator('#qg-inat-higher-taxa');await expect(panel.locator('#user-choice')).toBeEnabled();return panel;
}

test('named regions show members and a custom place group survives reload',async({page},testInfo)=>{
 const panel=await open(page,testInfo);
 await panel.locator('#place-choice').selectOption('builtin:south');
 await expect(panel.locator('#place-members')).toContainText('香港（7613）');await expect(panel.locator('#place-members')).toContainText('澳門（10301）');
 await panel.locator('#place-choice').selectOption('builtin:east');await expect(panel.locator('#place-members')).not.toContainText('臺灣');
 await panel.locator('#place-choice').selectOption('builtin:all');await expect(panel.locator('#place-choice')).toHaveValue('builtin:all');
 await panel.getByText('查詢收藏與自訂地點組合',{exact:true}).click();
 await panel.locator('#place').fill('7613,10301');await panel.locator('#place-name').fill('我的兩地');await panel.locator('#save-place').click();
 await expect(panel.locator('#status')).toContainText('已保存自訂');
 await page.reload();await inject(page,testInfo);
 const next=page.locator('#qg-inat-higher-taxa');await expect(next.locator('#place-choice option').filter({hasText:'我的兩地'})).toHaveCount(1);
});

test('saved query restores the full URL and comparison settings after navigation',async({page},testInfo)=>{
 const original='https://www.inaturalist.org/observations?user_id=observer&taxon_id=3&place_id=10301&month=9&swlat=1&nelat=2';
 const panel=await open(page,testInfo,original);
 await panel.locator('#comparison').selectOption('first');await panel.locator('#year').fill('2025');
 await panel.getByText('查詢收藏與自訂地點組合',{exact:true}).click();await panel.locator('#query-name').fill('秋季首見');await panel.locator('#save-query').click();
 await expect(panel.locator('#status')).toContainText('已保存完整');
 await page.goto('https://www.inaturalist.org/observations?taxon_id=3&month=8');await inject(page,testInfo);
 await page.locator('#qg-inat-higher-taxa-trigger').getByRole('button').click();
 await panel.getByText('查詢收藏與自訂地點組合',{exact:true}).click();await panel.locator('#query-choice').selectOption({label:'秋季首見'});
 await panel.locator('#load-query').click();await page.waitForURL('**/*leafwise_query=*');await inject(page,testInfo);
 await expect(panel.locator('#panel')).toBeVisible();await expect(panel.locator('#comparison')).toHaveValue('first');await expect(panel.locator('#year')).toHaveValue('2025');await expect(panel.locator('#months')).toHaveValue('9');
 expect(new URL(page.url()).searchParams.get('swlat')).toBe('1');expect(new URL(page.url()).searchParams.get('nelat')).toBe('2');
 await panel.getByText('查詢收藏與自訂地點組合',{exact:true}).click();await panel.locator('#remove-query').click();await expect(panel.locator('#query-choice option')).toHaveCount(1);
});

test('season shortcut, yearly/local/first scopes and links use the intended independent filters',async({page},testInfo)=>{
 const panel=await open(page,testInfo);
 await panel.locator('#this-month').click();await expect(panel.locator('#months')).toHaveValue(String(new Date().getMonth()+1));
 await panel.locator('#comparison').selectOption('year');await panel.locator('#year').fill('2026');await panel.getByRole('button',{name:'开始对比',exact:true}).click();
 await expect(panel.locator('tbody tr[data-taxon-id]')).toHaveCount(1);await expect(panel.locator('tbody tr')).toHaveAttribute('data-taxon-id','1002');
 const regionURL=await panel.locator('#sources a').first().getAttribute('href');expect(new URL(regionURL).searchParams.has('month')).toBe(true);
 const personalURL=await panel.locator('#sources a').nth(1).getAttribute('href');expect(new URL(personalURL).searchParams.has('month')).toBe(false);expect(new URL(personalURL).searchParams.get('d1')).toBe('2026-01-01');
 await panel.locator('#comparison').selectOption('local');await panel.getByRole('button',{name:'开始对比',exact:true}).click();await expect(panel.locator('tbody tr[data-taxon-id="1002"]')).toHaveCount(1);
 await panel.locator('#comparison').selectOption('first');await panel.getByRole('button',{name:'开始对比',exact:true}).click();await expect(panel.locator('tbody tr[data-taxon-id="1001"]')).toHaveCount(1);await expect(panel.locator('#sources')).toContainText('該年以前');
 await page.screenshot({path:testInfo.outputPath('explore-comparison.png'),fullPage:true});
});

test('CSV includes every filtered result across pages and clipboard failure offers selectable text',async({page},testInfo)=>{
 const panel=await open(page,testInfo);await panel.getByRole('button',{name:'开始对比',exact:true}).click();
 await expect(panel.locator('#status')).toContainText('已加载');await expect(panel.locator('tbody tr[data-taxon-id]')).toHaveCount(50);
 const before=await page.evaluate(()=>window.testRequests.length);
 const downloadEvent=page.waitForEvent('download');await panel.locator('#export-results').click();const download=await downloadEvent;
 const csv=await fs.readFile(await download.path(),'utf8');expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv.trim().split('\r\n')).toHaveLength(65);expect(csv).toContain('Order 1066');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}},configurable:true}));
 await panel.locator('#search').fill('1066');await panel.locator('#copy-results').click();await expect(panel.locator('#copy-fallback')).toBeVisible();expect(await panel.locator('#copy-fallback').inputValue()).toContain('Order 1066');
 expect(await page.evaluate(()=>window.testRequests.length)).toBe(before);
});

test('personal records load only when requested, show first/latest, cache, and clear on SPA navigation',async({page},testInfo)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3');await inject(page,testInfo,true);
 const marker=page.locator('#taxon_page #qg-inat-own-taxon-status');await expect(marker).toHaveText('(7)');
 expect(await page.evaluate(()=>window.testRequests.filter(url=>new URL(url).searchParams.has('order')).length)).toBe(0);
 await marker.click();const card=page.locator('#leafwise-personal-records');await expect(card.locator('#records')).toContainText('2020-01-01');await expect(card.locator('#records')).toContainText('2026-09-01');await expect(card.locator('#all a')).toHaveAttribute('href',/user_id=observer/);
 await page.screenshot({path:testInfo.outputPath('personal-records.png')});
 await card.getByRole('button',{name:'關閉我的紀錄'}).click();await marker.click();await expect(card.locator('#records')).toContainText('2020-01-01');
 expect(await page.evaluate(()=>window.testRequests.filter(url=>new URL(url).searchParams.has('order')).length)).toBe(2);
 await page.evaluate(()=>history.pushState({},'', '/taxa/4'));await expect(card).toHaveCount(0);
});

test('failed personal record requests show retry instead of inventing an empty history',async({page},testInfo)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3');await inject(page,testInfo,true);await expect(page.locator('#qg-inat-own-taxon-status')).toBeVisible();
 await page.evaluate(()=>{window.failRecords=true});await page.locator('#qg-inat-own-taxon-status').click();const card=page.locator('#leafwise-personal-records');
 await expect(card.locator('#status')).toContainText('503');await expect(card.locator('#retry')).toBeVisible();await page.evaluate(()=>{window.failRecords=false});await card.locator('#retry').click();await expect(card.locator('#records')).toContainText('2020-01-01');
});
