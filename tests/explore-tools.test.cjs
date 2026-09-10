const {test}=require('node:test');
const assert=require('node:assert/strict');
const extension=require('./extension-path.cjs');
const core=require(extension+'/scripts/higher-taxa-core.js');
const tools=require(extension+'/scripts/explore-tools.js');
const {createService}=require(extension+'/scripts/higher-taxa-service.js');
const base={user:'observer',place:10301,taxon:3,rank:'order',quality:'any'};
const rawTree=(ids)=>({size:ids.length+1,results:[{id:3,parent_id:null,name:'Aves',rank:'class',rank_level:50,direct_obs_count:0,descendant_obs_count:ids.length},...ids.map(id=>({id,parent_id:3,name:`Order ${id}`,rank:'order',rank_level:40,direct_obs_count:1,descendant_obs_count:1}))]});
const tree=ids=>core.tree(rawTree(ids));

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
 const ids=name=>tools.groups.find(g=>g.id==='builtin:'+name).place.split(',').map(Number);
 assert.ok(ids('south').includes(7613)&&ids('south').includes(10301));
 assert.equal(ids('east').includes(7887),false);
 const all=['north','east','central','south','southwest','northeast','northwest'].flatMap(ids).filter(id=>![7613,10301].includes(id));
 assert.equal(all.length,31);assert.equal(new Set(all).size,31);
 for(const group of tools.groups)assert.ok(core.placeIDs(group.place).length<=20);
 assert.equal(tools.placeLabel('10301,7887,7613,6903'),'中國大陸+港澳臺');
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

test('exports quote names, neutralize formulas, include query metadata and use current leaf values',()=>{
 const rows=[{id:41,name:'=DANGEROUS()',commonName:'測試,"名"\n',rank:'order',count:5,leaves:2}];
 const csv=tools.exportTable(rows,{...base,months:'9'},core);
 assert.ok(csv.includes('"\'=DANGEROUS()"'));assert.ok(csv.includes('"測試,""名""\n"'));assert.ok(csv.includes('month=9'));assert.ok(csv.includes('"5","2"'));assert.ok(csv.includes('澳門'));
 const tsv=tools.exportTable(rows,base,core,'\t');assert.equal(tsv.split('\r\n').length,2);assert.ok(tsv.includes("'=DANGEROUS()"));
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
