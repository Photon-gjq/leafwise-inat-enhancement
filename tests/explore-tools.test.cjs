const {test}=require('node:test');
const assert=require('node:assert/strict');
const extension=require('./extension-path.cjs');
const core=require(extension+'/scripts/higher-taxa-core.js');
const tools=require(extension+'/scripts/explore-tools.js');
const savedTaxa=require(extension+'/scripts/saved-taxa.js');
const {createService}=require(extension+'/scripts/higher-taxa-service.js');
const base={user:'observer',place:10301,taxon:3,rank:'order',quality:'any'};
const rawTree=(ids)=>({size:ids.length+1,results:[{id:3,parent_id:null,name:'Aves',rank:'class',rank_level:50,direct_obs_count:0,descendant_obs_count:ids.length},...ids.map(id=>({id,parent_id:3,name:`Order ${id}`,rank:'order',rank_level:40,direct_obs_count:1,descendant_obs_count:1}))]});
const tree=ids=>core.tree(rawTree(ids));

test('taxon shortcuts validate IDs and only replace the taxon, page and saved-query pointer',()=>{
 const href='https://www.inaturalist.org/observations?taxon_id=3&user_id=observer&unobserved_by_user_id=other&place_id=7613,10301&month=9&project_id=12&quality_grade=research&view=species&swlat=1&swlng=2&nelat=3&nelng=4&lat=5&lng=6&radius=7&hrank=family&lrank=species&page=4&per_page=50&leafwise_query=q1#map';
 const url=new URL(tools.taxonSearchURL(href,'00047158',savedTaxa));
 assert.equal(url.searchParams.get('taxon_id'),'47158');
 assert.equal(url.searchParams.has('page'),false);assert.equal(url.searchParams.has('leafwise_query'),false);assert.equal(url.hash,'#map');
 for(const [key,value] of new URL(href).searchParams)if(!['taxon_id','page','leafwise_query'].includes(key))assert.equal(url.searchParams.get(key),value,key);
 assert.equal(new URL(tools.taxonSearchURL(url.href,'any',savedTaxa)).searchParams.has('taxon_id'),false);
 for(const bad of ['',undefined,'0','-1','1.5','1e3','3,4','9007199254740992',{}])assert.throws(()=>tools.taxonSearchURL(href,bad,savedTaxa));
 for(const bad of ['https://example.com/observations','http://www.inaturalist.org/observations','https://user@www.inaturalist.org/observations','https://www.inaturalist.org:8443/observations','https://www.inaturalist.org/observations/123'])assert.throws(()=>tools.taxonSearchURL(bad,3,savedTaxa));
});

test('taxon exclusion shortcuts replace both taxon parameters on Observations and Identify, never other filters',()=>{
 for(const pathname of ['/observations','/observations/identify/']) {
  const href=`https://www.inaturalist.org${pathname}?taxon_id=3&without_taxon_id=4&without_taxon_id=5&place_id=10301&user_id=observer&unobserved_by_user_id=other&reviewed=false&quality_grade=needs_id&identifications=most_agree&not_in_place=12&month=9&per_page=30&page=8&leafwise_query=q1#grid`;
  const entry={id:125816,withoutTaxonIds:[50186,3,50186],name:'preset'};
  const before=JSON.stringify(entry);
  const next=new URL(tools.taxonSearchURL(href,entry,savedTaxa));
  assert.equal(next.pathname,pathname);assert.equal(next.hash,'#grid');
  assert.equal(next.searchParams.get('taxon_id'),'125816');
  assert.deepEqual(next.searchParams.getAll('without_taxon_id'),['3,50186']);
  for(const [key,value] of new URL(href).searchParams)if(!['taxon_id','without_taxon_id','page','leafwise_query'].includes(key))assert.equal(next.searchParams.get(key),value,key);
  for(const key of ['page','leafwise_query'])assert.equal(next.searchParams.has(key),false);
  assert.equal(JSON.stringify(entry),before);
  const plain=new URL(tools.taxonSearchURL(next.href,{id:125816},savedTaxa));
  assert.equal(plain.searchParams.has('without_taxon_id'),false);
  const any=new URL(tools.taxonSearchURL(next.href,'any',savedTaxa));
  assert.equal(any.searchParams.has('taxon_id'),false);assert.equal(any.searchParams.has('without_taxon_id'),false);
  const region=new URL(tools.placeSearchURL(next.href,'7613,10301',core));
  assert.equal(region.searchParams.get('without_taxon_id'),'3,50186');
  assert.equal(region.searchParams.get('reviewed'),'false');assert.equal(region.pathname,pathname);
 }
 for(const bad of [null,'https://example.com/observations/identify','http://www.inaturalist.org/observations/identify','https://user@www.inaturalist.org/observations/identify','https://www.inaturalist.org:8443/observations/identify','https://www.inaturalist.org/observations/identify/123','https://www.inaturalist.org/observations/upload']) {
  assert.equal(tools.quickSearchPage(bad),null);
  assert.throws(()=>tools.taxonSearchURL(bad,3,savedTaxa));
  assert.throws(()=>tools.placeSearchURL(bad,'any',core));
 }
 assert.equal(tools.quickSearchPage('https://inaturalist.org/observations/identify'),'identify');
 // Extending quick navigation must not extend saved-query/comparison scope.
 assert.throws(()=>tools.searchURL('https://www.inaturalist.org/observations/identify'));
});

