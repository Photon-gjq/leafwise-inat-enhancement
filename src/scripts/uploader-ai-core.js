/* Decisions consume only validated primitive snapshots, never page functions. */
(function (root) {
  "use strict";
  function score(value) {
    // iNaturalist's combined_score is already scaled to 0–100. It combines
    // visual similarity with place/date context but is not calibrated accuracy.
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  }
  function settings(raw = {}) {
    if (String(raw.threshold ?? 80).trim() === "") throw new Error("請填寫綜合分數門檻。");
    const threshold = Number(raw.threshold ?? 80);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error("門檻請填 0–100 的數字。");
    if (!["score", "official"].includes(raw.mode || "score")) throw new Error("選取規則無效。");
    return { mode: raw.mode || "score", threshold, onlyEmpty: raw.onlyEmpty !== false };
  }
  function decide(snapshot, raw) {
    const opts = settings(raw);
    const valid = item => item?.vision === true && Number.isSafeInteger(item.id) && item.id > 0;
    const best = snapshot.items.find(item => valid(item) && !item.ancestor);
    const official = snapshot.items.find(item => valid(item) && item.ancestor);
    const value = score(best?.score);
    if (opts.mode === "score" && best && value !== null && value > opts.threshold) {
      return { candidate: best, score: value, apply: true,
        reason: `首選綜合分數 ${value.toFixed(1)} > ${opts.threshold}` };
    }
    const prefix = opts.mode === "score"
      ? value === null ? "首選綜合分數不可讀；" : `首選綜合分數 ${value.toFixed(1)} 未超過 ${opts.threshold}；`
      : "";
    if (snapshot.confident === true && official) {
      return { candidate: official, score: null, apply: true,
        reason: `${prefix}填入官方「非常確定」的上階類群` };
    }
    return { candidate: best || official, score: value, apply: false,
      reason: `${prefix}${snapshot.confident === true
        ? "無法確認官方確定類群，保留原值"
        : "沒有官方「非常確定」提示，保留原值"}` };
  }
  function confidentHeader(text) {
    return /我們非常確定|我们非常确定|we[’']?re pretty sure|we are pretty sure/i.test(text || "");
  }
  const api = { score, settings, decide, confidentHeader };
  // Firefox's isolated content global differs from its wrapped window.
  // A page may define a CommonJS shim; preserve its existing exports.
  if (typeof window !== "undefined") root.LeafwiseUploadCore = api;
  else if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
