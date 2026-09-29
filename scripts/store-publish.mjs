import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { root, version } from './build.mjs';

const CHROME_API = 'https://chromewebstore.googleapis.com';
const EDGE_API = 'https://api.addons.microsoftedge.microsoft.com';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function required(value, label, pattern) {
  if (!value || (pattern && !pattern.test(value))) throw new Error(`Missing or invalid ${label}`);
  return value;
}

async function jsonRequest(fetchImpl, url, init, label) {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return { response, data: await response.json() };
}

function revisionHasVersion(revision, targetVersion) {
  return revision?.distributionChannels?.some(channel => channel.crxVersion === targetVersion) === true;
}

export async function publishChrome({ env, packageBytes, fetchImpl = fetch, sleep = delay, targetVersion = version }) {
  const publisher = required(env.CWS_PUBLISHER_ID, 'CWS_PUBLISHER_ID', /^[\w-]+$/);
  const item = required(env.CWS_EXTENSION_ID, 'CWS_EXTENSION_ID', /^[a-p]{32}$/);
  const clientId = required(env.CWS_CLIENT_ID, 'CWS_CLIENT_ID');
  const clientSecret = required(env.CWS_CLIENT_SECRET, 'CWS_CLIENT_SECRET');
  const refreshToken = required(env.CWS_REFRESH_TOKEN, 'CWS_REFRESH_TOKEN');
  const tokenResult = await jsonRequest(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  }, 'Chrome token request');
  const token = required(tokenResult.data.access_token, 'Chrome access token');
  const name = `publishers/${publisher}/items/${item}`;
  const headers = { Authorization: `Bearer ${token}` };
  const fetchStatus = async () => (await jsonRequest(fetchImpl, `${CHROME_API}/v2/${name}:fetchStatus`, { headers }, 'Chrome status')).data;
  const before = await fetchStatus();
  if (revisionHasVersion(before.publishedItemRevisionStatus, targetVersion) ||
      revisionHasVersion(before.submittedItemRevisionStatus, targetVersion)) {
    return { skipped: true, message: `Chrome ${targetVersion} is already published or submitted` };
  }
  const upload = (await jsonRequest(fetchImpl, `${CHROME_API}/upload/v2/${name}:upload`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: packageBytes
  }, 'Chrome upload')).data;
  let uploadState = upload.uploadState;
  if (upload.crxVersion && upload.crxVersion !== targetVersion) throw new Error('Chrome upload version mismatch');
  for (let attempt = 0; uploadState === 'IN_PROGRESS' && attempt < 30; attempt++) {
    await sleep(10_000);
    uploadState = (await fetchStatus()).lastAsyncUploadState;
  }
  if (uploadState !== 'SUCCEEDED') throw new Error(`Chrome upload did not succeed: ${uploadState || 'unknown'}`);
  const submission = (await jsonRequest(fetchImpl, `${CHROME_API}/v2/${name}:publish`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' })
  }, 'Chrome publish')).data;
  return { skipped: false, message: `Chrome ${targetVersion} submitted for review (${submission.state || 'state pending'})` };
}

function operationURL(location, expectedPath) {
  const value = required(location, 'Edge operation Location');
  // Edge documents the Location header as an operation ID, but some responses
  // return the complete operation URL. Accept either form without trusting a
  // URL outside the expected product endpoint.
  const url = /^[A-Za-z0-9-]+$/.test(value)
    ? new URL(`${expectedPath}/operations/${value}`, EDGE_API)
    : new URL(value, EDGE_API);
  if (url.origin !== EDGE_API || !url.pathname.startsWith(`${expectedPath}/operations/`) || url.search || url.hash) {
    throw new Error('Invalid Edge operation URL');
  }
  return url.href;
}

async function waitEdgeOperation(fetchImpl, url, headers, label, sleep) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = (await jsonRequest(fetchImpl, url, { headers }, label)).data;
    if (result.status === 'Succeeded') return result;
    if (result.status !== 'InProgress') throw new Error(`${label} failed: ${result.errorCode || result.status || 'unknown'}`);
    await sleep(10_000);
  }
  throw new Error(`${label} timed out`);
}

export async function publishEdge({ env, packageBytes, fetchImpl = fetch, sleep = delay, targetVersion = version }) {
  const product = required(env.EDGE_PRODUCT_ID, 'EDGE_PRODUCT_ID', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  const clientId = required(env.EDGE_CLIENT_ID, 'EDGE_CLIENT_ID');
  const apiKey = required(env.EDGE_API_KEY, 'EDGE_API_KEY');
  const headers = { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId };
  const basePath = `/v1/products/${product}/submissions`;
  const uploadPath = `${basePath}/draft/package`;
  const upload = await fetchImpl(`${EDGE_API}${uploadPath}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: packageBytes
  });
  if (upload.status !== 202) throw new Error(`Edge upload: HTTP ${upload.status}`);
  await waitEdgeOperation(fetchImpl, operationURL(upload.headers.get('Location'), uploadPath), headers, 'Edge upload', sleep);
  const submission = await fetchImpl(`${EDGE_API}${basePath}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: `Leafwise ${targetVersion} update from the matching GitHub release.` })
  });
  if (submission.status !== 202) throw new Error(`Edge publish: HTTP ${submission.status}`);
  await waitEdgeOperation(fetchImpl, operationURL(submission.headers.get('Location'), basePath), headers, 'Edge publish', sleep);
  return { message: `Edge ${targetVersion} submitted for certification` };
}

async function main() {
  const target = process.argv[2];
  if (target !== 'chrome' && target !== 'edge') throw new Error('Usage: node scripts/store-publish.mjs chrome|edge');
  const archive = path.join(root, 'dist', `Leafwise-${version}-${target}-store.zip`);
  const packageBytes = fs.readFileSync(archive);
  const manifest = JSON.parse(strFromU8(unzipSync(packageBytes)['manifest.json']));
  if (manifest.version !== version) throw new Error('Store package version mismatch');
  const result = target === 'chrome'
    ? await publishChrome({ env: process.env, packageBytes })
    : await publishEdge({ env: process.env, packageBytes });
  console.log(result.message);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
