const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const extension = require('./extension-path.cjs');

function background() {
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
    QGInatHigherTaxaService: { createService: () => ({}), createTransport: () => () => {} }
  });
  const source = fs.readFileSync(path.join(extension, 'scripts/background.js'), 'utf8')
    .replace(/^importScripts\([^\n]+\);\n\n/, '');
  vm.runInContext(source, context);
  return { created, onMessage };
}

function send(listener, observationIds, sender = {
  id: 'leafwise-test', url: 'https://www.inaturalist.org/home', frameId: 0,
  tab: { id: 5, windowId: 7 }
}) {
  return new Promise(resolve => listener({ type: 'leafwise-open-update-observations', observationIds }, sender, resolve));
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
