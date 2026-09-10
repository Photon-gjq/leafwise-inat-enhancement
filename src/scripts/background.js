const higherTaxaService = QGInatHigherTaxaService.createService({
  core: QGInatHigherTaxa,
  fetchJSON: QGInatHigherTaxaService.createTransport(),
  storage: chrome.storage.session
});
const LIBRARY_KEY = "leafwiseExploreLibraryV1";
let libraryTask = Promise.resolve();
function exploreLibrary(message) {
  const task = libraryTask.then(async () => {
    const current = (await chrome.storage.local.get(LIBRARY_KEY))[LIBRARY_KEY] || {queries:[],groups:[]};
    if (message.action === "list") return current;
    const next = LeafwiseExploreTools.editLibrary(current, message.action, message.entry, QGInatHigherTaxa, crypto.randomUUID());
    await chrome.storage.local.set({[LIBRARY_KEY]:next});
    return next;
  });
  libraryTask = task.catch(() => {});
  return task;
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

const API_ROOT = "https://api.inaturalist.org/v1";
const CACHE_TTL = 5 * 60 * 1000;

async function cached(key, load) {
  try {
    const stored = (await chrome.storage.local.get(key))[key];
    if (stored && Date.now() - stored.savedAt < CACHE_TTL) return stored.value;
  } catch {}
  const value = await load();
  try { await chrome.storage.local.set({ [key]: { value, savedAt: Date.now() } }); } catch {}
  return value;
}

async function apiJSON(path, params = {}) {
  const url = new URL(`${API_ROOT}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`iNaturalist API ${response.status}`);
  return response.json();
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function observationTaxon(observationId) {
  const id = positiveInteger(observationId);
  if (!id) throw new Error("Invalid observation id");
  return cached(`qgObservationTaxon:${id}`, async () => {
    const data = await apiJSON(`/observations/${id}`);
    const taxonId = positiveInteger(data.results?.[0]?.taxon?.id);
    if (!taxonId) throw new Error("Observation has no taxon");
    return taxonId;
  });
}

async function taxonObservationCount(userId, taxonId) {
  const user = positiveInteger(userId);
  const taxon = positiveInteger(taxonId);
  if (!user || !taxon) throw new Error("Invalid user or taxon id");
  return cached(`qgTaxonCount:${user}:${taxon}`, async () => {
    const data = await apiJSON("/observations", {
      user_id: user,
      taxon_id: taxon,
      verifiable: "any",
      per_page: 1
    });
    const count = Number(data.total_results);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid observation count");
    return count;
  });
}

function scopedCountRequest(endpoint, rawParams) {
  if (endpoint !== "observations" && endpoint !== "species_counts") throw new Error("Invalid count endpoint");
  const user = positiveInteger(rawParams?.user_id);
  const taxon = positiveInteger(rawParams?.taxon_id);
  if (!user || !taxon) throw new Error("Invalid scoped count parameters");
  const params = { user_id: user, taxon_id: taxon };
  const verifiable = String(rawParams?.verifiable || "");
  if (["any", "true", "false"].includes(verifiable)) params.verifiable = verifiable;
  const place = String(rawParams?.place_id || "");
  if (/^\d+(?:,\d+)*$/.test(place) && place.split(",").every(id => positiveInteger(id))) params.place_id = place;
  const rank = String(rawParams?.rank || "");
  if (/^[a-z_]+(?:,[a-z_]+)*$/i.test(rank)) params.rank = rank;
  return { endpoint, params };
}

function scopedCountCacheKey(endpoint, params) {
  const query = new URLSearchParams();
  Object.keys(params).sort().forEach(key => query.set(key, String(params[key])));
  return `qgScopedCount:${endpoint}:${query}`;
}

async function scopedObservationCount(endpoint, rawParams) {
  const request = scopedCountRequest(endpoint, rawParams);
  const key = scopedCountCacheKey(request.endpoint, request.params);
  return cached(key, async () => {
    const path = request.endpoint === "species_counts" ? "/observations/species_counts" : "/observations";
    const data = await apiJSON(path, { ...request.params, per_page: 1 });
    const count = Number(data.total_results);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid scoped count");
    return count;
  });
}

async function cachedTaxonObservationCounts(userId, taxonIds) {
  const user = positiveInteger(userId);
  if (!user || !Array.isArray(taxonIds)) throw new Error("Invalid user or taxon ids");
  const taxa = [...new Set(taxonIds.map(positiveInteger).filter(Boolean))];
  const keys = taxa.map(taxon => `qgTaxonCount:${user}:${taxon}`);
  let stored = {};
  try { stored = await chrome.storage.local.get(keys); } catch {}
  const now = Date.now();
  const counts = {};
  taxa.forEach((taxon, index) => {
    const entry = stored[keys[index]];
    const count = Number(entry?.value);
    if (entry && now - entry.savedAt < CACHE_TTL && Number.isSafeInteger(count) && count >= 0) {
      counts[taxon] = count;
    }
  });
  return counts;
}

async function taxonAncestorIds(taxonId) {
  const taxon = positiveInteger(taxonId);
  if (!taxon) throw new Error("Invalid taxon id");
  return cached(`qgTaxonAncestors:${taxon}`, async () => {
    const data = await apiJSON(`/taxa/${taxon}`);
    const result = data.results?.[0];
    if (!result) throw new Error("Taxon not found");
    const source = Array.isArray(result.ancestor_ids)
      ? result.ancestor_ids
      : Array.isArray(result.ancestors) ? result.ancestors.map(ancestor => ancestor.id) : [];
    return source.map(positiveInteger).filter(Boolean);
  });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  let task;
  if (message?.type === "qg-open-options") task = chrome.runtime.openOptionsPage().then(() => ({ ok: true }));
  else if (message?.type === "qg-observation-taxon") {
    task = observationTaxon(message.observationId).then(taxonId => ({ ok: true, taxonId }));
  } else if (message?.type === "qg-taxon-observation-count") {
    task = taxonObservationCount(message.userId, message.taxonId).then(count => ({ ok: true, count }));
  } else if (message?.type === "qg-cached-taxon-observation-counts") {
    task = cachedTaxonObservationCounts(message.userId, message.taxonIds).then(counts => ({ ok: true, counts }));
  } else if (message?.type === "qg-scoped-observation-count") {
    task = scopedObservationCount(message.endpoint, message.params).then(count => ({ ok: true, count }));
  } else if (message?.type === "qg-taxon-ancestors") {
    task = taxonAncestorIds(message.taxonId).then(ancestorIds => ({ ok: true, ancestorIds }));
  } else if (message?.type === "qg-higher-taxa-compare") {
    task = higherTaxaService.compare(message.options).then(result => ({ ok: true, result }));
  } else if (message?.type === "qg-higher-taxa-leaf") {
    task = higherTaxaService.verifyLeaf(message.options, message.taxonId).then(result => ({ ok: true, result }));
  } else if (message?.type === "qg-higher-taxa-refresh-names") {
    task = higherTaxaService.refreshNames(message.options, message.taxonIds).then(result => ({ ok: true, result }));
  } else if (message?.type === "qg-higher-taxa-names") {
    task = higherTaxaService.names(message.options, message.taxonIds).then(result => ({ ok: true, result }));
  } else if (message?.type === "leafwise-explore-library") {
    task = exploreLibrary(message).then(library => ({ok:true,library}));
  } else if (message?.type === "leafwise-personal-records") {
    task = higherTaxaService.records(message.userId, message.taxonId).then(result => ({ok:true,result}));
  } else return;
  task.catch(error => ({ ok: false, error: error.message || "请求失败，请稍后重试。" })).then(respond);
  return true;
});
