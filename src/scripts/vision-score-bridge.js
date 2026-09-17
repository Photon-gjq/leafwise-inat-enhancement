(function (root) {
  "use strict";

  const EVENT_NAME = "leafwise:cv-combined-scores";
  const WRAPPED = Symbol("leafwiseCombinedScoreWrapper");
  let sequence = 0;

  function validScore(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : null;
  }

  function resultList(response) {
    if (Array.isArray(response?.results)) return response.results;
    if (Array.isArray(response?.data?.results)) return response.data.results;
    return [];
  }

  function capture(response) {
    const scores = [];
    for (const result of resultList(response)) {
      const id = Number(result?.taxon?.id ?? result?.taxon_id);
      const combinedScore = validScore(result?.combined_score);
      if (!Number.isSafeInteger(id) || id <= 0 || combinedScore === null) continue;
      // The uploader copies enumerable taxon properties into its autocomplete
      // object. This keeps the score paired with its taxon without using order.
      try { result.taxon.leafwiseCombinedScore = combinedScore; } catch { /* event fallback below */ }
      scores.push({ id, combinedScore });
    }
    if (scores.length && typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
      root.dispatchEvent(new root.CustomEvent(EVENT_NAME, {
        detail: JSON.stringify({ sequence: ++sequence, capturedAt: Date.now(), scores })
      }));
    }
    return response;
  }

  function wrap(owner, name) {
    const original = owner?.[name];
    if (typeof original !== "function" || original[WRAPPED]) return false;
    function wrapped(...args) {
      return Promise.resolve(original.apply(this, args)).then(capture);
    }
    Object.defineProperty(wrapped, WRAPPED, { value: true });
    try { owner[name] = wrapped; } catch { return false; }
    return owner[name] === wrapped;
  }

  function install() {
    const cv = root.inaturalistjs?.computervision;
    if (!cv) return false;
    wrap(cv, "score_image");
    wrap(cv, "score_observation");
    return true;
  }

  const api = { EVENT_NAME, validScore, resultList, capture, wrap, install };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  if (!/^\/observations\/(?:upload|\d+)\/?$/.test(root.location?.pathname || "")) return;
  let timer = null;
  if (!install()) {
    timer = root.setInterval?.(() => {
      if (install()) { root.clearInterval?.(timer); timer = null; }
    }, 100);
  }
  root.addEventListener?.("pagehide", () => root.clearInterval?.(timer), { once: true });
})(globalThis);
