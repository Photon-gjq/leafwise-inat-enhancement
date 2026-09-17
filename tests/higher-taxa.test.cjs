const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extension = require('./extension-path.cjs');
const core = require(extension + '/scripts/higher-taxa-core.js');
const { createService, createTransport } = require(extension + '/scripts/higher-taxa-service.js');
const options = { user: 'observer', place: 6903, taxon: 3, rank: 'order', quality: 'any' };
const node = (id, parent_id, rank, rank_level, direct, total, name = `Taxon${id}`) => ({ id, parent_id, rank, rank_level, name, direct_obs_count: direct, descendant_obs_count: total });
const data = results => ({ size: results.length, results });
// A direct order ID, direct family ID, direct genus ID, species and two subspecies.
const regionData = data([
  node(3, null, 'class', 50, 1, 17, 'Aves'),
  node(40, 3, 'order', 40, 1, 8), node(30, 40, 'family', 30, 1, 7),
  node(20, 30, 'genus', 20, 1, 6), node(10, 20, 'species', 10, 1, 5),
  node(5, 10, 'subspecies', 5, 2, 2), node(6, 10, 'subspecies', 5, 2, 2),
  node(41, 3, 'order', 40, 2, 5), node(31, 41, 'family', 30, 0, 3), node(21, 31, 'genus', 20, 3, 3),
  node(42, 3, 'order', 40, 3, 3)
]);
const personalData = data([node(3, null, 'class', 50, 7, 8), node(40, 3, 'order', 40, 0, 1),
  node(30, 40, 'family', 30, 0, 1), node(20, 30, 'genus', 20, 0, 1), node(10, 20, 'species', 10, 1, 1)]);
