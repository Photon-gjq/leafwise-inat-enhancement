const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const scripts=['i18n-catalog.js','i18n.js','higher-taxa-core.js','explore-tools.js','higher-taxa-service.js','background.js','taxon-status.js','taxon-places.js'];
const initial='https://www.inaturalist.org/taxa/3-Aves?locale=en#taxonomy';
const groups=[{id:'single',place:'7613',name:'我的單一地點'}, {id:'multi',place:'6903,7613',name:'Hidden combination'},
  {id:'another',place:'10301',name:'Macao custom'}, {id:'duplicate',place:'7613',name:'Duplicate'}];
const choice=page=>page.locator('#leafwise-taxon-places #place-choice');

async function fixture(page,info,config={}) {
  const state={place:null,lang:'en',csrf:true,putStatus:204,lookupStatus:200,writes:[],reads:[],lookups:[],...config};
  const directory=path.resolve(__dirname,'../../build',info.project.name.split('-')[0],'scripts');
  await page.addInitScript(({groups,delayLibrary})=>{
    const listeners=new Set();
    const initial={leafwiseExploreLibraryV1:{queries:[],groups}};
    const storage=(name)=>({
      get:async key=>{const data=JSON.parse(localStorage.getItem(name)||JSON.stringify(name==='local'?initial:{}));return key==null?data:{[key]:data[key]};},
      set:async values=>{const before=JSON.parse(localStorage.getItem(name)||JSON.stringify(name==='local'?initial:{}));localStorage.setItem(name,JSON.stringify({...before,...values}));
        listeners.forEach(f=>f(Object.fromEntries(Object.entries(values).map(([k,newValue])=>[k,{newValue,oldValue:before[k]}])),name));},
      remove:async()=>{}
    });
    let listener;
    const api={runtime:{id:'test-extension',onMessage:{addListener:f=>listener=f},
      sendMessage:message=>{
        if(delayLibrary&&message.type==='leafwise-explore-library')return new Promise(resolve=>window.releaseLibrary=resolve);
        return new Promise(resolve=>listener(message,{id:'test-extension',url:location.href,frameId:0,tab:{id:5,windowId:7}},resolve));
      },openOptionsPage:async()=>{window.optionsOpened=(window.optionsOpened||0)+1;}},
      action:{onClicked:{addListener(){}}},storage:{local:storage('local'),session:storage('session'),onChanged:{addListener:f=>listeners.add(f)}}};
    window.chrome=api;window.browser=api;window.importScripts=()=>{};
  },{groups:config.groups??groups,delayLibrary:config.delayLibrary??false});
  await page.route('https://api.inaturalist.org/**',async route=>{
    const u=new URL(route.request().url());state.reads.push(u.href);
    if(u.pathname.startsWith('/v1/places/')){
      state.lookups.push(u.href);
      if(state.delayLookup)await state.delayLookup;
      return route.fulfill({status:state.lookupStatus,json:{results:state.invalidPlace?[]:[{id:Number(u.pathname.split('/').at(-1)),name:'API place',geometry_geojson:{discard:true}}]}});
    }
    const regional=u.searchParams.has('place_id');
    return route.fulfill({json:{total_results:regional?2:9,results:u.pathname.endsWith('/observers')?[{user_id:7,species_count:regional?1:5}]:[]}});
  });
  await page.route('https://www.inaturalist.org/**',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname.startsWith('/__leafwise/')){
      return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(directory,u.pathname.split('/').at(-1)),'utf8')});
    }
    if(u.pathname==='/users/update_session'){
      const request=route.request(),body=request.postData()||'';
      const fields=Object.fromEntries([...body.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)/g)].map(m=>[m[1],m[2]]));
      state.writes.push({method:request.method(),fields,url:u.href});
      if(state.putStatus===204)state.place=fields.preferred_taxon_page_place_id==='null'?null:Number(fields.preferred_taxon_page_place_id);
      return route.fulfill({status:state.putStatus,headers:state.putStatus===302?{location:'/login'}:{}});
    }
    const name=state.place===null?'Filter by place':'Native place '+state.place;
    const nativePlace=state.place===null?'':'&place_id='+state.place;
    const html='<!doctype html><html lang="'+state.lang+'" dir="'+(state.rtl?'rtl':'ltr')+'"><meta charset="utf-8">'+
      (state.csrf?'<meta name="csrf-token" content="test-csrf">':'')+
      '<style>body{margin:0;font:14px Arial;color:#333}#TaxonHeader{padding:20px}.inner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}h1{font-size:28px;margin:0;flex:1 1 300px;overflow-wrap:anywhere}#place-chooser-container{margin-top:20px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;max-width:100%}.PlaceChooserPopoverTrigger{border:0;background:#f6f6f6;padding:6px;border-radius:12px}.chosen{background:#7cae00;color:white}main{padding:20px}</style>'+
      '<nav class="navtab user"><a class="observations_link" href="/observations/observer">Observations</a><a class="profile_link" href="/people/7">Profile</a></nav>'+
      '<div id="TaxonHeader"><div class="inner"><h1><a class="taxon-name" href="/taxa/3-Aves">'+(state.long?'A very long common and scientific taxon name '.repeat(3):'Birds · Aves')+'</a></h1>'+
      '<div id="place-chooser-container"><button class="PlaceChooserPopoverTrigger '+(state.place===null?'':'chosen')+'">'+name+'</button><button id="native-clear" onclick="this.dataset.clicked=\'yes\'">×</button></div></div></div>'+
      '<main><div class="NumObservations'+(state.noContent?' no-content':'')+'">'+
      (state.noContent?'0':'<a href="/observations?taxon_id=3'+nativePlace+'">Native observations</a>')+'</div></main>'+
      scripts.filter(f=>!config.missingCatalog||!['i18n-catalog.js','i18n.js'].includes(f)).map(f=>'<script src="/__leafwise/'+f+'"></script>').join('')+'</html>';
    return route.fulfill({contentType:'text/html',body:html});
  });
  await page.goto(initial);
  return state;
}

