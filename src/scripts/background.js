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
    const next = message.action === "replace-places"
      ? LeafwiseExploreTools.replacePlaceGroups(current, message.entry, QGInatHigherTaxa, () => crypto.randomUUID())
      : LeafwiseExploreTools.editLibrary(current, message.action, message.entry, QGInatHigherTaxa, crypto.randomUUID());
    await chrome.storage.local.set({[LIBRARY_KEY]:next});
    return next;
  });
  libraryTask = task.catch(() => {});
  return task;
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

const API_ROOT = "https://api.inaturalist.org/v1";
const CACHE_TTL = 5 * 60 * 1000;
const diversityFetchJSON = QGInatHigherTaxaService.createTransport();

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

function personalPlace(placeId) {
  return placeId == null ? null : QGInatHigherTaxa.positiveID(placeId, "地点");
}

function personalCacheKey(prefix, user, taxon, place) {
  // Keep old global entries reusable; regional entries never share their key.
  return `${prefix}:${user}:${taxon}${place == null ? "" : `:place:${place}`}`;
}

async function taxonObservationCount(userId, taxonId, force = false, placeId = null) {
  const user = positiveInteger(userId);
  const taxon = positiveInteger(taxonId);
  if (!user || !taxon) throw new Error("Invalid user or taxon id");
  const place = personalPlace(placeId);
  const load = async () => {
    const data = await apiJSON("/observations", {
      user_id: user,
      taxon_id: taxon,
      verifiable: "any",
      per_page: 1,
      ...(place == null ? {} : { place_id: place })
    });
    const count = Number(data.total_results);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid observation count");
    return count;
  };
  const key = personalCacheKey("qgTaxonCount", user, taxon, place);
  if (force) {
    const value = await load();
    try { await chrome.storage.local.set({ [key]: { value, savedAt: Date.now() } }); } catch {}
    return value;
  }
  return cached(key, load);
}