test('four comparison scopes distinguish never seen, missed this year/local, and first recorded this year',()=>{
 const region=tree([41,42,43]),known=tree([41,42]),year=tree([42]),local=tree([41]);
 const compare=(mode,personal,previous=tree([]))=>core.compare(region,personal,{...base,comparison:mode},{rank_level:50},previous,known).rows.map(r=>r.id);
 assert.deepEqual(compare('lifetime',known),[43]);
 assert.deepEqual(compare('year',year),[41]);
 assert.deepEqual(compare('local',local),[42]);
 assert.deepEqual(compare('first',year,tree([41])),[42]);
 assert.deepEqual(compare('first',year,known),[]);
});

test('regional seasonal/date/project filters stay out of personal baselines and remain in links',()=>{
 const opts=core.normalize({...base,comparison:'year',year:2026,months:'9， 8,09',d1:'2025-01-01',d2:'2026-12-31',project:'123'});
 assert.deepEqual(core.regionParams(opts),{taxon_id:3,place_id:10301,verifiable:'any',month:'8,9',d1:'2025-01-01',d2:'2026-12-31',project_id:123});
 assert.deepEqual(core.userParams(opts,7),{user_id:7,taxon_id:3,verifiable:'any',d1:'2026-01-01',d2:'2026-12-31'});
 assert.deepEqual(core.userParams({...opts,comparison:'local'},7),{user_id:7,taxon_id:3,verifiable:'any',place_id:10301});
 assert.equal(core.userParams({...opts,comparison:'first'},7,true).d2,'2025-12-31');
 const url=new URL(core.observationsURL(opts,41));assert.equal(url.searchParams.get('month'),'8,9');assert.equal(url.searchParams.get('project_id'),'123');assert.equal(url.searchParams.has('rank'),false);
 for(const bad of [{comparison:'random'},{year:1,comparison:'year'},{year:2026.5,comparison:'first'},{months:'0'},{months:'13'},{months:'1,'},{d1:'2026-02-30'},{d1:'2026-02-02',d2:'2026-01-01'},{project:'../../users'}])assert.throws(()=>core.normalize({...base,...bad}));
});