test('only saved single regions are offered; no defaults, writes or data changes until selected',async({page},info)=>{
  const state=await fixture(page,info);
  await expect(choice(page)).toBeEnabled();
  await expect(choice(page).locator('option')).toHaveText(['Saved places','Worldwide','我的單一地點','Macao custom','Manage saved regions…']);
  await expect(choice(page)).toHaveValue('any');
  expect(state.writes).toEqual([]);expect(state.lookups).toEqual([]);
  await choice(page).selectOption('settings');
  await expect.poll(()=>page.evaluate(()=>optionsOpened)).toBe(1);
  expect(await page.evaluate(()=>chrome.storage.local.get('leafwiseExploreLibraryV1'))).toEqual({leafwiseExploreLibraryV1:{queries:[],groups}});
  await page.evaluate(()=>chrome.storage.local.set({leafwiseExploreLibraryV1:{queries:[],groups:[]}}));
  await expect(choice(page).locator('option')).toHaveCount(3);
  expect(state.writes).toEqual([]);
});

test('single region and worldwide use native preferences, reload the same URL and scope personal counts',async({page},info)=>{
  const state=await fixture(page,info);
  await expect(choice(page)).toBeEnabled();
  await choice(page).selectOption('7613');
  await expect(choice(page)).toHaveValue('7613');
  await expect(page.locator('.PlaceChooserPopoverTrigger')).toHaveText('Native place 7613');
  expect(page.url()).toBe(initial);
  expect(state.writes).toEqual([{method:'PUT',url:'https://www.inaturalist.org/users/update_session',fields:{authenticity_token:'test-csrf',preferred_taxon_page_place_id:'7613'}}]);
  await expect.poll(()=>state.reads.some(url=>{const u=new URL(url);return u.pathname==='/v1/observations'&&u.searchParams.get('place_id')==='7613';})).toBe(true);
  await choice(page).selectOption('any');
  await expect(choice(page)).toHaveValue('any');
  await expect(page.locator('.PlaceChooserPopoverTrigger')).toHaveText('Filter by place');
  expect(state.writes.at(-1).fields.preferred_taxon_page_place_id).toBe('null');
  expect(page.url()).toBe(initial);
  await choice(page).selectOption('any');
  expect(state.writes).toHaveLength(2);
});

