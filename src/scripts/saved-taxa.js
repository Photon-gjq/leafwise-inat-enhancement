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
  function normalize(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const source = value && typeof value === "object" ? value : { id: value, name: "" };
      const id = positiveID(source.id);
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ id, name: typeof source.name === "string" ? source.name.trim() : "" });
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
      const match = line.match(/^(\d+)(?:\s*=\s*(.*))?$/);
      if (!match) throw new Error(`格式无效：${line}；请使用“ID = 名称”。`);
      return { id: match[1], name: match[2] || "" };
    }));
  }
  function format(values) {
    return normalize(values).map(taxon => taxon.name ? `${taxon.id} = ${taxon.name}` : String(taxon.id)).join("\n");
  }
  const api = { storageKeys, defaults, normalize, read, parse, format };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QGInatSavedTaxa = api;
})(globalThis);
