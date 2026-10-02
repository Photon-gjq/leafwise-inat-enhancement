const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs/promises');
test.setTimeout(45000);
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;font:14px Arial;color:#333}nav{padding:16px;border-bottom:1px solid #ddd}#filters{padding:12px 20px}h1{font-size:26px}main{padding-bottom:40px}</style><nav class="navtab user"><a class="observations_link" href="/observations/observer">我的觀察</a> <a class="profile_link" href="/people/7">個人頁</a></nav><div id="filters"><h1>觀察</h1></div><main id="observations-search"><div id="taxon_page"><h1>測試類群</h1></div></main>`;
async function prepare(page, language='') {
 await page.route('https://www.inaturalist.org/**',route=>route.fulfill({contentType:'text/html',body:html.replace('<!doctype html>', `<!doctype html><html lang="${language}">`)}));
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
   }else if(u.pathname==='/v1/observations/species_counts'){
    if(window.failDiversity)return {ok:false,status:503};
    data={total_results:window.regionCounts?.[u.searchParams.get('place_id')]?.[1] ?? 4};
   }else if(u.pathname==='/v1/observations/observers')data={results:[{user_id:7,observation_count:7,species_count:window.regionCounts?.[u.searchParams.get('place_id')]?.[2] ?? 2}]};
   else if(u.pathname==='/v1/observations'){
    if(window.failRecords&&u.searchParams.has('order'))return {ok:false,status:503};
    data={total_results:7,results:[{id:u.searchParams.get('order')==='asc'?11:22,observed_on:u.searchParams.get('order')==='asc'?'2020-01-01':'2026-09-01',place_guess:'公開測試地點'}]};
    if(window.regionCounts?.[u.searchParams.get('place_id')])data.total_results=window.regionCounts[u.searchParams.get('place_id')][0];
    if(data.total_results===0)data.results=[];
    if(window.delayGlobalCount&&!u.searchParams.has('place_id')&&!u.searchParams.has('order'))await new Promise(resolve=>window.releaseDelayed=resolve);
   }else throw new Error('Unexpected request: '+url);
   return {ok:true,json:async()=>data};
  };
 });
}
async function inject(page,testInfo,personal=false,localize=false) {
 const directory=path.resolve(__dirname,'../../build',testInfo.project.name.split('-')[0],'scripts');
 if(localize)for(const file of ['i18n-catalog.js','i18n.js'])await page.addScriptTag({path:path.join(directory,file)});
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

test('localized comparison preserves API data, requests names in site language and exports translated headers',async({page},testInfo)=>{
 await prepare(page,'fr');await page.goto('https://www.inaturalist.org/observations?user_id=observer&taxon_id=3&place_id=10301');await inject(page,testInfo,false,true);
 await page.locator('#qg-inat-higher-taxa-trigger button').click();
 const panel=page.locator('#qg-inat-higher-taxa');await expect(panel.locator('#user-choice')).toBeEnabled();
 await expect(panel.locator('#rank option[value="species"]')).toHaveText('Espèce · species');
 await panel.locator('button[type="submit"]').click();
 await expect(panel.locator('#status')).toContainText('Chargé');
 await expect(panel.locator('tbody tr[data-taxon-id]')).toHaveCount(50);
 const nameRequests=await page.evaluate(()=>testRequests.filter(url=>/\/taxa\/100/.test(url)));
 expect(nameRequests.length).toBeGreaterThan(0);for(const url of nameRequests)expect(new URL(url).searchParams.get('locale')).toBe('fr');
 await expect(panel.locator('tbody')).toContainText('類群 1003');
 const before=await page.evaluate(()=>testRequests.length);await panel.locator('#refresh-names').click();
 await expect(panel.locator('#status')).toContainText('Actualisé');
 const refreshed=await page.evaluate(previous=>testRequests.slice(previous),before);for(const url of refreshed)expect(new URL(url).searchParams.get('locale')).toBe('fr');
 const event=page.waitForEvent('download');await panel.locator('#export-results').click();const download=await event;
 const csv=await fs.readFile(await download.path(),'utf8');expect(csv).toContain('Nom commun');expect(csv).toContain('類群 1003');
 expect(await page.locator('nav').textContent()).toContain('我的觀察');
});

test('named regions show members and a custom place group survives reload',async({page},testInfo)=>{
 const panel=await open(page,testInfo);
 await expect(panel.locator('#rank option[value="species"]')).toHaveText('种 · species');
 await panel.locator('#place-choice').selectOption('builtin:mainland-hk-mo');
 await expect(panel.locator('#place-members')).toContainText('中國大陸（6903）');
 await expect(panel.locator('#place-members')).toContainText('香港（7613）');
 await expect(panel.locator('#place-members')).toContainText('澳門（10301）');
 await expect(panel.locator('#place-members')).not.toContainText('臺灣');
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

test('unedited comparison follows removed URL filters while deliberate drafts remain intact',async({page},info)=>{
 const panel=await open(page,info);
 await expect(panel.locator('#place')).toHaveValue('10301');
 await page.evaluate(()=>history.replaceState({},'', '/observations?taxon_id=3'));
 await expect(panel.locator('#place')).toHaveValue('');
 await expect(panel.locator('#months')).toHaveValue('');
 await expect(panel.locator('#user')).toHaveValue('observer');
 await panel.locator('#place').fill('6903,7613');
 await page.evaluate(()=>history.replaceState({},'', '/observations?taxon_id=48460&place_id=10301&month=8'));
 await expect(panel.locator('#status')).toContainText('保留当前填写内容');
 await expect(panel.locator('#place')).toHaveValue('6903,7613');
 await panel.locator('#read-page').click();
 await expect(panel.locator('#place')).toHaveValue('10301');
 await expect(panel.locator('#months')).toHaveValue('8');
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
 const marker=page.locator('#taxon_page #qg-inat-own-taxon-status');await expect(marker).toHaveText('(7|4|2)');
 expect(await page.evaluate(()=>window.testRequests.filter(url=>new URL(url).searchParams.has('order')).length)).toBe(0);
 await marker.click();const card=page.locator('#leafwise-personal-records');await expect(card.locator('#records')).toContainText('2020-01-01');await expect(card.locator('#records')).toContainText('2026-09-01');await expect(card.locator('#all a')).toHaveAttribute('href',/user_id=observer/);
 await page.screenshot({path:testInfo.outputPath('personal-records.png')});
 await card.getByRole('button',{name:'關閉我的紀錄'}).click();await marker.click();await expect(card.locator('#records')).toContainText('2020-01-01');
 expect(await page.evaluate(()=>window.testRequests.filter(url=>new URL(url).searchParams.has('order')).length)).toBe(2);
 await page.evaluate(()=>history.pushState({},'', '/taxa/4'));await expect(card).toHaveCount(0);
});

test('taxon page shows observations, leaf taxa and species rank counts in that order',async({page},testInfo)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3');
 await page.locator('main').evaluate(main=>{main.insertAdjacentHTML('beforeend','<section id="taxonomy"><ul><li class="current"><div class="row-content"><div class="SplitTaxon"><a href="/taxa/3">Current taxon</a><a class="secondary-name" href="/taxa/3">Animals</a></div></div></li><li><a href="/taxa/41">Test order</a></li></ul></section>')});
 await inject(page,testInfo,true);
 await expect(page.locator('#qg-inat-own-taxon-status')).toHaveText('(7|4|2)');
 await expect(page.locator('#taxonomy li.current .qg-inat-taxonomy-status')).toHaveText('(7|4|2)');
 await expect(page.locator('#taxonomy li:not(.current) .qg-inat-taxonomy-status')).toHaveText('(7|4|2)');
 await expect(page.locator('#qg-inat-own-taxon-status')).toHaveAttribute('title',/最低分類單元.*種級分類單元/);
});

test('taxon page keeps the observation count when diversity statistics fail',async({page},testInfo)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3');
 await page.evaluate(()=>{window.failDiversity=true});await inject(page,testInfo,true);
 const marker=page.locator('#qg-inat-own-taxon-status');await expect(marker).toHaveText('(7)');
 await expect.poll(()=>page.evaluate(()=>window.testRequests.filter(url=>new URL(url).pathname==='/v1/observations/species_counts').length)).toBe(1);
 await expect(marker).toHaveText('(7)');
});

test('failed personal record requests show retry instead of inventing an empty history',async({page},testInfo)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3');await inject(page,testInfo,true);await expect(page.locator('#qg-inat-own-taxon-status')).toBeVisible();
 await page.evaluate(()=>{window.failRecords=true});await page.locator('#qg-inat-own-taxon-status').click();const card=page.locator('#leafwise-personal-records');
 await expect(card.locator('#status')).toContainText('503');await expect(card.locator('#retry')).toBeVisible();await page.evaluate(()=>{window.failRecords=false});await card.locator('#retry').click();await expect(card.locator('#records')).toContainText('2020-01-01');
});

