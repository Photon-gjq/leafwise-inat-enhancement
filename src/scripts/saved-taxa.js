(function (root) {
  "use strict";
  const storageKeys = ["savedTaxa"];
  const defaults = [
    { id: 3, name: "鸟纲" },
    { id: 48460, name: "全部生物" }
  ];
  function positiveID(value) {
    const text = String(value ?? "").trim();
    const id = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(id) || id <= 0) throw new Error(`无效的类群 ID：${text || "空行"}`);
    return id;
  }
  function exclusionIDs(value) {
    if (value == null || value === "") return [];
    const values = Array.isArray(value) ? value : String(value).replaceAll("，", ",").split(",");
    const ids = [...new Set(Array.from(values, positiveID))].sort((a, b) => a - b);
    if (ids.length > 20) throw new Error("每项最多排除 20 个类群。");
    return ids;
  }
  function normalize(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const source = value && typeof value === "object" ? value : { id: value, name: "" };
      const id = positiveID(source.id);
      const withoutTaxonIds = exclusionIDs(source.withoutTaxonIds);
      const identity = `${id}!${withoutTaxonIds.join(",")}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      // Old entries retain their exact shape and storage key. Exclusions are optional.
      result.push({ id, name: typeof source.name === "string" ? source.name.trim() : "",
        ...(withoutTaxonIds.length ? { withoutTaxonIds } : {}) });
    }
    return result;
  }
  function read(data) {
    return normalize(Array.isArray(data?.savedTaxa) ? data.savedTaxa : defaults);
  }
  function parse(text) {
    const lines = String(text ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > 100) throw new Error("常用类群最多保存 100 项。");
    return normalize(lines.map(line => {
      const match = line.match(/^(\d+)(?:\s*!\s*(\d[\d,，\s]*?))?(?:\s*=\s*(.*))?$/);
      if (!match) throw new Error(`格式无效：${line}；请使用“ID = 名称”或“ID !排除ID = 名称”。`);
      return { id: match[1], withoutTaxonIds: match[2]?.trim(), name: match[3] || "" };
    }));
  }
  function format(values) {
    return normalize(values).map(taxon => `${taxon.id}${taxon.withoutTaxonIds ? ` !${taxon.withoutTaxonIds.join(",")}` : ""}${taxon.name ? ` = ${taxon.name}` : ""}`).join("\n");
  }
  function key(value) {
    const [taxon] = normalize([value]);
    return `${taxon.id}${taxon.withoutTaxonIds ? `!${taxon.withoutTaxonIds.join(",")}` : ""}`;
  }
  const api = { storageKeys, defaults, normalize, read, parse, format, key };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QGInatSavedTaxa = api;
})(globalThis);
