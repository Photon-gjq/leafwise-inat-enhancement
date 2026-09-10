/* Pure comparison logic; shared by content scripts, the service worker and tests. */
(function (root) {
  "use strict";
  const ranks = { kingdom: 70, phylum: 60, class: 50, order: 40, suborder: 37,
    superfamily: 33, family: 30, subfamily: 27, tribe: 25, genus: 20, subgenus: 15 };
  const rankNames = { kingdom: "界", phylum: "门", class: "纲", order: "目", suborder: "亚目",
    superfamily: "总科", family: "科", subfamily: "亚科", tribe: "族", genus: "属", subgenus: "亚属" };
  const iconicIDs = { Aves: 3, Amphibia: 20978, Reptilia: 26036, Mammalia: 40151,
    Actinopterygii: 47178, Animalia: 1, Insecta: 47158, Arachnida: 47119,
    Mollusca: 47115, Plantae: 47126, Fungi: 47170, Protozoa: 47686, Chromista: 48222 };
  function positiveID(value, label = "ID") {
    const str = String(value ?? "").trim();
    const id = Number(str);
    if (!/^\d+$/.test(str) || !Number.isSafeInteger(id) || id <= 0) throw new Error(`${label} 需要单个正整数 ID。`);
    return id;
  }
  function placeIDs(value) {
    const text = String(value ?? "").trim();
    if (text.toLowerCase() === "any") return [];
    const parts = text.replaceAll("，", ",").split(",");
    if (parts.length > 100 || parts.some(part => !/^\d+$/.test(part.trim()))) {
      throw new Error("地点请输入 any 或正整数 ID；多个地点用逗号分隔，例如 6903,7613,7887,10301。");
    }
    const ids = [...new Set(parts.map(part => positiveID(part, "地点")))].sort((a, b) => a - b);
    if (ids.length > 20) throw new Error("一次最多支持 20 个不同地点，请缩小范围。");
    return ids;
  }
  function normalize(input) {
    const user = String(input.user ?? "").trim();
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,99}$/.test(user)) throw new Error("请输入单个 iNaturalist 用户名或数字用户 ID。");
    if (!Object.hasOwn(ranks, input.rank)) throw new Error("请选择支持的非物种级 rank。");
    const quality = input.quality || "any";
    if (!["any", "verifiable", "research"].includes(quality)) throw new Error("观察质量选项无效。");
    const placeValue = String(input.place ?? "").trim();
    const ids = placeIDs(placeValue);
    const place = placeValue.toLowerCase() === "any" ? "any" : ids.length === 1 ? ids[0] : ids.join(",");
    return { user, place, taxon: positiveID(input.taxon, "类群"), rank: input.rank, quality };
  }
  function pageDefaults(href, fallbackUser = "") {
    const p = new URL(href).searchParams;
    const rank = [p.get("rank"), p.get("lrank"), p.get("hrank")].find(r => Object.hasOwn(ranks, r)) || "order";
    const user = p.get("unobserved_by_user_id") || p.get("user_id") || fallbackUser;
    return { user, place: p.get("place_id") || "", taxon: p.get("taxon_id") || iconicIDs[p.get("iconic_taxa")] || "", rank,
      quality: p.get("quality_grade") === "research" ? "research" : p.get("verifiable") === "any" ? "any" : "verifiable" };
  }
  function regionParams(options, taxon = options.taxon) {
    const p = { taxon_id: taxon, verifiable: options.quality === "any" ? "any" : "true" };
    if (options.place !== "any") p.place_id = options.place;
    if (options.quality === "research") p.quality_grade = "research";
    return p;
  }
  function userParams(options, userID) {
    return { user_id: userID, taxon_id: options.taxon, verifiable: "any" };
  }
  function apiURL(path, params) {
    const url = new URL(`https://api.inaturalist.org/v1/${path}`);
    Object.keys(params).sort().forEach(key => url.searchParams.set(key, String(params[key])));
    return url.href;
  }
  function observationsURL(options, taxon) {
    const params = { ...regionParams(options, taxon), view: "species" };
    if (options.place === "any") params.place_id = "any";
    return `https://www.inaturalist.org/observations?${new URLSearchParams(params)}`;
  }
  function tree(data) {
    if (!Array.isArray(data?.results) || !Number.isSafeInteger(data.size) || data.size !== data.results.length) {
      throw new Error("taxonomy 返回格式或长度异常，未生成对比结果。");
    }
    if (data.size >= 650000) throw new Error("分类树过大，可能接近 API 上限；请缩小地点或类群。");
    const nodes = new Map();
    for (const t of data.results) {
      const id = positiveID(t.id);
      if (nodes.has(id) || typeof t.name !== "string" || typeof t.rank !== "string" ||
        !Number.isFinite(t.rank_level) || !Number.isSafeInteger(t.descendant_obs_count) || t.descendant_obs_count < 0 ||
        !Number.isSafeInteger(t.direct_obs_count) || t.direct_obs_count < 0 || t.direct_obs_count > t.descendant_obs_count) {
        throw new Error("分类树包含缺失或无效的分类／计数信息，未生成对比结果。");
      }
      const commonName = typeof t.preferred_common_name === "string" && t.preferred_common_name.trim()
        ? t.preferred_common_name.trim() : "";
      nodes.set(id, { id, name: t.name, commonName, rank: t.rank, rank_level: t.rank_level,
        parent_id: t.parent_id == null ? null : positiveID(t.parent_id),
        descendant_obs_count: t.descendant_obs_count, direct_obs_count: t.direct_obs_count });
    }
    // Fail closed on incomplete ancestry, cycles or inconsistent aggregation.
    const totals = new Map([...nodes].map(([id, n]) => [id, n.direct_obs_count]));
    for (const n of nodes.values()) {
      if (n.parent_id) {
        const parent = nodes.get(n.parent_id);
        if (!parent || parent.rank_level < n.rank_level) throw new Error("分类树祖先链不完整或异常，请稍后重试。");
        totals.set(parent.id, totals.get(parent.id) + n.descendant_obs_count);
      }
      ancestors(nodes, n.id);
    }
    for (const n of nodes.values()) {
      if (totals.get(n.id) !== n.descendant_obs_count) throw new Error("分类树计数不完整或分类发生变化，请稍后重试。");
    }
    return nodes;
  }
  function ancestors(nodes, id) {
    const result = [];
    const seen = new Set();
    for (let n = nodes.get(id); n; n = nodes.get(n.parent_id)) {
      if (seen.has(n.id) || seen.size > 100) throw new Error("分类树祖先链异常。");
      seen.add(n.id);
      result.push(n.id);
    }
    return result;
  }
  function leafCounts(nodes) {
    // Explore rolls infraspecies up to species, then counts terminal observed taxa.
    // Counting raw tree tips would incorrectly count two subspecies as two leaves.
    const eligible = [...nodes.values()].filter(n => n.rank_level >= 10 && n.descendant_obs_count > 0);
    const nonLeaves = new Set();
    for (const n of eligible) for (const id of ancestors(nodes, n.id).slice(1)) nonLeaves.add(id);
    const counts = new Map();
    for (const n of eligible) {
      if (nonLeaves.has(n.id)) continue;
      for (const id of ancestors(nodes, n.id)) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }
  function compare(region, personal, options, rootTaxon) {
    if (!Number.isFinite(rootTaxon.rank_level) || rootTaxon.rank_level < ranks[options.rank]) {
      throw new Error("统计层级不能高于所选类群；例如统计鸟类的目，请选择 Aves（3），不要选择某个物种。");
    }
    const leaves = leafCounts(region);
    const candidates = [...region.values()].filter(n => n.rank === options.rank && n.descendant_obs_count > 0 && ancestors(region, n.id).includes(options.taxon));
    const rows = candidates.filter(n => !(personal.get(n.id)?.descendant_obs_count > 0))
      .map(n => ({ id: n.id, name: n.name, commonName: n.commonName, rank: n.rank, count: n.descendant_obs_count, leaves: leaves.get(n.id) || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { rows, total: candidates.length, seen: candidates.length - rows.length,
      regionObservations: region.get(options.taxon)?.descendant_obs_count || 0,
      personalObservations: personal.get(options.taxon)?.descendant_obs_count || 0 };
  }
  const api = { ranks, rankNames, positiveID, placeIDs, normalize, pageDefaults, regionParams, userParams, apiURL, observationsURL, tree, ancestors, leafCounts, compare };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QGInatHigherTaxa = api;
})(globalThis);
