(function (root) {
  "use strict";
  function createService({ core, fetchJSON, storage, now = Date.now }) {
    const TTL = 10 * 60 * 1000;
    const NAME_TTL = 30 * 24 * 60 * 60 * 1000;
    const PREFIX = "qgHigherTaxaV1:";
    const cache = new Map();
    const pending = new Map();
    async function cached(key, loader, ttl = TTL, force = false) {
      const fullKey = PREFIX + key;
      let entry = cache.get(fullKey);
      if (!entry && storage) {
        try { entry = (await storage.get(fullKey))[fullKey]; } catch {}
      }
      if (!force && entry && now() - entry.at < (entry.ttl || ttl) && now() >= entry.at) {
        cache.delete(fullKey);
        cache.set(fullKey, entry);
        return entry;
      }
      if (pending.has(fullKey)) return pending.get(fullKey);
      const task = (async () => {
        const value = await loader();
        const result = { at: now(), ttl, value };
        cache.set(fullKey, result);
        while (cache.size > 32) cache.delete(cache.keys().next().value);
        // Session storage survives worker suspension but does not sync large trees.
        if (storage && JSON.stringify(result).length < 900000) {
          try {
            await storage.set({ [fullKey]: result });
            const all = await storage.get(null);
            const entries = Object.entries(all).filter(([k]) => k.startsWith(PREFIX)).sort((a, b) => b[1].at - a[1].at);
            // Small entity / leaf responses must not evict both cached trees.
            let bytes = 0;
            const remove = entries.filter(([, v], i) => {
              bytes += JSON.stringify(v).length * 2;
              return i >= 64 || bytes > 7 * 1024 * 1024 || now() - v.at >= (v.ttl || TTL);
            }).map(([k]) => k);
            if (remove.length) await storage.remove(remove);
          } catch { /* Memory caching still works if the session quota is full. */ }
        }
        return result;
      })();
      pending.set(fullKey, task);
      try { return await task; } finally { pending.delete(fullKey); }
    }
    async function entity(kind, id) {
      return (await cached(`${kind}/${String(id).toLowerCase()}`, async () => {
        const data = await fetchJSON(core.apiURL(`${kind}/${encodeURIComponent(id)}`, {}));
        const result = data.results?.[0];
        if (data.results?.length !== 1 || !result?.id) throw new Error(`${kind === "users" ? "用户" : kind === "places" ? "地点" : "类群"}不存在，请检查输入。`);
        if (kind === "users" && !(/^\d+$/.test(String(id)) ? Number(id) === result.id : String(result.login).toLowerCase() === String(id).toLowerCase())) {
          throw new Error("用户名没有精确匹配，请检查输入。");
        }
        if (kind !== "users" && result.id !== Number(id)) throw new Error("地点或类群 ID 没有精确匹配。");
        return { id: result.id, name: result.login || result.display_name || result.name, rank_level: result.rank_level };
      })).value;
    }
    async function places(value) {
      if (value === "any") return { ids: [], items: [], name: "全球" };
      const ids = core.placeIDs(value);
      const list = ids.join(",");
      const items = (await cached(`place-list/${list}`, async () => {
        const data = await fetchJSON(core.apiURL(`places/${list}`, {}));
        if (!Array.isArray(data.results)) throw new Error("地点 API 返回格式异常，请稍后重试。");
        const found = new Map();
        for (const item of data.results) {
          if (!ids.includes(item.id) || found.has(item.id) || typeof (item.display_name || item.name) !== "string") {
            throw new Error("地点 API 返回了非预期的数据，请稍后重试。");
          }
          found.set(item.id, { id: item.id, name: item.display_name || item.name });
        }
        const missing = ids.filter(id => !found.has(id));
        if (missing.length) throw new Error(`地点不存在或无法读取：${missing.join(",")}；请检查这些 ID。`);
        // Batch API order is not guaranteed. Match every ID before any taxonomy request.
        return ids.map(id => found.get(id));
      })).value;
      return { ids, items, name: items.map(item => item.name).join(" ∪ ") };
    }
    async function taxonomy(params) {
      const url = core.apiURL("observations/taxonomy", params);
      const entry = await cached(url, async () => {
        const parsed = core.tree(await fetchJSON(url));
        if (parsed.size && !parsed.has(Number(params.taxon_id))) throw new Error("分类树没有包含请求的根类群，请稍后重试。");
        return [...parsed.values()];
      });
      return { nodes: new Map(entry.value.map(n => [n.id, n])), at: entry.at, url };
    }
    async function localizedNames(taxonIDs, preferredPlaceID, force = false) {
      const ids = [...new Set(taxonIDs.map(core.positiveID))].sort((a, b) => a - b);
      if (!ids.length) return new Map();
      const chunks = [];
      for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
      const pages = await Promise.all(chunks.map(async chunk => {
        const params = { locale: "zh-CN", per_page: 200 };
        if (preferredPlaceID) params.preferred_place_id = preferredPlaceID;
        const url = core.apiURL(`taxa/${chunk.join(",")}`, params);
        return (await cached(url, async () => {
          const data = await fetchJSON(url);
          if (!Array.isArray(data.results)) throw new Error("分类单元名称 API 返回格式异常，请稍后重试。");
          const expected = new Set(chunk);
          return data.results.filter(taxon => expected.has(taxon.id)).map(taxon => ({
            id: taxon.id,
            commonName: typeof taxon.preferred_common_name === "string" ? taxon.preferred_common_name.trim() : ""
          }));
        }, NAME_TTL, force)).value;
      }));
      return new Map(pages.flat().map(item => [item.id, item.commonName]));
    }
    async function namesResult(input, taxonIDs, force) {
      const options = core.normalize(input);
      if (!Array.isArray(taxonIDs) || taxonIDs.length > 30) throw new Error("每批最多查询 30 个分类单元名称。");
      const names = await localizedNames(taxonIDs, core.placeIDs(options.place)[0], force);
      return { names: Object.fromEntries(names), refreshedAt: now() };
    }
    const names = (input, taxonIDs) => namesResult(input, taxonIDs, false);
    const refreshNames = (input, taxonIDs) => namesResult(input, taxonIDs, true);
    async function compare(input) {
      const options = core.normalize(input);
      const [user, place, taxon] = await Promise.all([entity("users", options.user), places(options.place), entity("taxa", options.taxon)]);
      if (taxon.rank_level < core.ranks[options.rank]) throw new Error("统计层级不能高于所选类群；请将类群改为该层级或更高层级。");
      const locale = { locale: "zh-CN" };
      const [region, personal] = await Promise.all([
        taxonomy({ ...core.regionParams(options), ...locale }),
        taxonomy({ ...core.userParams(options, user.id), ...locale })
      ]);
      const comparison = core.compare(region.nodes, personal.nodes, options, taxon);
      return { ...comparison, options, user, place, taxon,
        regionAt: region.at, personalAt: personal.at, regionURL: region.url, personalURL: personal.url };
    }
    async function verifyLeaf(input, rowID) {
      const options = core.normalize(input);
      const id = core.positiveID(rowID);
      const region = await taxonomy({ ...core.regionParams(options), locale: "zh-CN" });
      const row = region.nodes.get(id);
      if (!row || row.rank !== options.rank || !core.ancestors(region.nodes, id).includes(options.taxon)) throw new Error("该分类单元不属于当前结果，请重新查询。");
      const url = core.apiURL("observations/species_counts", { ...core.regionParams(options, id), per_page: 1 });
      const entry = await cached(url, async () => {
        const data = await fetchJSON(url);
        if (!Number.isSafeInteger(data.total_results) || data.total_results < 0) throw new Error("species_counts 返回的总数无效。");
        return data.total_results;
      });
      return { count: entry.value, at: entry.at, url };
    }
    return { compare, verifyLeaf, names, refreshNames };
  }
  // Two simultaneous connections, with at least 1.1 seconds between starts.
  // No automatic retry storm; timeout / 429 / 5xx are actionable errors.
  function createTransport(fetchImpl = fetch, timing = {}) {
    const responseTimeout = timing.responseTimeout ?? 25000;
    const bodyTimeout = timing.bodyTimeout ?? 120000;
    const startInterval = timing.startInterval ?? 1100;
    const queue = [];
    let active = 0;
    let nextStart = 0;
    let timer;
    function pump() {
      clearTimeout(timer);
      if (!queue.length || active >= 2) return;
      const delay = nextStart - Date.now();
      if (delay > 0) { timer = setTimeout(pump, delay); return; }
      const job = queue.shift();
      active++;
      nextStart = Date.now() + startInterval;
      (async () => {
        const controller = new AbortController();
        let phase = "response";
        let timeout = setTimeout(() => controller.abort(), responseTimeout);
        try {
          const response = await fetchImpl(job.url, { credentials: "omit", headers: { Accept: "application/json" }, signal: controller.signal });
          if (!response.ok) {
            if (response.status === 429) throw new Error("iNaturalist 暂时限流（429），请稍后再试。");
            if (response.status === 404 || response.status === 422) throw new Error("用户、地点或类群无效，或 API 不接受此查询（" + response.status + "）。");
            throw new Error(`iNaturalist API 暂不可用（${response.status}），请稍后重试。`);
          }
          // Large multi-place trees can take longer to download than the server
          // takes to respond. Keep a short response deadline, then a body deadline.
          clearTimeout(timeout);
          phase = "body";
          timeout = setTimeout(() => controller.abort(), bodyTimeout);
          return await response.json();
        } catch (error) {
          if (error.name === "AbortError") throw new Error(phase === "body"
            ? "API 数据下载超过 120 秒，请缩小查询范围或稍后重试。"
            : "API 超过 25 秒未响应，请缩小查询范围或稍后重试。");
          if (error instanceof TypeError) throw new Error("无法连接 iNaturalist API，请检查网络后重试。");
          throw error;
        } finally { clearTimeout(timeout); }
      })().then(job.resolve, job.reject).finally(() => { active--; pump(); });
      pump();
    }
    return url => new Promise((resolve, reject) => { queue.push({ url, resolve, reject }); pump(); });
  }
  const api = { createService, createTransport };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QGInatHigherTaxaService = api;
})(globalThis);
