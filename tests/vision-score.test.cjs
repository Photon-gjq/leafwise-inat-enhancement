const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const extension = require('./extension-path.cjs');

const bridge = require(path.join(extension, 'scripts/vision-score-bridge.js'));
const data = require(path.join(extension, 'scripts/vision-score-data.js'));
const style = require(path.join(extension, 'scripts/vision-score-style.js'));

function target(extra = {}) {
  const listeners = new Map();
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  return Object.assign({
    URL,
    CustomEvent,
    location: { href: 'https://www.inaturalist.org/observations/upload', pathname: '/observations/upload' },
    addEventListener(type, listener, options = {}) {
      const entries = listeners.get(type) || [];
      entries.push({ listener, once: options.once === true }); listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(entry => entry.listener !== listener));
    },
    dispatchEvent(event) {
      for (const entry of [...(listeners.get(event.type) || [])]) {
        entry.listener.call(this, event);
        if (entry.once) this.removeEventListener(event.type, entry.listener);
      }
      return true;
    },
    listenerCount(type) { return (listeners.get(type) || []).length; }
  }, extra);
}

const settle = () => new Promise(resolve => setImmediate(resolve));
const ready = events => events.find(event => event.state === 'ready');

test('bridge normalizes only explicit combined_score values and preserves response objects', () => {
  const page = target();
  const events = [];
  page.addEventListener(bridge.EVENT_NAME, event => events.push(JSON.parse(event.detail)));
  const response = { results: [
    { taxon: { id: 11 }, combined_score: 0.8194, vision_score: 0.99 },
    { taxon: { id: 12 }, combined_score: 0, vision_score: 99 },
    { taxon_id: 13, combined_score: 72 },
    { taxon: { id: 14 }, vision_score: 1 },
    { taxon: { id: 15 }, combined_score: null }
  ] };
  assert.equal(bridge.capture(response, page), response);
  assert.equal(response.results[0].taxon.leafwiseCombinedScore, undefined);
  assert.deepEqual(events[0].scores, [
    { id: 11, combinedScore: 81.94 }, { id: 12, combinedScore: 0 }, { id: 13, combinedScore: 72 }
  ]);
  assert.equal(bridge.validScore(1), 100);
  assert.equal(bridge.validScore(1.01), 1.01);
  for (const value of [null, undefined, '0.9', NaN, Infinity, -0.1, 100.1]) assert.equal(bridge.validScore(value), null);
});

test('URL allowlist accepts only HTTPS iNaturalist v1/v2 CV scoring endpoints, including IDs', () => {
  const page = target();
  for (const url of [
    'https://api.inaturalist.org/v1/computervision/score_image',
    'https://api.inaturalist.org/v2/computervision/score_observation/123?locale=zh-CN',
    'https://api.inaturalist.org/v2/computervision/score_observation/9fd4c85a-95e3-4fc7-ae61-c46675021754',
    '/v1/computervision/score_observation/987/'
  ]) assert.equal(bridge.isVisionURL(url, page), true, url);
  for (const url of [
    'http://api.inaturalist.org/v1/computervision/score_image',
    'https://evil-inaturalist.org/v1/computervision/score_image',
    'https://api.inaturalist.org/v3/computervision/score_image',
    'https://api.inaturalist.org/v1/computervision/score_image/not-an-id',
    'https://api.inaturalist.org/v2/computervision/score_observation/not-a-uuid',
    'https://api.inaturalist.org/v1/observations/1',
    'https://example.com/v1/computervision/score_image'
  ]) assert.equal(bridge.isVisionURL(url, page), false, url);
});

