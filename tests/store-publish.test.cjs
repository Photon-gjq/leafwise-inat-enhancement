const test = require('node:test');
const assert = require('node:assert/strict');

const chromeEnv = {
  CWS_PUBLISHER_ID: 'publisher-1', CWS_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop',
  CWS_CLIENT_ID: 'client', CWS_CLIENT_SECRET: 'secret', CWS_REFRESH_TOKEN: 'refresh'
};
const edgeEnv = {
  EDGE_PRODUCT_ID: 'd34f98f5-f9b7-42b1-bebb-98707202b21d',
  EDGE_CLIENT_ID: 'client', EDGE_API_KEY: 'secret'
};
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test('Chrome store submission uses v2, checks the existing version, and never prints credentials', async () => {
  const { publishChrome } = await import('../scripts/store-publish.mjs');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('oauth2.googleapis.com')) return reply({ access_token: 'access' });
    if (url.endsWith(':fetchStatus')) return reply({});
    if (url.endsWith(':upload')) return reply({ crxVersion: '0.12.7', uploadState: 'SUCCEEDED' });
    if (url.endsWith(':publish')) return reply({ state: 'PENDING_REVIEW' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const result = await publishChrome({ env: chromeEnv, packageBytes: new Uint8Array([1]), fetchImpl, targetVersion: '0.12.7' });
  assert.match(result.message, /submitted for review/);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname.split(':').at(-1)), ['/token', 'fetchStatus', 'upload', 'publish']);
  assert.equal(calls[2].init.headers.Authorization, 'Bearer access');
  assert.equal(calls[3].init.body, '{"publishType":"DEFAULT_PUBLISH"}');
});

test('Chrome skips a version that has already been submitted', async () => {
  const { publishChrome } = await import('../scripts/store-publish.mjs');
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    if (url.includes('oauth2.googleapis.com')) return reply({ access_token: 'access' });
    return reply({ submittedItemRevisionStatus: { distributionChannels: [{ crxVersion: '0.12.7' }] } });
  };
  const result = await publishChrome({ env: chromeEnv, packageBytes: new Uint8Array([1]), fetchImpl, targetVersion: '0.12.7' });
  assert.equal(result.skipped, true);
  assert.equal(calls, 2);
});

test('Edge update waits for upload success before submitting the draft', async () => {
  const { publishEdge } = await import('../scripts/store-publish.mjs');
  const calls = [];
  const base = 'https://api.addons.microsoftedge.microsoft.com/v1/products/d34f98f5-f9b7-42b1-bebb-98707202b21d/submissions';
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === `${base}/draft/package`) return reply({}, 202, { Location: `${base}/draft/package/operations/upload-id` });
    if (url.endsWith('/operations/upload-id')) return reply({ status: 'Succeeded' });
    if (url === base) return reply({}, 202, { Location: `${base}/operations/publish-id` });
    if (url.endsWith('/operations/publish-id')) return reply({ status: 'Succeeded' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const result = await publishEdge({ env: edgeEnv, packageBytes: new Uint8Array([1]), fetchImpl, targetVersion: '0.12.7' });
  assert.match(result.message, /submitted for certification/);
  assert.deepEqual(calls.map(call => call.init.method || 'GET'), ['POST', 'GET', 'POST', 'GET']);
  assert.equal(calls[0].init.headers.Authorization, 'ApiKey secret');
  assert.equal(JSON.parse(calls[2].init.body).notes.includes('0.12.7'), true);
});

test('Edge accepts documented operation IDs in Location headers', async () => {
  const { publishEdge } = await import('../scripts/store-publish.mjs');
  const base = 'https://api.addons.microsoftedge.microsoft.com/v1/products/d34f98f5-f9b7-42b1-bebb-98707202b21d/submissions';
  const fetchImpl = async url => {
    if (url === `${base}/draft/package`) return reply({}, 202, { Location: 'upload-id' });
    if (url === `${base}/draft/package/operations/upload-id`) return reply({ status: 'Succeeded' });
    if (url === base) return reply({}, 202, { Location: 'publish-id' });
    if (url === `${base}/operations/publish-id`) return reply({ status: 'Succeeded' });
    throw new Error(`Unexpected URL ${url}`);
  };
  const result = await publishEdge({ env: edgeEnv, packageBytes: new Uint8Array([1]), fetchImpl, targetVersion: '1.0.0' });
  assert.match(result.message, /Edge 1\.0\.0 submitted/);
});

test('Edge rejects an operation URL outside the official API origin', async () => {
  const { publishEdge } = await import('../scripts/store-publish.mjs');
  await assert.rejects(() => publishEdge({
    env: edgeEnv, packageBytes: new Uint8Array([1]),
    fetchImpl: async () => reply({}, 202, { Location: 'https://example.com/operations/stolen' })
  }), /Invalid Edge operation URL/);
});