async function regionFixture(page, chosen=true, nativeHref='/observations?taxon_id=3&place_id=6903') {
 await page.evaluate(({chosen,nativeHref})=>{
  window.regionCounts={6903:[3,2,1],7613:[1,1,1],10301:[0,0,0]};
  document.querySelector('#taxon_page').insertAdjacentHTML('beforeend',`<div id="place-chooser-container"><div class="PlaceChooserPopoverTrigger ${chosen?'chosen':''}">Region</div></div><div class="NumObservations"><a id="native-region" href="${nativeHref}">All</a></div><a id="native-global" href="/observations?user_id=observer&taxon_id=3&verifiable=any">Global yours</a><section id="taxonomy"><ul><li class="current"><div class="row-content"><div class="SplitTaxon"><a class="secondary-name" href="/taxa/3">Current</a></div></div></li><li><a href="/taxa/41">Ancestor</a></li></ul></section>`);
 },{chosen,nativeHref});
}

test('taxon statistics, links and records follow live selected regions and clearing restores global data',async({page},info)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3?place_id=10301');await regionFixture(page);await inject(page,info,true);
 const marker=page.locator('#qg-inat-own-taxon-status');const taxonomy=page.locator('#taxonomy .qg-inat-taxonomy-status');
 await expect(marker).toHaveText('(3|2|1)');await expect(taxonomy).toHaveText(['(3|2|1)','(3|2|1)']);
 await expect(marker).toHaveAttribute('href',/place_id=6903/);
 await expect(page.locator('#native-global .qg-inat-yours-count')).toHaveText(': 7');
 await marker.click();await expect(page.locator('#leafwise-personal-records #status')).toContainText('3');
 await expect(page.locator('#leafwise-personal-records #all a')).toHaveAttribute('href',/place_id=6903/);
 expect(await page.evaluate(()=>testRequests.filter(s=>new URL(s).searchParams.has('order')).every(s=>new URL(s).searchParams.get('place_id')==='6903'))).toBe(true);
 await page.locator('#native-region').evaluate(a=>a.href='/observations?taxon_id=3&place_id=7613');
 await expect(marker).toHaveText('(1|1|1)');await expect(taxonomy).toHaveText(['(1|1|1)','(1|1|1)']);await expect(page.locator('#leafwise-personal-records')).toHaveCount(0);
 await page.locator('#native-region').evaluate(a=>a.href='/observations?taxon_id=3&place_id=10301');
 await expect(marker).toHaveText('🆕');await expect(marker).toHaveAttribute('title',/目前地区/);await expect(taxonomy).toHaveText(['🆕','🆕']);
 await page.evaluate(()=>{document.querySelector('.PlaceChooserPopoverTrigger').classList.remove('chosen');document.querySelector('#native-region').href='/observations?taxon_id=3';});
 await expect(marker).toHaveText('(7|4|2)');await expect(taxonomy).toHaveText(['(7|4|2)','(7|4|2)']);await expect(marker).not.toHaveAttribute('href',/place_id/);
 await page.screenshot({path:info.outputPath('regional-taxon-statistics.png')});
});

