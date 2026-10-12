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

// Only emit diagnostic fields, never the full response, request or credentials.
// Responses may echo credentials inside messages as well as dedicated fields.
function errorDetail(data, secrets) {
  const redact = value => {
    let text = String(value)
      .replace(/\b(?:Bearer|ApiKey)\s+[^\s,;"'<>]+/gi, '[REDACTED authorization]')
      .replace(/\b(?:client_secret|access_token|refresh_token|api_key|authorization|cookie|password)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&<>]+)/gi, '[REDACTED credential]');
    const values = secrets.filter(value => typeof value === 'string' && value.length)
      .flatMap(value => [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)])
      .sort((a, b) => b.length - a.length);
    for (const secret of values) text = text.split(secret).join('[REDACTED]');
    return text
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ')
      .slice(0, 512);
  };
  const fields = new Set(['code', 'status', 'message', 'errorCode', 'error_description',
    'reason', 'domain', 'field', 'description', 'type', 'subject']);
  const groups = new Set(['error', 'details', 'errors', 'violations', 'fieldViolations']);
  const select = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return undefined;
    if (Array.isArray(value)) {
      const items = value.slice(0, 10).map(item => select(item, depth + 1)).filter(Boolean);
      return items.length ? items : undefined;
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if ((fields.has(key) || key === 'error') && (typeof item === 'string' || typeof item === 'number')) {
        result[key] = redact(item);
      } else if (groups.has(key)) {
        const nested = select(item, depth + 1);
        if (nested) result[key] = nested;
      }
    }
    return Object.keys(result).length ? result : undefined;
  };
  const detail = select(data);
  return detail ? `; API error: ${JSON.stringify(detail).slice(0, 2048)}` : '';
}

async function httpError(response, label, secrets) {
  let data;
  try { data = await response.json(); } catch { /* Keep the HTTP failure if no JSON is available. */ }
  return new Error(`${label}: HTTP ${response.status}${errorDetail(data, secrets)}`);
}

async function jsonRequest(fetchImpl, url, init, label, secrets) {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw await httpError(response, label, secrets);
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
  const secrets = [clientId, clientSecret, refreshToken];
  const tokenResult = await jsonRequest(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  }, 'Chrome token request', secrets);
  const token = required(tokenResult.data.access_token, 'Chrome access token');
  secrets.push(token);
  const name = `publishers/${publisher}/items/${item}`;
  const headers = { Authorization: `Bearer ${token}` };
  const fetchStatus = async () => (await jsonRequest(fetchImpl, `${CHROME_API}/v2/${name}:fetchStatus`, { headers }, 'Chrome status', secrets)).data;
  const before = await fetchStatus();
  if (revisionHasVersion(before.publishedItemRevisionStatus, targetVersion) ||
      revisionHasVersion(before.submittedItemRevisionStatus, targetVersion)) {
    return { skipped: true, message: `Chrome ${targetVersion} is already published or submitted` };
  }
  const upload = (await jsonRequest(fetchImpl, `${CHROME_API}/upload/v2/${name}:upload`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: packageBytes
  }, 'Chrome upload', secrets)).data;
  let uploadState = upload.uploadState;
  if (upload.crxVersion && upload.crxVersion !== targetVersion) throw new Error('Chrome upload version mismatch');
  for (let attempt = 0; uploadState === 'IN_PROGRESS' && attempt < 30; attempt++) {
    await sleep(10_000);
    uploadState = (await fetchStatus()).lastAsyncUploadState;
  }
  if (uploadState !== 'SUCCEEDED') throw new Error(`Chrome upload did not succeed${errorDetail({ status: uploadState || 'unknown', errors: upload.errors }, secrets)}`);
  const submission = (await jsonRequest(fetchImpl, `${CHROME_API}/v2/${name}:publish`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' })
  }, 'Chrome publish', secrets)).data;
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

async function waitEdgeOperation(fetchImpl, url, headers, label, sleep, secrets) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = (await jsonRequest(fetchImpl, url, { headers }, label, secrets)).data;
    if (result.status === 'Succeeded') return result;
    if (result.status !== 'InProgress') throw new Error(`${label} failed${errorDetail(result, secrets)}`);
    await sleep(10_000);
  }
  throw new Error(`${label} timed out`);
}

export async function publishEdge({ env, packageBytes, fetchImpl = fetch, sleep = delay, targetVersion = version }) {
  const product = required(env.EDGE_PRODUCT_ID, 'EDGE_PRODUCT_ID', /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  const clientId = required(env.EDGE_CLIENT_ID, 'EDGE_CLIENT_ID');
  const apiKey = required(env.EDGE_API_KEY, 'EDGE_API_KEY');
  const secrets = [clientId, apiKey];
  const headers = { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId };
  const basePath = `/v1/products/${product}/submissions`;
  const uploadPath = `${basePath}/draft/package`;
  const upload = await fetchImpl(`${EDGE_API}${uploadPath}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: packageBytes
  });
  if (upload.status !== 202) throw await httpError(upload, 'Edge upload', secrets);
  await waitEdgeOperation(fetchImpl, operationURL(upload.headers.get('Location'), uploadPath), headers, 'Edge upload', sleep, secrets);
  const submission = await fetchImpl(`${EDGE_API}${basePath}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: `Leafwise ${targetVersion} update from the matching GitHub release.` })
  });
  if (submission.status !== 202) throw await httpError(submission, 'Edge publish', secrets);
  await waitEdgeOperation(fetchImpl, operationURL(submission.headers.get('Location'), basePath), headers, 'Edge publish', sleep, secrets);
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
