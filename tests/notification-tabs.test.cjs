const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extension = require('./extension-path.cjs');

function background(fetchJSON = async () => ({ results: [] })) {
  const created = [];
  let onMessage;
  const api = {
    action: { onClicked: { addListener() {} } },
    runtime: { id: 'leafwise-test', onMessage: { addListener(listener) { onMessage = listener; } } },
    storage: { session: {} },
    tabs: { async create(details) { created.push(details); } }
  };
  const context = vm.createContext({
    chrome: api, browser: api, URL, QGInatHigherTaxa: {},
    QGInatHigherTaxaService: { createService: () => ({}), createTransport: () => fetchJSON }
  });
  const source = fs.readFileSync(path.join(extension, 'scripts/background.js'), 'utf8')
    .replace(/^importScripts\([^\n]+\);\n\n/, '');
  vm.runInContext(source, context);
  return { created, onMessage };
}

function send(listener, observationIds, sender = {
  id: 'leafwise-test', url: 'https://www.inaturalist.org/home', frameId: 0,
  tab: { id: 5, windowId: 7 }
}, type = 'leafwise-open-update-observations', unresolvedLinks) {
  return new Promise(resolve => listener({ type, observationIds, unresolvedLinks }, sender, resolve));
}

test('notification action opens one inactive same-window tab per observation ID', async () => {
  const { created, onMessage } = background();
  const reply = await send(onMessage, ['123', '456', '123', 456]);
  assert.equal(reply.ok, true);
  assert.equal(reply.opened, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(created)), [
    { url: 'https://www.inaturalist.org/observations/123', active: false, windowId: 7 },
    { url: 'https://www.inaturalist.org/observations/456', active: false, windowId: 7 }
  ]);
});

test('unresolved mentions fall back to deduplicated native read-only permalinks without extra permissions', async () => {
  const { created, onMessage } = background();
  const uuid = '12345678-1234-4567-89ab-123456789abc';
  const reply = await send(onMessage, [123, 123], undefined, undefined, [
    'https://www.inaturalist.org/comments/801#activity_comment_801',
    'https://inaturalist.org/comments/801?return_to=https://evil.example',
    'https://www.inaturalist.org/identifications/' + uuid
  ]);
  assert.equal(reply.ok, true);
  assert.equal(reply.opened, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(created)), [
    { url: 'https://www.inaturalist.org/observations/123', active: false, windowId: 7 },
    { url: 'https://www.inaturalist.org/comments/801', active: false, windowId: 7 },
    { url: 'https://www.inaturalist.org/identifications/' + uuid, active: false, windowId: 7 }
  ]);
});

test('invalid mention fallback targets reject the whole request before opening any tabs', async () => {
  const { created, onMessage } = background();
  for (const links of [true, [123], ['javascript:alert(1)'], ['https://evil.example/comments/123'],
    ['https://www.inaturalist.org/comments/123/edit'], ['https://www.inaturalist.org/identifications/123/agree'],
    ['https://www.inaturalist.org/comments/9007199254740992'], ['https://www.inaturalist.org:444/comments/123'],
    ['https://name:password@www.inaturalist.org/comments/123'], Array(21).fill('https://www.inaturalist.org/comments/123')]) {
    assert.equal((await send(onMessage, [123], undefined, undefined, links)).ok, false);
  }
  assert.equal(created.length, 0);
});

test('notification action rejects other origins, iframes and invalid IDs', async () => {
  const { created, onMessage } = background();
  for (const sender of [
    { id: 'leafwise-test', url: 'https://evil.example/', tab: { id: 5, windowId: 7 } },
    { id: 'leafwise-test', url: 'https://www.inaturalist.org/', frameId: 1, tab: { id: 5, windowId: 7 } }
  ]) assert.equal((await send(onMessage, [123], sender)).ok, false);
  assert.equal((await send(onMessage, ['javascript:alert(1)'])).ok, false);
  assert.equal((await send(onMessage, [true])).ok, false);
  assert.equal(created.length, 0);
});

test('notification history is batched, deduplicated and reduced to comparison metadata', async () => {
  const urls = [];
  const { onMessage } = background(async url => {
    urls.push(url);
    return { results: [{ id: 123, photos: ['private fixture'], location: 'not returned', identifications: [{
      id: 20, uuid: 'ABCD', user: { id: 7, login: 'not returned' }, taxon: { id: 3, name: 'not returned' },
      created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', current: true, body: 'Explanation'
    }] }] };
  });
  const [first, second] = await Promise.all([
    send(onMessage, [123, 456, 123], undefined, 'leafwise-update-identifications'),
    send(onMessage, [456, 123], undefined, 'leafwise-update-identifications')
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(urls, ['https://api.inaturalist.org/v1/observations/123,456']);
  assert.deepEqual(JSON.parse(JSON.stringify(first.observations[123])), [{
    id: 20, uuid: 'abcd', userId: 7, taxonId: 3,
    createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
    current: true, hidden: false, hasRemark: true
  }]);
  assert.equal(first.observations[456], undefined);
  assert.ok(!JSON.stringify(first).includes('Explanation'));
  assert.ok(!JSON.stringify(first).includes('not returned'));
});

test('history requests reject invalid origin, frame, ID and excessive batch before fetching', async () => {
  let calls = 0;
  const { onMessage } = background(async () => { calls++; return { results: [] }; });
  for (const ids of [[], [true], ['123,456'], Array.from({ length: 21 }, (_, i) => i + 1)]) {
    assert.equal((await send(onMessage, ids, undefined, 'leafwise-update-identifications')).ok, false);
  }
  for (const sender of [
    { id: 'leafwise-test', url: 'https://evil.example/', tab: { id: 5, windowId: 7 } },
    { id: 'leafwise-test', url: 'https://www.inaturalist.org/', frameId: 1, tab: { id: 5, windowId: 7 } }
  ]) assert.equal((await send(onMessage, [123], sender, 'leafwise-update-identifications')).ok, false);
  assert.equal(calls, 0);
});

test('failed, unexpected and incomplete observation responses cannot fabricate history', async () => {
  for (const fetchJSON of [async () => { throw new Error('offline'); }, async () => ({}),
    async () => ({ results: [{ id: 456, identifications: [] }] })]) {
    const { onMessage } = background(fetchJSON);
    assert.equal((await send(onMessage, [123], undefined, 'leafwise-update-identifications')).ok, false);
  }
  const { onMessage } = background(async () => ({ results: [{ id: 123 }] }));
  const reply = await send(onMessage, [123], undefined, 'leafwise-update-identifications');
  assert.equal(reply.ok, true);
  assert.equal(reply.observations[123], null);
});
