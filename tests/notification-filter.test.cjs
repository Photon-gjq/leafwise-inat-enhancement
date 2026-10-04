const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const extension = require('./extension-path.cjs');
const { classify, observationLink, activityLink } = require(path.join(extension, 'scripts/notification-filter.js'));
const own = { id: 10, userId: 7, taxonId: 100, current: true, createdAt: '2026-10-01T10:00:00Z' };
const target = { id: 20, userId: 8, taxonId: 100, current: true, createdAt: '2026-10-01T11:00:00Z' };
const check = (base = own, next = target) => classify([base, next], '20', 7);

test('only exact same taxon is confirming; sibling, descendant and ancestor IDs are retained', () => {
  assert.equal(check(), 'confirming');
  for (const taxonId of [200, 101, 99]) assert.equal(check(own, { ...target, taxonId }), 'different');
  assert.equal(check(own, { ...target, hasRemark: true }), 'remark');
});

test('mention targets accept only official comment/ID show permalinks and discard action parameters', () => {
  const base = 'https://www.inaturalist.org/home';
  const uuid = '12345678-1234-4567-89ab-123456789abc';
  assert.equal(activityLink('/comments/123?return_to=https://evil.example#activity_comment_123', base),
    'https://www.inaturalist.org/comments/123');
  assert.equal(activityLink('/identifications/' + uuid + '/', base), 'https://www.inaturalist.org/identifications/' + uuid);
  for (const link of ['/comments/0', '/comments/9007199254740992', '/comments/123/edit', '/identifications/123/agree',
    '/comments?user_id=7', '/comments/not-an-id', '/observations/123', 'https://evil.example/comments/123',
    'http://www.inaturalist.org/comments/123', 'https://www.inaturalist.org:444/comments/123',
    'https://name:password@www.inaturalist.org/comments/123']) assert.equal(activityLink(link, base), null);
});

test('compare with the latest own identification before the event, not current community taxon', () => {
  assert.equal(classify([{ ...own, taxonId: 99, current: false, id: 5 }, own, target], '20', 7), 'confirming');
  assert.equal(classify([target, { ...own, id: 30, createdAt: '2026-10-01T12:00:00Z' }], '20', 7), 'unknown');
  assert.equal(classify([{ ...own, current: false }, target, { ...own, id: 30, createdAt: '2026-10-01T12:00:00Z' }], '20', 7), 'unknown');
  assert.equal(check({ ...own, updatedAt: '2026-10-01T12:00:00Z' }), 'unknown');
  assert.equal(check({ ...own, createdAt: target.createdAt }), 'confirming');
});

test('deleted, hidden, malformed, withdrawn or ambiguous records never hide notifications', () => {
  for (const base of [{ ...own, current: false }, { ...own, hidden: true }, { ...own, taxonId: null }, { ...own, createdAt: null }]) {
    assert.equal(check(base), 'unknown');
  }
  for (const next of [{ ...target, current: false }, { ...target, hidden: true }, { ...target, createdAt: null }, { ...target, userId: null }]) {
    assert.equal(check(own, next), 'unknown');
  }
  for (const history of [null, [], [target], [own, target, target], [null, target]]) assert.equal(classify(history, '20', 7), 'unknown');
  assert.equal(classify([own, target], '20', null), 'unknown');
  assert.equal(classify([own, target], '21', 7), 'unknown');
});

test('notification references accept official numeric/UUID anchors, not comments or external URLs', () => {
  const base = 'https://www.inaturalist.org/home';
  const uuid = '12345678-1234-4567-89ab-123456789abc';
  assert.equal(observationLink('/observations/123#activity_identification_20', base).identification, '20');
  assert.equal(observationLink('/observations/123#activity_identification_' + uuid, base).identification, uuid);
  assert.equal(classify([own, { ...target, uuid }], uuid, 7), 'confirming');
  for (const href of ['/observations/123#activity_comment_20', '/observations/123#activity_identification_unknown']) {
    assert.equal(observationLink(href, base).identification, null);
  }
  for (const href of ['https://evil.example/observations/123', 'javascript:alert(1)', '/observations?user_id=7', '/observations/9007199254740992']) {
    assert.equal(observationLink(href, base), null);
  }
});