test('named place presets cover all 31 mainland provincial units once, with the agreed memberships',()=>{
 assert.equal(tools.groups.find(g=>g.id==='builtin:all').name,'中國大陸+港澳臺');
 assert.equal(tools.groups.find(g=>g.id==='builtin:all').place,'6903,7613,7887,10301');
 assert.equal(tools.groups.find(g=>g.id==='builtin:mainland-hk-mo').name,'中國大陸+港澳');
 assert.equal(tools.groups.find(g=>g.id==='builtin:mainland-hk-mo').place,'6903,7613,10301');
 const ids=name=>tools.groups.find(g=>g.id==='builtin:'+name).place.split(',').map(Number);
 assert.ok(ids('south').includes(7613)&&ids('south').includes(10301));
 assert.equal(ids('east').includes(7887),false);
 const all=['north','east','central','south','southwest','northeast','northwest'].flatMap(ids).filter(id=>![7613,10301].includes(id));
 assert.equal(all.length,31);assert.equal(new Set(all).size,31);
 for(const group of tools.groups)assert.ok(core.placeIDs(group.place).length<=20);
 assert.equal(tools.placeLabel('10301,7887,7613,6903'),'中國大陸+港澳臺');
 assert.equal(tools.placeLabel('10301,7613,6903'),'中國大陸+港澳');
 assert.equal(tools.placeLabel('53101'),'廣東');
});

test('query and place collections round-trip full URLs and settings; updates and deletes target exact entries',()=>{
 const options={...base,comparison:'first',year:2026,months:'9',project:12};
 const url='https://www.inaturalist.org/observations?taxon_id=3&place_id=10301&swlat=1&nelat=2&not_in_taxon_id=123&month=9#map';
 let lib=tools.editLibrary({},'save-query',{name:' 秋季清單 ',url,options},core,'q1');
 assert.equal(lib.queries[0].url,url);assert.deepEqual(lib.queries[0].options,options);
 lib=tools.editLibrary(lib,'save-query',{...lib.queries[0],name:'新名稱'},core,'ignored');assert.equal(lib.queries.length,1);assert.equal(lib.queries[0].id,'q1');
 lib=tools.editLibrary(lib,'save-place',{name:'我的區域',place:'7613,10301,7613'},core,'p1');assert.equal(lib.groups[0].place,'7613,10301');
 lib=tools.editLibrary(lib,'remove-query',{id:'q1'},core);assert.equal(lib.queries.length,0);assert.equal(lib.groups.length,1);
 assert.throws(()=>tools.editLibrary(lib,'remove-place',{id:'builtin:all'},core));
 for(const invalid of ['javascript:alert(1)','https://example.com/observations','https://www.inaturalist.org/observations/123','https://user@www.inaturalist.org/observations'])assert.throws(()=>tools.searchURL(invalid));
 assert.equal(new URL(tools.searchURL(url.replace('#map','&leafwise_query=q1#map'))).searchParams.has('leafwise_query'),false);
 assert.throws(()=>tools.editLibrary({},'save-query',{name:'',url,options},core,'q1'));
});

test('quick region URLs replace geographic scope only, reject unsafe input and never restore a saved query',()=>{
 const href='https://www.inaturalist.org/observations/?user_id=observer&unobserved_by_user_id=other&taxon_id=3&month=9&quality_grade=research&project_id=123&view=species&preferred_place_id=1&not_in_place=14&swlat=1&swlng=2&nelat=3&nelng=4&lat=5&lng=6&radius=10&page=9&per_page=50&leafwise_query=q1#map';
 const url=new URL(tools.placeSearchURL(href,'10301,7613,7613',core));
 assert.equal(url.searchParams.get('place_id'),'7613,10301');assert.equal(url.hash,'#map');
 for(const key of ['swlat','swlng','nelat','nelng','lat','lng','radius','page','leafwise_query'])assert.equal(url.searchParams.has(key),false,key);
 const before=new URL(href);for(const key of ['user_id','unobserved_by_user_id','taxon_id','month','quality_grade','project_id','view','preferred_place_id','not_in_place','per_page'])assert.equal(url.searchParams.get(key),before.searchParams.get(key),key);
 assert.equal(new URL(tools.placeSearchURL(url.href,'any',core)).searchParams.get('place_id'),'any');
 for(const bad of ['',undefined,'0','1e3','6903,',Array.from({length:21},(_,i)=>i+1).join(',')])assert.throws(()=>tools.placeSearchURL(href,bad,core));
 for(const bad of ['https://example.com/observations','https://user@www.inaturalist.org/observations','https://www.inaturalist.org/observations/123','http://www.inaturalist.org/observations'])assert.throws(()=>tools.placeSearchURL(bad,'any',core));
});

