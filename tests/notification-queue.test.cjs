const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const queue = require(path.join(require('./extension-path.cjs'), 'scripts/notification-queue.js'));
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const data = {}, created = [];
  let failed = false;
  const storage = {
    get: async key => copy({ [key]: data[key] || null }),
    set: async values => { if (failed) throw Error('quota'); Object.assign(data, copy(values)); }
  };
  const createTab = async details => { if (details.url.endsWith('/13')) throw Error('blocked'); created.push(details); };
  let service = queue.createService({ storage, createTab });
  return { data, created, fail: () => { failed = true; },
    restart: () => { service = queue.createService({ storage, createTab }); },
    send: (action, fields = {}, viewerId = 7) => service({ action, viewerId, ...fields }, { tab: { windowId: 9 } }) };
}
const entries = n => Array.from({ length: n }, (_, i) => ({ href: '/observations/' + (i + 100) + '#activity_comment_' + (i + 1000) }));

test('capture persists all 60 items before opening; recent-menu replacement and worker restart retain the remaining 50', async () => {
  const f = fixture();
  const full = (await f.send('capture', { entries: entries(60) })).queue;
  assert.equal(queue.groups(full.entries).size, 60);
  const result = await f.send('open', { targets: [...queue.groups(full.entries).keys()].slice(0, 10) });
  assert.equal(result.openedTargets.length, 10);
  f.restart();
  const recent = (await f.send('capture', { entries: entries(9) })).queue;
  assert.equal(queue.groups(recent.entries).size, 50);
  assert.equal(f.created.length, 10);
  assert.ok(f.created.every(tab => !tab.active && tab.windowId === 9));
});

test('duplicates, observation and flag IDs, mentions and new events on opened observations have separate identities', async () => {
  const f = fixture();
  const initial = await f.send('capture', { entries: [
    { href: '/observations/1#activity_identification_20' }, { href: '/observations/1#activity_comment_21' },
    { href: '/flags/1' }, { href: '/comments/22?return_to=bad' }, { href: '/comments/22' }
  ] });
  await f.send('resolve', { entries: [{ href: '/comments/22', target: '/flags/1' }] });
  const saved = (await f.send('list')).queue;
  assert.equal(initial.queue.entries.length, 4);
  assert.deepEqual([...queue.groups(saved.entries).keys()], ['/observations/1', '/flags/1']);
  await f.send('open', { targets: ['/observations/1', '/flags/1'] });
  const next = (await f.send('capture', { entries: [{ href: '/observations/1#activity_identification_23' }] })).queue;
  assert.deepEqual([...queue.groups(next.entries).keys()], ['/observations/1']);
});

test('partial failures remain pending, while successful destinations never reopen from the recent menu', async () => {
  const f = fixture();
  const input = [{ href: '/observations/12' }, { href: '/flags/13' }, { href: '/comments/14' }];
  await f.send('capture', { entries: input });
  const result = await f.send('open', { targets: ['/observations/12', '/flags/13', '/comments/14'] });
  assert.deepEqual(result.openedTargets, ['/observations/12', '/comments/14']);
  assert.deepEqual(result.failedTargets, ['/flags/13']);
  const saved = (await f.send('capture', { entries: input })).queue;
  assert.deepEqual([...queue.groups(saved.entries).keys()], ['/flags/13']);
});

test('simultaneous open requests across tabs are serialized and cannot open the same pending batch twice', async () => {
  const f = fixture();
  await f.send('capture', { entries: entries(20) });
  const targets = entries(10).map(item => new URL(item.href, 'https://www.inaturalist.org').pathname);
  const replies = await Promise.all([f.send('open', { targets }), f.send('open', { targets })]);
  assert.equal(replies.reduce((n, reply) => n + reply.openedTargets.length, 0), 10);
  assert.equal(f.created.length, 10);
});