test('whole-branch exclusion, direct higher IDs, descending count and leaf rollup', () => {
  const region = core.tree(regionData), personal = core.tree(personalData);
  const result = core.compare(region, personal, options, { rank_level: 50 });
  assert.equal(result.total, 3); assert.equal(result.seen, 1);
  assert.deepEqual(result.rows.map(r => [r.id, r.count, r.leaves]), [[41, 5, 1], [42, 3, 1]]);
  // Species with two subspecies is one leaf, not two; direct ancestor IDs add no leaves.
  assert.equal(core.leafCounts(region).get(40), 1);
  assert.equal(core.leafCounts(region).get(3), 3);
});
test('direct observation at the requested rank counts as seen; higher-only ID does not infer descendants', () => {
  const personal = core.tree(data([node(3, null, 'class', 50, 5, 6), node(42, 3, 'order', 40, 1, 1)]));
  const result = core.compare(core.tree(regionData), personal, options, { rank_level: 50 });
  assert.deepEqual(result.rows.map(r => r.id), [40, 41]);
});
test('empty user life list and empty region are valid, while malformed responses fail', () => {
  assert.equal(core.compare(core.tree(regionData), core.tree(data([])), options, { rank_level: 50 }).rows.length, 3);
  assert.equal(core.compare(core.tree(data([])), core.tree(personalData), options, { rank_level: 50 }).total, 0);
  for (const invalid of [{ results: [] }, { size: 1, results: [] }, data([{ id: 1 }]), data([node(1, 2, 'genus', 20, 1, 1)]), data([node(1, 1, 'genus', 20, 0, 1)])]) {
    assert.throws(() => core.tree(invalid));
  }
  const badCount = structuredClone(regionData); badCount.results[0].descendant_obs_count++;
  assert.throws(() => core.tree(badCount), /计数/);
});
test('rank cannot be above the search root, and root ancestors are not candidates', () => {
  assert.throws(() => core.compare(core.tree(regionData), core.tree(personalData), { ...options, rank: 'phylum' }, { rank_level: 50 }));
  const result = core.compare(core.tree(regionData), core.tree(personalData), { ...options, taxon: 40 }, { rank_level: 40 });
  assert.equal(result.total, 1);
});
test('query parameters isolate the global baseline and never send rank or unobserved filters', () => {
  const defaults = core.normalize(core.pageDefaults('https://www.inaturalist.org/observations?user_id=source&unobserved_by_user_id=observer&place_id=6903&iconic_taxa=Aves&lrank=family&verifiable=any&d1=2025-01-01'));
  assert.deepEqual(defaults, { ...options, rank: 'family', d1:'2025-01-01' });
  assert.deepEqual(core.regionParams(defaults), { place_id: 6903, taxon_id: 3, verifiable: 'any', d1:'2025-01-01' });
  assert.deepEqual(core.userParams(defaults, 123), { user_id: 123, taxon_id: 3, verifiable: 'any' });
  assert.equal(core.pageDefaults('https://www.inaturalist.org/observations', 'saved').user, 'saved');
  assert.equal(core.pageDefaults('https://www.inaturalist.org/observations?rank=species').rank, 'order');
  assert.equal(new URL(core.observationsURL(options, 41)).searchParams.has('user_id'), false);
});
test('reject invalid inputs and multiple users before network work', () => {
  for (const changes of [{ user: '' }, { user: 'a,b' }, { user: '../users' }, { place: 0 }, { place: '6903,wrong' }, { taxon: 'Aves' }, { rank: 'species' }, { quality: 'false' }]) {
    assert.throws(() => core.normalize({ ...options, ...changes }));
  }
});
function fakeAPI(calls, overrides = {}) {
  return async url => {
    const u = new URL(url); calls.push(u);
    if (u.pathname === '/v1/users/observer') return overrides.user || { results: [{ id: 123, login: 'observer' }] };
    if (u.pathname === '/v1/places/6903') return { results: [{ id: 6903, display_name: 'China' }] };
    if (u.pathname === '/v1/taxa/3') return { results: [{ id: 3, name: 'Aves', rank_level: 50 }] };
    if (u.pathname === '/v1/observations/taxonomy') {
      if (overrides.fail) throw new Error('API 503');
      return u.searchParams.has('user_id') ? personalData : regionData;
    }
    if (u.pathname === '/v1/observations/species_counts') return { total_results: 1 };
    throw new Error('Unexpected request: ' + url);
  };
}
test('integration: 5 initial requests, no new requests for rank changes, one optional leaf request', async () => {
  const calls = []; const service = createService({ core, fetchJSON: fakeAPI(calls) });
  const result = await service.compare(options); assert.equal(result.rows.length, 2); assert.equal(calls.length, 5);
  const global = calls.find(u => u.searchParams.has('user_id'));
  assert.equal(global.searchParams.get('user_id'), '123'); assert.equal(global.searchParams.has('place_id'), false);
  await service.compare({ ...options, rank: 'family' }); assert.equal(calls.length, 5);
  const verified = await service.verifyLeaf(options, 41); assert.equal(verified.count, 1); assert.equal(calls.length, 6);
  assert.equal(calls.at(-1).searchParams.get('per_page'), '1'); assert.equal(calls.at(-1).searchParams.has('rank'), false);
  await service.verifyLeaf(options, 41); assert.equal(calls.length, 6);
  await assert.rejects(service.verifyLeaf(options, 999));
});
test('concurrent duplicates coalesce and caches survive worker recreation then expire', async () => {
  let time = 1000; const values = {}; const calls = [];
  const storage = { get: async key => key ? { [key]: values[key] } : { ...values }, set: async v => Object.assign(values, v), remove: async keys => keys.forEach(k => delete values[k]) };
  const deps = { core, fetchJSON: fakeAPI(calls), storage, now: () => time };
  const service = createService(deps);
  await Promise.all([service.compare(options), service.compare(options)]); assert.equal(calls.length, 5);
  await createService(deps).compare(options); assert.equal(calls.length, 5);
  time += 600001; await createService(deps).compare(options); assert.equal(calls.length, 10);
});
test('invalid usernames and API failures reject rather than fabricate unobserved results', async () => {
  const calls = []; const invalid = createService({ core, fetchJSON: fakeAPI(calls, { user: { results: [] } }) });
  await assert.rejects(invalid.compare(options), /不存在/);
  assert.equal(calls.some(u => u.pathname.endsWith('/taxonomy')), false);
  const failing = createService({ core, fetchJSON: fakeAPI([], { fail: true }) });
  await assert.rejects(failing.compare(options), /503/);
});
test('packaged manifest references actual files and all JavaScript parses', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3); assert.equal(manifest.version, require('../package.json').version);
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const file of [...(manifest.background.scripts || [manifest.background.service_worker]), manifest.options_page, ...manifest.content_scripts.flatMap(x => x.js)]) assert.ok(fs.existsSync(path.join(extension, file)), file);
  for (const file of fs.readdirSync(path.join(extension, 'scripts'))) if (file.endsWith('.js')) new vm.Script(fs.readFileSync(path.join(extension, 'scripts', file), 'utf8'), { filename: file });
});
test('multiple places accept commas, trim, deduplicate and canonicalize equivalent scopes', () => {
  const places = '6903,7613,7887,10301';
  assert.deepEqual(core.placeIDs(' 10301，7613, 06903 ,7887,7613 '), [6903, 7613, 7887, 10301]);
  assert.equal(core.normalize({ ...options, place: '10301，7613,6903,7887,7613' }).place, places);
  assert.equal(core.normalize({ ...options, place: '6903,06903' }).place, 6903);
  assert.equal(core.normalize(core.pageDefaults(`https://www.inaturalist.org/observations?user_id=observer&place_id=${places}&taxon_id=48460`)).place, places);
  assert.equal(core.normalize({ ...options, taxon: 48460, place: places }).taxon, 48460);
  for (const invalid of ['', ' ', ',6903', '6903,', '6903,,7613', '6903;7613', '6903 7613', '6903,0', '-1,6903', '6903,1.5', '6903,1e3', '6903,9007199254740992', Array.from({ length: 21 }, (_, i) => i + 1).join(',')]) {
    assert.throws(() => core.placeIDs(invalid), invalid);
  }
});
test('one batched place lookup and one union taxonomy; all links and verification preserve the same union', async () => {
  const calls = [];
  const base = fakeAPI(calls);
  const service = createService({ core, fetchJSON: async url => {
    const u = new URL(url);
    if (u.pathname === '/v1/places/6903,7613,7887,10301') {
      calls.push(u);
      return { results: [{ id: 10301, name: 'Macao' }, { id: 7887, name: 'Taiwan' }, { id: 7613, name: 'Hong Kong' }, { id: 6903, name: 'China' }] };
    }
    return base(url);
  } });
  const input = { ...options, place: '10301，7613,6903,7887,6903' };
  const result = await service.compare(input);
  assert.deepEqual(result.place.ids, [6903, 7613, 7887, 10301]);
  assert.equal(result.place.name, 'China ∪ Hong Kong ∪ Taiwan ∪ Macao');
  assert.equal(result.options.place, '6903,7613,7887,10301');
  assert.equal(calls.length, 5);
  const regional = calls.filter(u => u.pathname.endsWith('/taxonomy') && u.searchParams.has('place_id'));
  assert.equal(regional.length, 1, 'never sum per-place counts');
  assert.equal(regional[0].searchParams.get('place_id'), '6903,7613,7887,10301');
  assert.equal(new URL(result.regionURL).searchParams.get('place_id'), '6903,7613,7887,10301');
  assert.equal(new URL(result.personalURL).searchParams.has('place_id'), false);
  assert.equal(new URL(core.observationsURL(result.options, 41)).searchParams.get('place_id'), '6903,7613,7887,10301');
  await service.compare({ ...options, rank: 'family', place: '7887,10301,7613,6903' });
  assert.equal(calls.length, 5, 'order and duplicates do not invalidate a union cache');
  await service.verifyLeaf(input, 41);
  assert.equal(calls.length, 6);
  assert.equal(calls.at(-1).searchParams.get('place_id'), '6903,7613,7887,10301');
});
test('missing or unexpected place IDs reject the entire scope before querying taxonomy', async () => {
  for (const results of [[{ id: 6903, name: 'China' }], [{ id: 6903, name: 'China' }, { id: 999, name: 'Wrong place' }]]) {
    const calls = []; const base = fakeAPI(calls);
    const service = createService({ core, fetchJSON: async url => {
      const u = new URL(url);
      if (u.pathname === '/v1/places/6903,7613') { calls.push(u); return { results }; }
      return base(url);
    } });
    await assert.rejects(service.compare({ ...options, place: '6903,7613' }), /地点/);
    assert.equal(calls.some(u => u.pathname.endsWith('/taxonomy')), false);
  }
});
test('switching place union refreshes only place metadata and the regional tree', async () => {
  const calls = []; const base = fakeAPI(calls);
  const service = createService({ core, fetchJSON: async url => {
    const u = new URL(url);
    if (u.pathname === '/v1/places/6903,7613') {
      calls.push(u); return { results: [{ id: 7613, name: 'Hong Kong' }, { id: 6903, name: 'China' }] };
    }
    return base(url);
  } });
  await service.compare(options); assert.equal(calls.length, 5);
  await service.compare({ ...options, place: '6903,7613' }); assert.equal(calls.length, 7);
  assert.equal(calls.filter(u => u.pathname.endsWith('/taxonomy') && u.searchParams.has('user_id')).length, 1);
});
test('large response bodies get a separate download deadline; stalled responses still fail', async () => {
  function slowFetch(stage, delay) {
    return async (url, { signal }) => {
      const slow = () => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ results: [] }), delay);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
      if (stage === 'response') await slow();
      return { ok: true, json: stage === 'body' ? slow : async () => ({ results: [] }) };
    };
  }
  const timing = { responseTimeout: 20, bodyTimeout: 120, startInterval: 0 };
  assert.deepEqual(await createTransport(slowFetch('body', 50), timing)('https://api.inaturalist.org/v1/observations/taxonomy'), { results: [] });
  await assert.rejects(createTransport(slowFetch('response', 200), timing)('https://api.inaturalist.org/v1/taxa/3'), /未响应/);
  await assert.rejects(createTransport(slowFetch('body', 200), { ...timing, bodyTimeout: 20 })('https://api.inaturalist.org/v1/observations/taxonomy'), /数据下载/);
});