test('optional examples append to drafts only and keep duplicate names, order and whitespace intact',()=>{
 const example=tools.groups.find(group=>group.id==='builtin:mainland-hk-mo');
 assert.equal(tools.appendPlaceGroup('',example,core),'6903,7613,10301 = 中國大陸+港澳');
 const duplicate=' 10301，7613,6903 = My own name\n';
 assert.equal(tools.appendPlaceGroup(duplicate,example,core),duplicate);
 const draft='7613 = Mine\n6803\n';const snapshot=JSON.stringify(example);
 assert.equal(tools.appendPlaceGroup(draft,example,core),'7613 = Mine\n6803\n6903,7613,10301 = 中國大陸+港澳');
 assert.equal(JSON.stringify(example),snapshot);
 assert.throws(()=>tools.appendPlaceGroup('bad',example,core));
 const full=Array.from({length:50},(_,i)=>`${i+1} = Group`).join('\n');
 assert.throws(()=>tools.appendPlaceGroup(full,example,core),/50/);
 assert.equal(tools.appendPlaceGroup(full,{place:'1',name:'Duplicate'},core),full);
});

test('exports quote names, neutralize formulas, include query metadata and use current leaf values',()=>{
 const rows=[{id:41,name:'=DANGEROUS()',commonName:'測試,"名"\n',rank:'order',count:5,leaves:2}];
 const csv=tools.exportTable(rows,{...base,months:'9'},core);
 assert.ok(csv.includes('"\'=DANGEROUS()"'));assert.ok(csv.includes('"測試,""名""\n"'));assert.ok(csv.includes('month=9'));assert.ok(csv.includes('"5","2"'));assert.ok(csv.includes('澳門'));
 const tsv=tools.exportTable(rows,base,core,'\t');assert.equal(tsv.split('\r\n').length,2);assert.ok(tsv.includes("'=DANGEROUS()"));
});

test('settings place groups normalize combinations, preserve IDs/queries and reject stale or invalid forms atomically',()=>{
 const original={queries:[{id:'q1',name:'Query'}],groups:[{id:'p1',name:'自訂名',place:'7613,10301'}]};
 let ids=0;
 const entry={text:'10301，7613 = Renamed\n6903 = Mainland',expectedGroups:original.groups};
 const result=tools.replacePlaceGroups(original,entry,core,()=>`new${++ids}`);
 assert.equal(result.groups[0].id,'p1');assert.equal(result.groups[0].name,'Renamed');assert.equal(result.groups[1].id,'new1');
 assert.deepEqual(result.queries,original.queries);assert.equal(original.groups[0].name,'自訂名');
 assert.equal(tools.formatPlaceGroups(result.groups),'7613,10301 = Renamed\n6903 = Mainland');
 const unnamed=tools.replacePlaceGroups(original,{text:'10301,7613',expectedGroups:original.groups},core,()=>assert.fail());
 assert.equal(unnamed.groups[0].name,'自訂名');
 const empty=tools.replacePlaceGroups(original,{text:'',expectedGroups:original.groups},core,()=>assert.fail());
 assert.deepEqual(empty.groups,[]);assert.deepEqual(empty.queries,original.queries);
 assert.throws(()=>tools.replacePlaceGroups(result,entry,core,()=>assert.fail()),/其他页面/);
 for(const text of ['any','0','6903,','6903 =','7613,10301 = A\n10301,7613 = B','6903 = '+ 'x'.repeat(81),Array.from({length:51},(_,i)=>`${i+1} = Name`).join('\n')]) {
  assert.throws(()=>tools.replacePlaceGroups(original,{text,expectedGroups:original.groups},core,()=>assert.fail('validation before IDs')));
 }
});