test('batch sizes persist, invalid sizes reject, oversized batches are capped, and storage failure opens nothing', async () => {
  const f = fixture();
  await f.send('capture', { entries: entries(60) });
  for (const batchSize of [0, 51, 1.5, '10', null]) await assert.rejects(f.send('size', { batchSize }));
  await f.send('size', { batchSize: 5 });
  f.restart();
  assert.equal((await f.send('list')).queue.batchSize, 5);
  const targets = entries(20).map(item => new URL(item.href, 'https://www.inaturalist.org').pathname);
  assert.equal((await f.send('open', { targets })).openedTargets.length, 5);
  f.fail();
  await assert.rejects(f.send('open', { targets }));
  assert.equal(f.created.length, 5);
});

test('filtering does not delete hidden items; opening a shared destination consumes all messages for that page', async () => {
  const f = fixture();
  let saved = (await f.send('capture', { entries: [
    { href: '/observations/1#activity_identification_20' }, { href: '/observations/2#activity_comment_21' }
  ] })).queue;
  const visible = queue.groups(saved.entries, item => !item.href.includes('identification'));
  await f.send('open', { targets: [...visible.keys()] });
  saved = (await f.send('list')).queue;
  assert.deepEqual([...queue.groups(saved.entries).keys()], ['/observations/1']);
  await f.send('capture', { entries: [{ href: '/observations/1#activity_comment_22' }] });
  await f.send('open', { targets: ['/observations/1'] });
  assert.equal(queue.groups((await f.send('list')).queue.entries).size, 0);
});

test('clear preserves seen markers without resurrecting cleared rows and isolates accounts', async () => {
  const f = fixture();
  await f.send('capture', { entries: entries(4) });
  await f.send('size', { batchSize: 20 });
  await f.send('clear');
  f.restart();
  assert.equal(queue.groups((await f.send('capture', { entries: entries(4) })).queue.entries).size, 0);
  const second = (await f.send('capture', { entries: entries(4) }, 8)).queue;
  assert.equal(queue.groups(second.entries).size, 4);
  assert.equal(second.batchSize, 10);
  assert.equal((await f.send('list')).queue.batchSize, 20);
});

test('malformed URLs, targets, viewers and actions cannot create tabs or mutate persisted data', async () => {
  const f = fixture();
  for (const href of ['https://evil.example/observations/1', '/flags/1/edit', '/comments/1/delete', 'javascript:alert(1)', '/observations/9007199254740992']) {
    await assert.rejects(f.send('capture', { entries: [{ href }] }));
  }
  await f.send('capture', { entries: [{ href: '/comments/1' }] });
  for (const target of ['javascript:alert(1)', '//evil.example/comments/1', '/comments/1/delete', '/comments/1?token=x']) {
    await assert.rejects(f.send('open', { targets: ['/comments/1', target] }));
  }
  for (const target of ['https://evil.example/', '/observations/1/delete', '/flags/1?x=1', '/flags/9007199254740992']) {
    await assert.rejects(f.send('resolve', { entries: [{ href: '/comments/1', target }] }));
  }
  for (const viewer of [null, 0, '7', false]) await assert.rejects(f.send('list', {}, viewer));
  await assert.rejects(f.send('delete'));
  assert.equal(f.created.length, 0);
  assert.equal(queue.groups((await f.send('list')).queue.entries).size, 1);
});

test('only normalized IDs, read-only paths, fingerprints and opened markers are persisted', async () => {
  const f = fixture();
  await f.send('capture', { entries: [{ href: 'https://inaturalist.org/comments/1?token=secret#activity_comment_1', body: 'private body', name: 'User', stamp: '0123456789abcdef' }] });
  const serialized = JSON.stringify(f.data);
  assert.ok(!/secret|private|body|name|stamp/.test(serialized));
  assert.ok(serialized.includes('activity_comment_1'));
});

test('capacity never evicts pending entries and still allows saved pages to open before retrying capture', async () => {
  const f = fixture();
  let result = await f.send('capture', { entries: entries(5001) });
  assert.equal(result.full, true);
  assert.equal(queue.groups(result.queue.entries).size, 5000);
  await f.send('open', { targets: ['/observations/100'] });
  result = await f.send('capture', { entries: entries(5001) });
  assert.equal(result.full, false);
  assert.equal(queue.groups(result.queue.entries).size, 5000);
  assert.equal(result.queue.entries.at(-1).href.includes('/observations/5100#'), true);
});