test('selected region with unready links never falls back to global statistics',async({page},info)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3');await regionFixture(page,true,'/observations?taxon_id=3');await inject(page,info,true);
 await expect(page.locator('#qg-inat-own-taxon-status')).toHaveCount(0);
 expect(await page.evaluate(()=>testRequests.length)).toBe(0);
 await page.locator('#native-region').evaluate(a=>a.href='/observations?taxon_id=3&place_id=6903');
 await expect(page.locator('#qg-inat-own-taxon-status')).toHaveText('(3|2|1)');
});

test('late global response cannot overwrite a newly selected regional count',async({page},info)=>{
 await prepare(page);await page.goto('https://www.inaturalist.org/taxa/3');await regionFixture(page,false,'/observations?taxon_id=3');
 await page.evaluate(()=>{window.delayGlobalCount=true;document.querySelector('#native-global').remove();});await inject(page,info,true);
 await expect.poll(()=>page.evaluate(()=>typeof window.releaseDelayed)).toBe('function');
 await page.evaluate(()=>{document.querySelector('.PlaceChooserPopoverTrigger').classList.add('chosen');document.querySelector('#native-region').href='/observations?taxon_id=3&place_id=6903';});
 await expect(page.locator('#qg-inat-own-taxon-status')).toHaveText('(3|2|1)');
 await page.evaluate(()=>{window.delayGlobalCount=false;window.releaseDelayed();});
 await expect(page.locator('#qg-inat-own-taxon-status')).toHaveText('(3|2|1)');
});