test('a selected region with no observation links can switch places and clear to worldwide',async({page},info)=>{
  let release;
  const delayLookup=new Promise(resolve=>release=resolve);
  const state=await fixture(page,info,{place:7613,noContent:true,delayLookup});
  await expect(page.locator('.PlaceChooserPopoverTrigger')).toHaveText('Native place 7613');
  await expect(page.locator('.NumObservations a')).toHaveCount(0);
  await expect(choice(page)).toBeEnabled({timeout:2000});
  await expect(choice(page)).toHaveValue('');
  expect(state.reads).toEqual([]);
  await choice(page).selectOption('10301');
  await expect.poll(()=>state.lookups.length).toBe(1);
  // Native totals can render after the chooser. Their arrival is not a place change.
  await page.locator('.NumObservations').evaluate(node=>{
    node.classList.remove('no-content');
    node.innerHTML='<a href="/observations?taxon_id=3&place_id=7613">Native observations</a>';
  });
  await expect(choice(page)).toHaveValue('7613');
  await expect(choice(page)).toBeDisabled();
  release();
  await expect(page.locator('.PlaceChooserPopoverTrigger')).toHaveText('Native place 10301');
  expect(state.writes.map(write=>write.fields.preferred_taxon_page_place_id)).toEqual(['10301']);
  await expect(page.locator('.NumObservations a')).toHaveCount(0);
  await choice(page).selectOption('any');
  await expect(page.locator('.PlaceChooserPopoverTrigger')).toHaveText('Filter by place');
  expect(state.writes.map(write=>write.fields.preferred_taxon_page_place_id)).toEqual(['10301','null']);
  expect(page.url()).toBe(initial);
});

for(const failure of ['missing csrf','invalid place','lookup error','save error','login redirect']){
  test('failed switch preserves native scope: '+failure,async({page},info)=>{
    const config=failure==='missing csrf'?{csrf:false}:failure==='invalid place'?{invalidPlace:true}:failure==='lookup error'?{lookupStatus:503}:failure==='save error'?{putStatus:422}:{putStatus:302};
    const state=await fixture(page,info,config);
    await expect(choice(page)).toBeEnabled();await choice(page).selectOption('7613');
    await expect(page.locator('#leafwise-taxon-places #status')).toHaveText('Request failed; try again later.');
    await expect(choice(page)).toBeEnabled();await expect(choice(page)).toHaveValue('any');
    expect(page.url()).toBe(initial);expect(state.place).toBeNull();
    expect(state.writes).toHaveLength(['save error','login redirect'].includes(failure)?1:0);
  });
}

test('late validation cannot override native interaction, changed settings or navigation',async({page},info)=>{
  let release;const delayed=new Promise(resolve=>release=resolve);
  const state=await fixture(page,info,{delayLookup:delayed});
  await expect(choice(page)).toBeEnabled();await choice(page).selectOption('7613');
  await expect.poll(()=>state.lookups.length).toBe(1);
  await page.locator('.PlaceChooserPopoverTrigger').click();
  release();await expect(choice(page)).toBeEnabled();
  await page.evaluate(()=>chrome.storage.local.set({leafwiseExploreLibraryV1:{groups:[{place:'10301',name:'Newest'}],queries:[]}}));
  await expect(choice(page).locator('option[value="10301"]')).toHaveText('Newest');
  expect(state.writes).toEqual([]);
  await page.evaluate(()=>history.replaceState({},'', '/observations'));
  await expect(page.locator('#leafwise-taxon-places')).toHaveCount(0);
});