test('worldwide scope omits place from API and uses four initial requests', async () => {
  const calls = []; const service = createService({ core, fetchJSON: fakeAPI(calls) });
  const input = { ...options, place: ' ANY ' };
  const result = await service.compare(input);
  assert.equal(result.options.place, 'any');
  assert.deepEqual(result.place.ids, []);
  assert.equal(calls.length, 4);
  assert.equal(calls.some(url => url.pathname.includes('/places/')), false);
  assert.equal(new URL(result.regionURL).searchParams.has('place_id'), false);
  assert.equal(new URL(result.personalURL).searchParams.has('place_id'), false);
  await service.verifyLeaf(input, 41);
  assert.equal(calls.at(-1).searchParams.has('place_id'), false);
});

test('Chinese names batch, cache, force refresh and validate the 30 item limit', async () => {
  const calls = [];
  const service = createService({ core, fetchJSON: async url => {
    calls.push(new URL(url));
    return { results: [{ id: 41, preferred_common_name: ' 測試目 ' }, { id: 42 }, { id: 99, preferred_common_name: 'unexpected' }] };
  } });
  const first = await service.names(options, [42, 41, 41]);
  assert.deepEqual(first.names, { 41: '測試目', 42: '' });
  assert.equal(calls[0].pathname, '/v1/taxa/41,42');
  assert.equal(calls[0].searchParams.get('locale'), 'zh-CN');
  assert.equal(calls[0].searchParams.get('preferred_place_id'), '6903');
  await service.names(options, [41, 42]); assert.equal(calls.length, 1);
  await service.refreshNames(options, [41, 42]); assert.equal(calls.length, 2);
  await assert.rejects(service.names(options, Array.from({ length: 31 }, (_, i) => i + 1)), /30/);
});