test('settings and comparison share region groups, preserve searches and reject concurrent stale edits',async({page},info)=>{
 const directory=path.resolve(__dirname,'../../build',info.project.name.split('-')[0]);
 const settings=(await fs.readFile(path.join(directory,'options/options.html'),'utf8')).replace(/<script[^>]*><\/script>/g,'').replace('lang="zh-CN"','lang="en"');
 await prepare(page,'en');await page.route('https://www.inaturalist.org/options-fixture',r=>r.fulfill({contentType:'text/html',body:settings}));await page.goto('https://www.inaturalist.org/options-fixture');
 await page.setViewportSize({width:1100,height:900});await page.addStyleTag({path:path.join(directory,'options/options.css')});
 await page.evaluate(()=>chrome.storage.local.set({leafwiseLastSiteLocale:'en',leafwiseExploreLibraryV1:{queries:[{id:'q1',name:'Saved query'}],groups:[{id:'p1',name:'My region',place:'7613,10301'}]}}));
 await inject(page,info,true,true);
 for(const file of ['saved-users.js','saved-taxa.js'])await page.addScriptTag({path:path.join(directory,'scripts',file)});
 await page.addScriptTag({path:path.join(directory,'options/options.js')});
 await expect(page.locator('#places')).toHaveValue('7613,10301 = My region');
 await page.locator('#places').fill('10301,7613 = Renamed\n6903 = My mainland');await page.locator('#places-form button').click();
 await expect(page.locator('#places-status')).toHaveText('Saved 2 region groups.');
 const saved=await page.evaluate(async()=> (await chrome.storage.local.get('leafwiseExploreLibraryV1')).leafwiseExploreLibraryV1);
 expect(saved.groups[0].id).toBe('p1');expect(saved.queries).toEqual([{id:'q1',name:'Saved query'}]);
 await page.evaluate(async()=>{const key='leafwiseExploreLibraryV1';const data=(await chrome.storage.local.get(key))[key];data.groups[0].name='Other page';await chrome.storage.local.set({[key]:data});});
 await page.locator('#places').fill('6903 = Old form');await page.locator('#places-form button').click();
 await expect(page.locator('#places-status')).toContainText('another page');
 await page.screenshot({path:info.outputPath('saved-regions-settings.png'),fullPage:true});
 await page.goto('https://www.inaturalist.org/observations?user_id=observer&taxon_id=3&place_id=10301');await inject(page,info);
 await page.locator('#qg-inat-higher-taxa-trigger button').click();const panel=page.locator('#qg-inat-higher-taxa');
 await expect(panel.locator('#place-choice option')).toContainText(['Other page','My mainland']);
 await panel.locator('#place-choice').selectOption('p1');await expect(panel.locator('#place')).toHaveValue('7613,10301');
});
