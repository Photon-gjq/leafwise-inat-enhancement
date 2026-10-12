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

test('Chrome HTTP errors retain validation details without echoing credentials or arbitrary response fields', async () => {
  const { publishChrome } = await import('../scripts/store-publish.mjs');
  const env = { ...chromeEnv, CWS_CLIENT_SECRET: 'private/secret+key', CWS_REFRESH_TOKEN: 'private-refresh' };
  const fetchImpl = async url => {
    if (url.includes('oauth2.googleapis.com')) return reply({ access_token: 'private-access' });
    if (url.endsWith(':fetchStatus')) return reply({});
    if (url.endsWith(':upload')) return reply({ crxVersion: '1.2.4', uploadState: 'SUCCEEDED' });
    return reply({ error: {
      code: 400, status: 'FAILED_PRECONDITION',
      message: `Verify publisher. ${env.CWS_CLIENT_SECRET} ${encodeURIComponent(env.CWS_CLIENT_SECRET)} private-refresh private-access Bearer unknown-token\n::error::injected`,
      details: [{ reason: 'PUBLISHER_VALIDATION', fieldViolations: [{ field: 'publisher', description: 'Complete verification.' }],
        metadata: { refresh_token: 'unexpected-private-value' } }],
      access_token: 'unexpected-private-value'
    }, arbitrary: 'private-response' }, 400);
  };
  await assert.rejects(() => publishChrome({ env, packageBytes: new Uint8Array([1]), fetchImpl, targetVersion: '1.2.4' }), error => {
    assert.match(error.message, /Chrome publish: HTTP 400/);
    assert.match(error.message, /FAILED_PRECONDITION/);
    assert.match(error.message, /PUBLISHER_VALIDATION/);
    assert.match(error.message, /Complete verification/);
    assert.match(error.message, /REDACTED/);
    for (const value of [env.CWS_CLIENT_SECRET, encodeURIComponent(env.CWS_CLIENT_SECRET), 'private-refresh', 'private-access',
      'unknown-token', 'unexpected-private-value', 'private-response', '\n']) assert.equal(error.message.includes(value), false);
    return true;
  });
});

test('Chrome OAuth errors are redacted before an access token exists', async () => {
  const { publishChrome } = await import('../scripts/store-publish.mjs');
  await assert.rejects(() => publishChrome({ env: chromeEnv, packageBytes: new Uint8Array([1]),
    fetchImpl: async () => reply({ error: 'invalid_grant', error_description: 'Rejected refresh client_secret="not-in-env"' }, 400)
  }), error => {
    assert.match(error.message, /Chrome token request: HTTP 400/);
    assert.match(error.message, /invalid_grant/);
    assert.equal(error.message.includes('refresh'), false);
    assert.equal(error.message.includes('not-in-env'), false);
    return true;
  });
});

test('HTTP errors survive non-JSON, unavailable and oversized response bodies', async () => {
  const { publishEdge } = await import('../scripts/store-publish.mjs');
  for (const response of [new Response('<html>private HTML</html>', { status: 503 }),
    { status: 503, json: async () => { throw new Error('private parser failure'); } }]) {
    await assert.rejects(() => publishEdge({ env: edgeEnv, packageBytes: new Uint8Array([1]), fetchImpl: async () => response }),
      error => error.message === 'Edge upload: HTTP 503');
  }
  await assert.rejects(() => publishEdge({ env: edgeEnv, packageBytes: new Uint8Array([1]),
    fetchImpl: async () => reply({ message: 'x'.repeat(10000), details: Array.from({ length: 100 }, () => ({ reason: 'y'.repeat(10000) })) }, 400)
  }), error => error.message.length < 2100);
});

test('Edge publish and operation failures include safe server diagnostics', async () => {
  const { publishEdge } = await import('../scripts/store-publish.mjs');
  for (const failOperation of [true, false]) {
    const fetchImpl = async url => {
      if (url.endsWith('/draft/package')) return reply({}, 202, { Location: 'upload-id' });
      if (url.endsWith('/operations/upload-id')) return reply(failOperation
        ? { status: 'Failed', errorCode: 'PACKAGE_INVALID', message: 'Invalid package ApiKey unexpected-key', api_key: 'hidden-value' }
        : { status: 'Succeeded' });
      return reply({ error: { code: 'VALIDATION_ERROR', message: 'Complete listing. Authorization: Bearer unexpected-token' } }, 400);
    };
    await assert.rejects(() => publishEdge({ env: edgeEnv, packageBytes: new Uint8Array([1]), fetchImpl }), error => {
      assert.match(error.message, failOperation ? /PACKAGE_INVALID/ : /Edge publish: HTTP 400.*VALIDATION_ERROR/);
      for (const value of ['unexpected-key', 'hidden-value', 'unexpected-token']) assert.equal(error.message.includes(value), false);
      return true;
    });
  }
});
