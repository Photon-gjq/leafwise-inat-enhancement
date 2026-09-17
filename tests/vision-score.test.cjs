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
    '/v1/computervision/score_observation/987/'
  ]) assert.equal(bridge.isVisionURL(url, page), true, url);
  for (const url of [
    'http://api.inaturalist.org/v1/computervision/score_image',
    'https://evil-inaturalist.org/v1/computervision/score_image',
    'https://api.inaturalist.org/v3/computervision/score_image',
    'https://api.inaturalist.org/v1/computervision/score_image/not-an-id',
    'https://api.inaturalist.org/v1/observations/1',
    'https://example.com/v1/computervision/score_image'
  ]) assert.equal(bridge.isVisionURL(url, page), false, url);
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
  assert.deepEqual(events[0].scores, [{ id: 8, combinedScore: 72 }]);
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
  assert.deepEqual(events[0].scores, [{ id: 44, combinedScore: 90 }]);
});

test('XHR ignores non-JSON, non-CV, and vision_score-only payloads', () => {
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
  let events = 0;
  page.addEventListener(bridge.EVENT_NAME, () => events++);
  bridge.installXHR(page);
  const text = new FakeXHR('text/plain');
  text.open('GET', 'https://api.inaturalist.org/v1/computervision/score_image'); text.send();
  const other = new FakeXHR('application/json');
  other.open('GET', 'https://api.inaturalist.org/v1/observations/9'); other.send();
  const visualOnly = new FakeXHR('application/json', 'json');
  visualOnly.open('GET', 'https://api.inaturalist.org/v1/computervision/score_image'); visualOnly.send();
  assert.equal(responseTextReads, 0);
  assert.equal(events, 0);
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

test('compact score style uses one decimal without a percent sign', () => {
  const properties = new Map();
  const row = { classList: { add() {}, remove() {} }, style: {
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
  assert.match(properties.get('--leafwise-score-accent'), /^rgb\(/);
});
