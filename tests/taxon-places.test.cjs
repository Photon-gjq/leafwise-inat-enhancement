const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extension = require('./extension-path.cjs');
const { taxonPage, singlePlaces, preferenceRequest } = require(path.join(extension, 'scripts/taxon-places.js'));
const core = require(path.join(extension, 'scripts/higher-taxa-core.js'));
const { createService } = require(path.join(extension, 'scripts/higher-taxa-service.js'));
const href = 'https://www.inaturalist.org/taxa/3-Aves?locale=en#taxonomy';

test('taxon shortcuts accept only single saved IDs without mutating or seeding the library', () => {
  const groups = [{place:'7613',name:'我的地區'}, {place:'6903,7613',name:'Combined'},
    {place:'any',name:'Global'}, {place:'7613',name:'Duplicate'}, {place:'10301',name:''},
    ...['0','-1','01','1.2','1e3','9007199254740992',null,123,true,' 6903 '].map(place=>({place}))];
  const before = JSON.stringify(groups);
  assert.deepEqual(singlePlaces(groups), [{id:'7613',name:'我的地區'},{id:'10301',name:'10301'}]);
  assert.equal(JSON.stringify(groups), before);
  assert.deepEqual(singlePlaces(undefined), []);
  assert.deepEqual(singlePlaces([]), []);
  assert.equal(singlePlaces(Array.from({length:60},(_,i)=>({place:String(i+1)}))).length, 50);
});

test('native preference writes have one fixed same-origin endpoint and exactly two form fields', () => {
  assert.equal(taxonPage(href), true);
  assert.equal(taxonPage('https://inaturalist.org/taxa/3'), true);
  for (const invalid of ['http://www.inaturalist.org/taxa/3','https://evil.example/taxa/3',
    'https://www.inaturalist.org:444/taxa/3','https://user:pass@www.inaturalist.org/taxa/3',
    'https://www.inaturalist.org/taxa/3/edit','https://www.inaturalist.org/observations/3',
    'https://www.inaturalist.org/taxa/0']) assert.equal(taxonPage(invalid), false);
  for (const [input, output] of [['7613','7613'],['any','null']]) {
    const {url,init} = preferenceRequest(href,input,'test-csrf');
    assert.equal(url,'https://www.inaturalist.org/users/update_session');
    assert.deepEqual({...init,body:undefined}, {method:'PUT',credentials:'same-origin',mode:'same-origin',redirect:'error',body:undefined});
    assert.deepEqual([...init.body.entries()], [['authenticity_token','test-csrf'],['preferred_taxon_page_place_id',output]]);
  }
  for (const invalid of ['7613,6903',null,0,true,'01','9007199254740992']) {
    assert.throws(()=>preferenceRequest(href,invalid,'test-csrf'));
  }
  for (const csrf of [undefined,'','a\nb', 'x'.repeat(4097)]) assert.throws(()=>preferenceRequest(href,'7613',csrf));
});

test('single-place lookup validates exact public API identity and returns no geometry', async () => {
  const calls = [];
  const service = createService({core,fetchJSON:async url=>{
    calls.push(url); return {results:[{id:7613,display_name:'Hong Kong',geometry_geojson:{private:'discard'}}]};
  }});
  assert.deepEqual(await service.place(7613), {id:7613,name:'Hong Kong'});
  assert.deepEqual(await service.place(7613), {id:7613,name:'Hong Kong'});
  assert.equal(calls.length,1);
  assert.equal(calls[0],'https://api.inaturalist.org/v1/places/7613');
  for (const invalid of [true,'7613,6903',0]) await assert.rejects(service.place(invalid));
  assert.equal(calls.length,1);
  for (const results of [[],[{id:6903,name:'Wrong'}],[{id:7613}], [{id:7613,name:'A'},{id:7613,name:'A'}]]) {
    const bad=createService({core,fetchJSON:async()=>({results})});
    await assert.rejects(bad.place(7613));
  }
});

test('background place lookup rejects non-taxon senders and subframes before any API call', async () => {
  let listener, calls=0;
  const api={runtime:{id:'test',onMessage:{addListener:f=>listener=f}},action:{onClicked:{addListener(){}}},
    storage:{session:{}}};
  const context=vm.createContext({chrome:api,browser:api,URL,QGInatHigherTaxa:core,
    QGInatHigherTaxaService:{createTransport:()=>async()=>{},createService:()=>({place:async id=>{calls++;return {id,name:'Place'};}})}});
  const source=fs.readFileSync(path.join(extension,'scripts/background.js'),'utf8').replace(/^importScripts\([^\n]+\);\n\n/,'');
  vm.runInContext(source,context);
  const sender={id:'test',url:href,frameId:0,tab:{id:5,windowId:7}};
  const send=from=>new Promise(resolve=>listener({type:'leafwise-taxon-place',placeId:7613},from,resolve));
  for(const invalid of [{...sender,url:'https://evil.example/taxa/3'},
    {...sender,url:'https://www.inaturalist.org/taxa/3/edit'}, {...sender,url:'https://www.inaturalist.org/home'},
    {...sender,frameId:1},{...sender,frameId:undefined}]) assert.equal((await send(invalid)).ok,false);
  assert.equal(calls,0);
  assert.equal((await send(sender)).place.id,7613);
  assert.equal(calls,1);
});