test('API v2 observation field projections gain combined_score without an extra fetch', async () => {
  const uuid = '9fd4c85a-95e3-4fc7-ae61-c46675021754';
  const fields = '(frequency_score:!t,taxon:(id:!t),vision_score:!t)';
  const originalURL = `https://api.inaturalist.org/v2/computervision/score_observation/${uuid}?locale=zh-CN&fields=${encodeURIComponent(fields)}`;
  let calls = 0;
  const response = {
    clone() { return { json: async () => ({ results: [{ taxon: { id: 42 }, combined_score: 0.825 }] }) }; }
  };
  const originalPromise = Promise.resolve(response);
  const page = target({ fetch(input, options) {
    calls++;
    const url = new URL(input);
    assert.equal(url.searchParams.get('locale'), 'zh-CN');
    assert.equal(url.searchParams.get('fields'), `(combined_score:!t,${fields.slice(1)}`);
    assert.equal(options, undefined);
    return originalPromise;
  } });
  const events = [];
  page.addEventListener(bridge.EVENT_NAME, event => events.push(JSON.parse(event.detail)));
  bridge.installFetch(page);
  const pending = page.fetch(originalURL);
  assert.equal(pending, originalPromise);
  assert.equal(await pending, response);
  await settle(); await settle();
  assert.equal(calls, 1);
  assert.equal(events[0].state, 'pending');
  assert.deepEqual(ready(events).scores, [{ id: 42, combinedScore: 82.5 }]);
  assert.equal(new URL(originalURL).searchParams.get('fields'), fields);
});

test('API v2 observation JSON field projections are cloned and augmented without mutating caller input', async () => {
  const uuid = '9fd4c85a-95e3-4fc7-ae61-c46675021754';
  const url = `https://api.inaturalist.org/v2/computervision/score_observation/${uuid}`;
  const body = JSON.stringify({ locale: 'zh-CN', fields: { frequency_score: true, vision_score: true, taxon: { id: true } } });
  const init = { method: 'post', headers: { 'X-HTTP-Method-Override': 'GET' }, body };
  let calls = 0;
  const response = { clone() { return { json: async () => ({ results: [] }) }; } };
  const page = target({ fetch(input, options) {
    calls++;
    assert.equal(input, url);
    assert.notEqual(options, init);
    assert.deepEqual(JSON.parse(options.body).fields, {
      frequency_score: true, vision_score: true, taxon: { id: true }, combined_score: true
    });
    assert.equal(options.headers, init.headers);
    return Promise.resolve(response);
  } });
  bridge.installFetch(page);
  await page.fetch(url, init);
  assert.equal(calls, 1);
  assert.equal(init.body, body);
  assert.equal(JSON.parse(init.body).fields.combined_score, undefined);
});

test('API v2 score_image multipart fields gain combined_score and retain their card scope', async () => {
  const body = new FormData();
  body.append('fields', JSON.stringify({ frequency_score: true, vision_score: true, taxon: { id: true } }));
  body.append('image', 'thumbnail');
  const card = { getAttribute: name => name === 'data-id' ? 'card-7' : null };
  const page = target({
    FormData,
    document: {
      activeElement: { closest: selector => selector.includes('.card[data-id]') ? card : null },
      querySelector: () => null,
      querySelectorAll: () => []
    },
    fetch(input, options) {
      assert.equal(input, 'https://api.inaturalist.org/v2/computervision/score_image');
      assert.notEqual(options.body, body);
      assert.deepEqual(JSON.parse(options.body.get('fields')), {
        frequency_score: true, vision_score: true, taxon: { id: true }, combined_score: true
      });
      assert.equal(options.body.get('image'), 'thumbnail');
      return Promise.resolve({
        clone() { return { json: async () => ({ results: [{ taxon: { id: 7 }, combined_score: 0.713 }] }) }; }
      });
    }
  });
  const events = [];
  page.addEventListener(bridge.EVENT_NAME, event => events.push(JSON.parse(event.detail)));
  bridge.installFetch(page);
  await page.fetch('https://api.inaturalist.org/v2/computervision/score_image', { method: 'POST', body });
  await settle(); await settle();
  assert.deepEqual(JSON.parse(body.get('fields')), {
    frequency_score: true, vision_score: true, taxon: { id: true }
  });
  assert.equal(events[0].scope, 'card:card-7');
  assert.equal(events[0].state, 'pending');
  assert.equal(ready(events).scope, 'card:card-7');
  assert.deepEqual(ready(events).scores, [{ id: 7, combinedScore: 71.3 }]);
});