test('browser background loads dependencies and responds to asynchronous messages', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
  const isFirefox = process.env.LEAFWISE_TARGET === 'firefox';
  if (isFirefox) {
    assert.equal(manifest.background.service_worker, undefined);
    assert.equal(manifest.background.persistent, false);
  } else {
    assert.equal(manifest.background.scripts, undefined);
    assert.equal(manifest.background.service_worker, 'scripts/background.js');
    assert.equal(manifest.browser_specific_settings, undefined);
  }
  let listener, click; const local = {}, session = {}; let opened = 0, fetches = 0;
  const area = data => ({ get: async key => key ? Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k, data[k]])) : { ...data }, set: async value => Object.assign(data, value), remove: async keys => keys.forEach(key => delete data[key]) });
  const chrome = {
    storage: { local: area(local), session: area(session) },
    action: { onClicked: { addListener: callback => { click = callback; } } },
    runtime: { id: 'test-chrome-extension', openOptionsPage: async () => { opened++; }, onMessage: { addListener: callback => { listener = callback; } } }
  };
  const context = vm.createContext({ chrome, browser: chrome, URL, URLSearchParams, setTimeout, clearTimeout, AbortController, fetch: async () => { fetches++; return { ok: true, json: async () => ({ total_results: 7 }) }; } });
  context.importScripts = (...files) => { for (const file of files) vm.runInContext(fs.readFileSync(path.join(extension, 'scripts', file), 'utf8'), context, {filename:file}); };
  for (const file of manifest.background.scripts || [manifest.background.service_worker]) {
    vm.runInContext(fs.readFileSync(path.join(extension, file), 'utf8'), context);
  }
  const send = message => new Promise(resolve => assert.equal(listener(message, { id: chrome.runtime.id }, resolve), true));
  assert.equal(typeof listener, 'function');
  assert.equal(listener({ type: 'qg-open-options' }, { id: 'another-extension' }, () => assert.fail('foreign sender')), undefined);
  assert.equal((await send({ type: 'qg-open-options' })).ok, true);
  await click(); assert.equal(opened, 2);
  const message = { type: 'qg-taxon-observation-count', userId: 123, taxonId: 3 };
  assert.equal((await send(message)).count, 7);
  assert.equal((await send(message)).count, 7); assert.equal(fetches, 1);
  assert.equal((await send({ ...message, force: true })).count, 7); assert.equal(fetches, 2);
  assert.equal((await send(message)).count, 7); assert.equal(fetches, 2);
  const cached = await send({ type: 'qg-cached-taxon-observation-counts', userId: 123, taxonIds: [3, 4] });
  assert.equal(cached.counts[3], 7); assert.equal(cached.counts[4], undefined);
  const invalid = await send({ ...message, taxonId: -1 });
  assert.equal(invalid.ok, false); assert.match(invalid.error, /Invalid/);
});

test('0.9.8 saved settings preserve all-life and normalize usernames', () => {
  const taxa = require(extension + '/scripts/saved-taxa.js');
  const users = require(extension + '/scripts/saved-users.js');
  assert.ok(taxa.read({}).some(item => item.id === 48460));
  assert.deepEqual(taxa.parse('3 = 鳥綱\n48460 = 全部生物'), [{ id: 3, name: '鳥綱' }, { id: 48460, name: '全部生物' }]);
  assert.deepEqual(users.normalize([' observer ', 'OBSERVER', 'second']), ['observer', 'second']);
});
