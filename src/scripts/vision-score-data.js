(function (root) {
  "use strict";

  if (root.LeafwiseVisionScores && typeof module === "undefined") return;

  const EVENT_NAME = "leafwise:cv-combined-scores";
  const MAX_RESPONSES = 24;
  const MAX_AGE = 2 * 60 * 1000;

  function score(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : null;
  }

  function combinedScore(value) {
    const valid = score(value);
    return valid === null ? null : valid <= 1 ? valid * 100 : valid;
  }

  function direct(raw, taxonId) {
    if (!raw || Number(raw.id) !== taxonId) return null;
    const captured = score(raw.leafwiseCombinedScore);
    if (captured !== null) return captured;
    return combinedScore(raw.combined_score);
  }

  function createStore(now = () => Date.now()) {
    const responses = [];
    function add(payload) {
      const entries = Array.isArray(payload?.scores) ? payload.scores : [];
      const scores = new Map();
      for (const entry of entries) {
        const id = Number(entry?.id);
        const value = score(entry?.combinedScore);
        if (Number.isSafeInteger(id) && id > 0 && value !== null) scores.set(id, value);
      }
      if (!scores.size) return false;
      responses.unshift({ scores, capturedAt: Number(payload?.capturedAt) || now() });
      responses.splice(MAX_RESPONSES);
      return true;
    }
    function value(raw, taxonId, visibleIds = []) {
      const own = direct(raw, taxonId);
      if (own !== null) return own;
      const visible = new Set(visibleIds.map(Number).filter(Number.isSafeInteger));
      let best = null;
      for (const response of responses) {
        if (now() - response.capturedAt > MAX_AGE || !response.scores.has(taxonId)) continue;
        let overlap = 0;
        for (const id of visible) if (response.scores.has(id)) overlap++;
        if (!best || overlap > best.overlap) best = { response, overlap };
      }
      return best ? best.response.scores.get(taxonId) : null;
    }
    return { add, value, direct, score, responses };
  }

  const store = createStore();
  const receive = event => {
    try { store.add(JSON.parse(event.detail)); } catch { /* Ignore foreign or malformed events. */ }
  };
  root.addEventListener?.(EVENT_NAME, receive);
  root.addEventListener?.("pagehide", () => root.removeEventListener?.(EVENT_NAME, receive), { once: true });
  root.LeafwiseVisionScores = Object.freeze({ add: store.add, value: store.value, direct, score, combinedScore });
  if (typeof module !== "undefined" && module.exports) module.exports = { createStore, direct, score, combinedScore };
})(globalThis);