test('the explicit uploader request marker wins over stale focus on another card', () => {
  const makeCard = (id, marked = false) => ({
    isConnected: true,
    getAttribute: name => name === 'data-id' ? id : null,
    closest: () => null,
    querySelector: () => null,
    getClientRects: () => [1],
    marked
  });
  const focused = makeCard('old-card');
  focused.closest = selector => selector.includes('.ObsCardComponent') ? focused : null;
  const marked = makeCard('target-card', true);
  const page = target({
    location: { href: 'https://www.inaturalist.org/observations/upload', pathname: '/observations/upload' },
    document: {
      activeElement: focused,
      querySelector: selector => selector.includes('[data-leafwise-vision-request]') ? marked : null,
      querySelectorAll: () => [focused, marked]
    }
  });
  assert.equal(bridge.requestScope(page), 'card:target-card');
});

test('fetch capture works without window.inaturalistjs, sends once, and returns the original response unchanged', async () => {
  let calls = 0, clones = 0;
  const response = {
    native: true,
    clone() { clones++; return { json: async () => ({ results: [{ taxon: { id: 8 }, combined_score: 0.72 }] }) }; }
  };
  const originalPromise = Promise.resolve(response);
  const page = target({ fetch(input, options) {
    calls++;
    assert.equal(input, 'https://api.inaturalist.org/v1/computervision/score_image');
    assert.deepEqual(options, { method: 'POST', body: 'native-body' });
    return originalPromise;
  } });
  const events = [];
  page.addEventListener(bridge.EVENT_NAME, event => events.push(JSON.parse(event.detail)));
  assert.equal(page.inaturalistjs, undefined);
  assert.equal(bridge.install(page), true);
  const pending = page.fetch('https://api.inaturalist.org/v1/computervision/score_image', { method: 'POST', body: 'native-body' });
  assert.equal(pending, originalPromise);
  assert.equal(await pending, response);
  await settle(); await settle();
  assert.equal(calls, 1);
  assert.equal(clones, 1);
  assert.equal(events[0].state, 'pending');
  assert.deepEqual(ready(events).scores, [{ id: 8, combinedScore: 72 }]);
  assert.deepEqual(response, { native: true, clone: response.clone });
});

test('fetch ignores non-CV requests and repeated installation never wraps twice', async () => {
  let calls = 0, clones = 0;
  const response = { clone() { clones++; return { json: async () => ({ results: [] }) }; } };
  const page = target({ fetch() { calls++; return Promise.resolve(response); } });
  assert.equal(bridge.installFetch(page), true);
  const installed = page.fetch;
  assert.equal(bridge.installFetch(page), true);
  assert.equal(page.fetch, installed);
  await page.fetch('https://api.inaturalist.org/v1/observations/1');
  await page.fetch('https://example.com/v1/computervision/score_image');
  await settle();
  assert.equal(calls, 2);
  assert.equal(clones, 0);
});