test('storage race, repeated injection, native remount and BFcache preserve the newest list',async({page},info)=>{
  const state=await fixture(page,info,{delayLibrary:true});
  await expect(choice(page)).toBeDisabled();
  await page.evaluate(async()=>{
    await chrome.storage.local.set({leafwiseExploreLibraryV1:{queries:[],groups:[{place:'10301',name:'Newest'}]}});
    releaseLibrary({ok:true,library:{queries:[],groups:[{place:'7613',name:'Stale'}]}});
    const old=document.querySelector('#place-chooser-container');
    old.replaceWith(old.cloneNode(true));
  });
  await expect(choice(page)).toBeEnabled();
  await expect(choice(page).locator('option[value="10301"]')).toHaveText('Newest');
  await expect(choice(page).locator('option[value="7613"]')).toHaveCount(0);
  const script=path.resolve(__dirname,'../../build',info.project.name.split('-')[0],'scripts/taxon-places.js');
  await page.addScriptTag({path:script});await expect(page.locator('#leafwise-taxon-places')).toHaveCount(1);
  await page.evaluate(()=>{
    dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await expect(page.locator('#leafwise-taxon-places')).toHaveCount(1);
  expect(state.writes).toEqual([]);
});

test('a hung validation times out and late replies after storage changes or pagehide cannot save',async({page},info)=>{
  const state=await fixture(page,info);
  await expect(choice(page)).toBeEnabled();
  await page.clock.install();
  await page.evaluate(()=>{
    const original=chrome.runtime.sendMessage;
    chrome.runtime.sendMessage=message=>message.type==='leafwise-taxon-place'
      ?new Promise(resolve=>window.releaseLookup=resolve):original(message);
    browser.runtime.sendMessage=chrome.runtime.sendMessage;
  });
  await choice(page).selectOption('7613');await page.clock.fastForward(26000);
  await expect(choice(page)).toBeEnabled();
  await expect(page.locator('#leafwise-taxon-places #status')).toHaveText('Request failed; try again later.');
  await page.evaluate(()=>releaseLookup({ok:true,place:{id:7613,name:'Late'}}));
  expect(state.writes).toEqual([]);
  await choice(page).selectOption('7613');
  await page.evaluate(async()=>{
    await chrome.storage.local.set({leafwiseExploreLibraryV1:{groups:[{place:'10301',name:'Newest'}],queries:[]}});
    releaseLookup({ok:true,place:{id:7613,name:'Late'}});
  });
  await expect(choice(page)).toBeEnabled();expect(state.writes).toEqual([]);
  await choice(page).selectOption('10301');
  await page.evaluate(()=>{
    dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    releaseLookup({ok:true,place:{id:10301,name:'Late'}});
  });
  await expect(page.locator('#leafwise-taxon-places')).toHaveCount(0);expect(state.writes).toEqual([]);
});

test('all 50 languages and English fallback preserve custom place names',async({page},info)=>{
  test.setTimeout(120000);
  const state=await fixture(page,info);
  for(const lang of Object.keys(require('../../src/i18n/locales.json'))){
    state.lang=lang;await page.reload();
    const translated=await page.evaluate(()=>({saved:LeafwiseI18n.t('常用地点'),manage:LeafwiseI18n.t('管理常用地區…')}));
    await expect(choice(page)).toHaveAttribute('aria-label',translated.saved);
    await expect(choice(page).locator('option[value="settings"]')).toHaveText(translated.manage);
    await expect(choice(page).locator('option[value="7613"]')).toHaveText('我的單一地點');
  }
  expect(state.writes).toEqual([]);
});

test('missing translation files use English without changing the native page',async({page},info)=>{
  await fixture(page,info,{lang:'zh-CN',missingCatalog:true});
  await expect(choice(page)).toHaveAttribute('aria-label','Saved places');
  await expect(choice(page).locator('option[value="settings"]')).toHaveText('Manage saved regions…');
});

test('long taxon/place names fit narrow LTR and RTL headers and leave the native clear button usable',async({page},info)=>{
  const state=await fixture(page,info,{long:true,groups:[{place:'7613',name:'A very long custom place name '.repeat(8)}]});
  for(const rtl of [false,true])for(const width of [1280,375]){
    state.rtl=rtl;state.lang=rtl?'ar':'en';
    await page.setViewportSize({width,height:800});await page.reload();await expect(choice(page)).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const native=await page.locator('#native-clear').boundingBox(), added=await choice(page).boundingBox();
    expect(native.x+native.width<=added.x||added.x+added.width<=native.x||native.y+native.height<=added.y||added.y+added.height<=native.y).toBe(true);
    await page.locator('#native-clear').click();await expect(page.locator('#native-clear')).toHaveAttribute('data-clicked','yes');
    await page.screenshot({path:info.outputPath('taxon-places-'+width+'-'+rtl+'.png')});
  }
});