test('personal record caches and both date-ordered requests are partitioned by region',async()=>{
 const calls=[];
 const service=createService({core,explore:tools,fetchJSON:async url=>{const u=new URL(url);calls.push(u);const n=u.searchParams.has('place_id')?1:5;return {total_results:n,results:[{id:n,observed_on:'2026-01-02'}]};}});
 assert.equal((await service.records(7,3)).datedCount,5);
 assert.equal((await service.records(7,3,6903)).datedCount,1);
 await service.records(7,3,6903);assert.equal(calls.length,4);
 assert.ok(calls.slice(-2).every(u=>u.searchParams.get('place_id')==='6903'));
 await service.records(7,3,7613);assert.equal(calls.length,6);
 for(const bad of ['any','',0,-1,'6903,7613','1e3'])await assert.rejects(service.records(7,3,bad));
 assert.equal(calls.length,6);
});

test('scope changes reuse cached trees and first-year loads an additional historical baseline',async()=>{
 const calls=[];
 const service=createService({core,fetchJSON:async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname==='/v1/users/observer')return {results:[{id:7,login:'observer'}]};
  if(u.pathname==='/v1/places/10301')return {results:[{id:10301,name:'Macao'}]};
  if(u.pathname==='/v1/taxa/3')return {results:[{id:3,name:'Aves',rank_level:50}]};
  if(u.pathname.endsWith('/taxonomy')){
   if(!u.searchParams.has('user_id'))return rawTree([41,42,43]);
   if(u.searchParams.has('place_id'))return rawTree([41]);
   if(u.searchParams.has('d1'))return rawTree([42]);
   if(u.searchParams.has('d2'))return rawTree([41]);
   return rawTree([41,42]);
  }
  if(u.pathname.endsWith('/species_counts'))return {total_results:1};
  throw new Error(url);
 }});
 assert.deepEqual((await service.compare(base)).rows.map(r=>r.id),[43]);assert.equal(calls.length,5);
 assert.deepEqual((await service.compare({...base,comparison:'year',year:2026})).rows.map(r=>r.id),[41]);assert.equal(calls.length,6);
 assert.deepEqual((await service.compare({...base,comparison:'local'})).rows.map(r=>r.id),[42]);assert.equal(calls.length,7);
 const first=await service.compare({...base,comparison:'first',year:2026});assert.deepEqual(first.rows.map(r=>r.id),[42]);assert.ok(first.previousURL);assert.equal(calls.length,8);
 await service.compare({...base,comparison:'first',year:2026,rank:'family'});assert.equal(calls.length,8);
 await service.verifyLeaf({...base,months:'9'},41);assert.equal(calls.at(-1).searchParams.get('month'),'9');
});

test('personal record summary fetches two sorted single records on demand, coalesces and excludes undated records',async()=>{
 const calls=[];
 const service=createService({core,explore:tools,fetchJSON:async url=>{const u=new URL(url);calls.push(u);return {total_results:5,results:[{id:u.searchParams.get('order')==='asc'?11:22,observed_on:'2026-01-02',place_guess:'Public place',secret:'must not persist'}]};}});
 assert.equal(calls.length,0);
 const [a,b]=await Promise.all([service.records(7,3),service.records(7,3)]);
 assert.equal(calls.length,2);assert.deepEqual(a,b);assert.equal(a.first.id,11);assert.equal(a.latest.id,22);assert.equal(a.first.secret,undefined);
 for(const url of calls){assert.equal(url.searchParams.get('per_page'),'1');assert.equal(url.searchParams.get('order_by'),'observed_on');assert.equal(url.searchParams.get('d1'),'0001-01-01');assert.equal(url.searchParams.has('place_id'),false);}
 await service.records(7,3);assert.equal(calls.length,2);
 await assert.rejects(service.records(-1,3));
 const bad=createService({core,explore:tools,fetchJSON:async()=>({total_results:3,results:[]})});await assert.rejects(bad.records(7,3),/格式/);
 const empty=createService({core,explore:tools,fetchJSON:async()=>({total_results:0,results:[]})});assert.deepEqual(await empty.records(7,3),{first:null,latest:null,datedCount:0});
});