test('XHR reads JSON CV responses without altering the request, response, or return value', () => {
  let opens = 0, sends = 0;
  const payload = { data: { results: [{ taxon: { id: 44 }, combined_score: 0.9, vision_score: 1 }] } };
  class FakeXHR {
    constructor() { this.listeners = new Map(); this.responseType = 'json'; this.response = payload; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    open(method, url, async) { opens++; this.nativeOpen = [method, url, async]; return 'opened'; }
    send(body) { sends++; this.nativeBody = body; this.listeners.get('loadend')?.(); return 'sent'; }
  }
  const page = target({ XMLHttpRequest: FakeXHR });
  const events = [];
  page.addEventListener(bridge.EVENT_NAME, event => events.push(JSON.parse(event.detail)));
  assert.equal(bridge.installXHR(page), true);
  const installedOpen = FakeXHR.prototype.open, installedSend = FakeXHR.prototype.send;
  assert.equal(bridge.installXHR(page), true);
  assert.equal(FakeXHR.prototype.open, installedOpen);
  assert.equal(FakeXHR.prototype.send, installedSend);
  const xhr = new FakeXHR();
  assert.equal(xhr.open('POST', 'https://api.inaturalist.org/v2/computervision/score_observation/77', true), 'opened');
  assert.equal(xhr.send('native-body'), 'sent');
  assert.deepEqual(xhr.nativeOpen, ['POST', 'https://api.inaturalist.org/v2/computervision/score_observation/77', true]);
  assert.equal(xhr.nativeBody, 'native-body');
  assert.equal(xhr.response, payload);
  assert.equal(opens, 1); assert.equal(sends, 1);
  assert.equal(events[0].state, 'pending');
  assert.deepEqual(ready(events).scores, [{ id: 44, combinedScore: 90 }]);
});

test('XHR augments API v2 observation UUID field projections and still sends once', () => {
  const uuid = '9fd4c85a-95e3-4fc7-ae61-c46675021754';
  const fields = '(frequency_score:!t,vision_score:!t)';
  let opens = 0, sends = 0;
  class FakeXHR {
    constructor() { this.listeners = new Map(); this.responseType = 'json'; this.response = { results: [] }; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    open(method, url) { opens++; this.nativeOpen = [method, url]; }
    send(body) { sends++; this.nativeBody = body; this.listeners.get('loadend')?.(); }
  }
  const page = target({ XMLHttpRequest: FakeXHR });
  bridge.installXHR(page);
  const xhr = new FakeXHR();
  xhr.open('POST', `https://api.inaturalist.org/v2/computervision/score_observation/${uuid}?fields=${encodeURIComponent(fields)}`);
  xhr.send(JSON.stringify({ fields: { frequency_score: true, vision_score: true } }));
  assert.equal(opens, 1); assert.equal(sends, 1);
  assert.equal(new URL(xhr.nativeOpen[1]).searchParams.get('fields'), `(combined_score:!t,${fields.slice(1)}`);
  assert.deepEqual(JSON.parse(xhr.nativeBody).fields, {
    frequency_score: true, vision_score: true, combined_score: true
  });
});

test('XHR ignores non-JSON and non-CV responses and never converts vision_score', () => {
  let responseTextReads = 0;
  class FakeXHR {
    constructor(contentType, responseType = '') {
      this.contentType = contentType; this.responseType = responseType; this.listeners = new Map();
      this.response = { results: [{ taxon: { id: 9 }, vision_score: 0.99 }] };
      Object.defineProperty(this, 'responseText', { get() { responseTextReads++; return JSON.stringify(this.response); } });
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    getResponseHeader() { return this.contentType; }
    open() {}
    send() { this.listeners.get('loadend')?.(); }
  }
  const page = target({ XMLHttpRequest: FakeXHR });
  const events = [];
  page.addEventListener(bridge.EVENT_NAME, event => {
    const payload = JSON.parse(event.detail);
    if (payload.state === 'ready') events.push(payload);
  });
  bridge.installXHR(page);
  const text = new FakeXHR('text/plain');
  text.open('GET', 'https://api.inaturalist.org/v1/computervision/score_image'); text.send();
  const other = new FakeXHR('application/json');
  other.open('GET', 'https://api.inaturalist.org/v1/observations/9'); other.send();
  const visualOnly = new FakeXHR('application/json', 'json');
  visualOnly.open('GET', 'https://api.inaturalist.org/v1/computervision/score_image'); visualOnly.send();
  assert.equal(responseTextReads, 0);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].scores, []);
});

test('legacy compatibility wrapper forwards one call and returns the original promise', async () => {
  let calls = 0;
  const page = target();
  const params = { image: { name: 'native thumbnail' }, lat: 22.3, lng: 114.2, observed_on: '2026-09-17' };
  const response = { results: [{ taxon: { id: 8 }, combined_score: 0.72, vision_score: 0.99 }] };
  const originalPromise = Promise.resolve(response);
  const owner = { score_image(actual) { calls++; assert.equal(actual, params); return originalPromise; } };
  assert.equal(bridge.wrap(owner, 'score_image', page), true);
  assert.equal(bridge.wrap(owner, 'score_image', page), true);
  const pending = owner.score_image(params);
  assert.equal(pending, originalPromise);
  assert.equal(await pending, response);
  await settle();
  assert.equal(calls, 1);
  assert.equal(response.results[0].taxon.leafwiseCombinedScore, undefined);
});

test('response store normalizes raw combined_score and matches taxon IDs, never array order or vision_score', () => {
  let now = 1000;
  const store = data.createStore(() => now);
  store.add({ capturedAt: now, scores: [{ id: 2, combinedScore: 20 }, { id: 1, combinedScore: 10 }] });
  now += 10;
  store.add({ capturedAt: now, scores: [{ id: 1, combinedScore: 91 }, { id: 3, combinedScore: 83 }] });
  assert.equal(store.value({ id: 1 }, 1, [1, 3]), 91);
  assert.equal(store.value({ id: 2, combined_score: 0.44 }, 2, [1, 2]), 44);
  assert.equal(store.value({ id: 99 }, 99, [99]), null);
  assert.equal(store.value({ id: 88, combinedScore: 100, visionScore: 100, vision_score: 1 }, 88, [88]), null);
});

test('scoped response scores cannot leak across uploader cards and persist until a new request begins', () => {
  let now = 1000;
  const store = data.createStore(() => now);
  store.add({ scope: 'card:a', requestId: 1, state: 'pending', capturedAt: now });
  assert.equal(store.state('card:a'), 'pending');
  store.add({ scope: 'card:a', requestId: 1, state: 'ready', capturedAt: now,
    scores: [{ id: 7, combinedScore: 71 }] });
  store.add({ scope: 'card:b', requestId: 2, state: 'ready', capturedAt: now,
    scores: [{ id: 7, combinedScore: 12 }] });
  now += 60 * 60 * 1000;
  assert.equal(store.value({ id: 7 }, 7, [7], 'card:a'), 71);
  assert.equal(store.value({ id: 7 }, 7, [7], 'card:b'), 12);
  assert.equal(store.value({ id: 7 }, 7, [7], 'card:missing'), null);
  store.add({ scope: 'card:a', requestId: 3, state: 'pending', capturedAt: now });
  assert.equal(store.value({ id: 7 }, 7, [7], 'card:a'), null);
  assert.equal(store.state('card:a'), 'pending');
  assert.equal(store.add({ scope: 'card:a', requestId: 1, state: 'ready', capturedAt: now,
    scores: [{ id: 7, combinedScore: 99 }] }), false);
  assert.equal(store.add({ scope: 'card:a', requestId: 3, state: 'ready', capturedAt: now, scores: [] }), true);
  assert.equal(store.state('card:a'), 'ready');
  assert.equal(store.value({ id: 7 }, 7, [7], 'card:a'), null);
});

test('score style uses a colored number without a chip, row accent, or percent sign', () => {
  const properties = new Map();
  const removedClasses = [];
  const row = { classList: { add() {}, remove: name => removedClasses.push(name) }, style: {
    setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name)
  } };
  const badge = { style: {}, setAttribute() {}, textContent: '', parentElement: null };
  const result = {
    querySelector: selector => selector === '.leafwise-ai-score' ? badge : null,
    querySelectorAll: () => [], append: node => { node.parentElement = result; }
  };
  assert.equal(style.decorate(result, row, 81.94), badge);
  assert.equal(badge.textContent, '81.9');
  assert.equal(badge.textContent.includes('%'), false);
  assert.match(badge.style.cssText, /background:transparent!important/);
  assert.match(badge.style.cssText, /border:0!important/);
  assert.match(badge.style.cssText, /border-radius:0!important/);
  assert.match(badge.style.cssText, /align-self:center!important/);
  assert.match(badge.style.cssText, new RegExp(`color:${style.color(81.94).replace(/[()]/g, '\\$&')}!important`));
  assert.equal(properties.has('--leafwise-score-accent'), false);
  assert.ok(removedClasses.includes('leafwise-ai-score-row'));
});
