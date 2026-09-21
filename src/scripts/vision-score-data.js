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
    const scoped = new Map();
    function touch(scope, response) {
      scoped.delete(scope);
      scoped.set(scope, response);
    }
    function add(payload) {
      const scope = typeof payload?.scope === "string" && payload.scope ? payload.scope : null;
      const requestId = Number(payload?.requestId) || 0;
      if (scope && payload?.state === "pending") {
        const current = scoped.get(scope);
        if (!current || requestId >= current.requestId) {
          touch(scope, { state: "pending", requestId, capturedAt: Number(payload?.capturedAt) || now(), scores: new Map() });
        }
        return true;
      }
      const entries = Array.isArray(payload?.scores) ? payload.scores : [];
      const scores = new Map();
      for (const entry of entries) {
        const id = Number(entry?.id);
        const value = score(entry?.combinedScore);
        if (Number.isSafeInteger(id) && id > 0 && value !== null) scores.set(id, value);
      }
      const response = { state: "ready", requestId, scores, capturedAt: Number(payload?.capturedAt) || now() };
      if (scope) {
        const current = scoped.get(scope);
        if (current && requestId < current.requestId) return false;
        touch(scope, response);
        return true;
      }
      if (!scores.size) return false;
      responses.unshift(response);
      responses.splice(MAX_RESPONSES);
      return true;
    }
    function state(scope) {
      return typeof scope === "string" ? scoped.get(scope)?.state || "unknown" : "unknown";
    }
    function value(raw, taxonId, visibleIds = [], scope = null) {
      const own = direct(raw, taxonId);
      if (own !== null) return own;
      if (typeof scope === "string" && scope) {
        const response = scoped.get(scope);
        return response?.state === "ready" && response.scores.has(taxonId)
          ? response.scores.get(taxonId)
          : null;
      }
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
    return { add, value, state, direct, score, responses, scoped };
  }

  const store = createStore();
  const receive = event => {
    try { store.add(JSON.parse(event.detail)); } catch { /* Ignore foreign or malformed events. */ }
  };
  root.addEventListener?.(EVENT_NAME, receive);
  root.addEventListener?.("pagehide", () => root.removeEventListener?.(EVENT_NAME, receive), { once: true });
  root.LeafwiseVisionScores = Object.freeze({ add: store.add, value: store.value, state: store.state,
    direct, score, combinedScore });
  if (typeof module !== "undefined" && module.exports) module.exports = { createStore, direct, score, combinedScore };
})(globalThis);