async function taxonDiversityCounts(userId, taxonId, placeId = null) {
  const user = positiveInteger(userId);
  const taxon = positiveInteger(taxonId);
  if (!user || !taxon) throw new Error("Invalid user or taxon id");
  const place = personalPlace(placeId);
  return cached(personalCacheKey("qgTaxonDiversity", user, taxon, place), async () => {
    const params = { user_id: user, taxon_id: taxon, verifiable: "any", per_page: 1,
      ...(place == null ? {} : { place_id: place }) };
    // The search-page "species" total counts leaf taxa of any rank.
    const leaves = await diversityFetchJSON(QGInatHigherTaxa.apiURL("observations/species_counts", params));
    const leafTaxa = leaves.total_results;
    if (!Number.isSafeInteger(leafTaxa) || leafTaxa < 0) throw new Error("Invalid leaf taxon count");
    // The observer table's species_count counts species-rank taxa only.
    const observers = await diversityFetchJSON(QGInatHigherTaxa.apiURL("observations/observers", params));
    const observer = observers.results?.find(row => Number(row.user_id) === user);
    const species = observer?.species_count;
    if (!Number.isSafeInteger(species) || species < 0) throw new Error("Invalid observer species count");
    return { leafTaxa, species };
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

async function cachedTaxonObservationCounts(userId, taxonIds, placeId = null) {
  const user = positiveInteger(userId);
  if (!user || !Array.isArray(taxonIds)) throw new Error("Invalid user or taxon ids");
  const taxa = [...new Set(taxonIds.map(positiveInteger).filter(Boolean))];
  const place = personalPlace(placeId);
  const keys = taxa.map(taxon => personalCacheKey("qgTaxonCount", user, taxon, place));
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

function notificationPage(sender) {
  const page = new URL(sender.url || "about:blank");
  if (page.protocol !== "https:" || page.port || page.username || page.password
    || !["inaturalist.org", "www.inaturalist.org"].includes(page.hostname)
    || !Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.tab?.windowId)
    || (sender.frameId != null && sender.frameId !== 0)) {
    throw new Error("Invalid notification tab request");
  }
  return page;
}

function notificationIDs(rawIds) {
  if (!Array.isArray(rawIds)) throw new Error("Invalid observation ids");
  const ids = [...new Set(rawIds.map(value => {
    if ((typeof value !== "number" && typeof value !== "string") || !/^[1-9]\d*$/.test(String(value))) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  }))];
  if (ids.includes(null)) throw new Error("Invalid observation id");
  return ids;
}

const notificationFetchJSON = QGInatHigherTaxaService.createTransport();
const notificationRequests = new Map();
async function updateIdentifications(rawIds, sender) {
  notificationPage(sender);
  const ids = notificationIDs(rawIds).sort((a, b) => a - b);
  if (!ids.length || ids.length > 20) throw new Error("Invalid notification batch size");
  const key = ids.join(",");
  if (notificationRequests.has(key)) return notificationRequests.get(key);
  const task = (async () => {
    const data = await notificationFetchJSON(`${API_ROOT}/observations/${key}`);
    if (!Array.isArray(data.results)) throw new Error("Invalid observation response");
    const observations = {};
    for (const observation of data.results) {
      if (!ids.includes(observation.id) || Object.hasOwn(observations, observation.id)) throw new Error("Unexpected observation");
      // Return only comparison metadata, never photos, locations or remark text.
      // No identification history is persisted to extension storage.
      observations[observation.id] = Array.isArray(observation.identifications) && observation.identifications.length <= 2000
        ? observation.identifications.map(item => ({
          id: item.id,
          uuid: typeof item.uuid === "string" ? item.uuid.toLowerCase() : null,
          userId: item.user?.id ?? item.user_id,
          taxonId: item.taxon?.id ?? item.taxon_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          current: item.current === true,
          hidden: item.hidden === true,
          hasRemark: item.body != null && (typeof item.body !== "string" || item.body.trim().length > 0)
        })) : null;
    }
    return { ok: true, observations };
  })();
  notificationRequests.set(key, task);
  try { return await task; } finally { notificationRequests.delete(key); }
}

function notificationPermalinks(rawLinks, page) {
  if (rawLinks == null) return [];
  if (!Array.isArray(rawLinks) || rawLinks.length > 20) throw new Error("Invalid notification links");
  return [...new Set(rawLinks.map(link => {
    if (typeof link !== "string") throw new Error("Invalid notification link");
    const url = new URL(link);
    const match = /^\/(comments|identifications)\/([1-9]\d*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(url.pathname);
    if (url.protocol !== "https:" || url.port || url.username || url.password
      || !["inaturalist.org", "www.inaturalist.org"].includes(url.hostname)
      || !match || (/^\d+$/.test(match[2]) && !positiveInteger(match[2]))) throw new Error("Invalid notification link");
    return page.origin + url.pathname.replace(/\/$/, "");
  }))];
}

async function openUpdateObservations(rawIds, sender, rawLinks) {
  const page = notificationPage(sender);
  const ids = notificationIDs(rawIds);
  const urls = [...ids.map(id => `https://${page.hostname}/observations/${id}`),
    ...notificationPermalinks(rawLinks, page)];
  let opened = 0;
  for (const url of urls) {
    try {
      await chrome.tabs.create({
        url,
        active: false,
        windowId: sender.tab.windowId
      });
      opened++;
    } catch { /* Report a partial result without retrying successful tabs. */ }
  }
  return { ok: opened === urls.length, opened, requested: urls.length };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  let task;
  if (message?.type === "qg-open-options") task = chrome.runtime.openOptionsPage().then(() => ({ ok: true }));
  else if (message?.type === "leafwise-open-update-observations") {
    task = openUpdateObservations(message.observationIds, sender, message.unresolvedLinks);
  } else if (message?.type === "leafwise-update-identifications") {
    task = updateIdentifications(message.observationIds, sender);
  } else if (message?.type === "qg-observation-taxon") {
    task = observationTaxon(message.observationId).then(taxonId => ({ ok: true, taxonId }));
  } else if (message?.type === "qg-taxon-observation-count") {
    task = taxonObservationCount(message.userId, message.taxonId, message.force === true, message.placeId).then(count => ({ ok: true, count }));
  } else if (message?.type === "qg-taxon-diversity") {
    task = taxonDiversityCounts(message.userId, message.taxonId, message.placeId).then(counts => ({ ok: true, counts }));
  } else if (message?.type === "qg-cached-taxon-observation-counts") {
    task = cachedTaxonObservationCounts(message.userId, message.taxonIds, message.placeId).then(counts => ({ ok: true, counts }));
  } else if (message?.type === "qg-scoped-observation-count") {
    task = scopedObservationCount(message.endpoint, message.params).then(count => ({ ok: true, count }));
  } else if (message?.type === "qg-taxon-ancestors") {
    task = taxonAncestorIds(message.taxonId).then(ancestorIds => ({ ok: true, ancestorIds }));
  } else if (message?.type === "qg-higher-taxa-compare") {
    task = higherTaxaService.compare(message.options).then(result => ({ ok: true, result }));
  } else if (message?.type === "qg-higher-taxa-leaf") {
    task = higherTaxaService.verifyLeaf(message.options, message.taxonId).then(result => ({ ok: true, result }));
  } else if (message?.type === "qg-higher-taxa-refresh-names") {
    task = higherTaxaService.refreshNames(message.options, message.taxonIds, message.locale).then(result => ({ ok: true, result }));
  } else if (message?.type === "qg-higher-taxa-names") {
    task = higherTaxaService.names(message.options, message.taxonIds, message.locale).then(result => ({ ok: true, result }));
  } else if (message?.type === "leafwise-explore-library") {
    task = exploreLibrary(message).then(library => ({ok:true,library}));
  } else if (message?.type === "leafwise-personal-records") {
    task = higherTaxaService.records(message.userId, message.taxonId, message.placeId).then(result => ({ok:true,result}));
  } else return;
  task.catch(error => ({ ok: false, error: error.message || "请求失败，请稍后重试。" })).then(respond);
  return true;
});
