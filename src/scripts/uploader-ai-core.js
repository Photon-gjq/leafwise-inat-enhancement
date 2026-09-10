/* Decisions consume only validated primitive snapshots, never page functions. */
(function (root) {
  "use strict";
  function score(value) {
    // iNaturalist's non-aggregated vision_score is already scaled to 0–100.
    // In particular 0.9 is 0.9/100, NOT 90/100. Do not normalize the top eight.
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  }
  function settings(raw = {}) {
    if (String(raw.threshold ?? 80).trim() === "") throw new Error("請填寫視覺分數門檻。");
    const threshold = Number(raw.threshold ?? 80);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new Error("門檻請填 0–100 的數字。");
    if (!["score", "official"].includes(raw.mode || "score")) throw new Error("選取規則無效。");
    return { mode: raw.mode || "score", threshold, onlyEmpty: raw.onlyEmpty !== false };
  }
  function decide(snapshot, raw) {
    const opts = settings(raw);
    const candidate = snapshot.items.find(item => item.vision && !item.ancestor);
    if (!candidate || !Number.isSafeInteger(candidate.id) || candidate.id <= 0) return { apply: false, reason: "沒有可選取的 AI 最佳建議" };
    const value = score(candidate.score);
    const base = { candidate, score: value };
    if (opts.mode === "score" && value !== null) {
      return { ...base, apply: value > opts.threshold, reason: value > opts.threshold
        ? `首選視覺分數 ${value.toFixed(2)} > ${opts.threshold}`
        : `首選視覺分數 ${value.toFixed(2)} 未超過 ${opts.threshold}` };
    }
    return { ...base, apply: snapshot.confident === true, reason: snapshot.confident === true
      ? `${opts.mode === "score" ? "分數不可讀；" : ""}有官方「非常確定」提示，選其下第一個最佳建議`
      : `${opts.mode === "score" ? "分數不可讀；" : ""}沒有官方「非常確定」提示，保留原值` };
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
