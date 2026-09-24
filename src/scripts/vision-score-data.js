(function (root) {
  "use strict";

  if (root.LeafwiseVisionScores && typeof module === "undefined") return;

  const EVENT_NAME = "leafwise:cv-combined-scores";
  const MAX_RESPONSES = 24;
  const MAX_AGE = 2 * 60 * 1000;
  const UPLOAD_PAGE_SCOPE = "page:/observations/upload";
  const VISION_SCORE_TOLERANCE = 0.15;
  const COMBINED_SCORE_FIELDS = ["leafwiseCombinedScore", "combined_score"];
  const VISION_SCORE_FIELDS = ["leafwiseVisionScore", "visionScore", "vision_score"];

  function score(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : null;
  }

  function normalizedScore(value) {
    const valid = score(value);
    return valid === null ? null : valid <= 1 ? valid * 100 : valid;
  }

  function rawScore(raw, names) {
    for (const name of names) {
      const value = normalizedScore(raw?.[name]);
      if (value !== null) return value;
    }
    return null;
  }

  function direct(raw, taxonId) {
    if (!raw || Number(raw.id) !== taxonId) return null;
    const combined = rawScore(raw, COMBINED_SCORE_FIELDS);
    if (combined === null) return null;
    return { combined, vision: rawScore(raw, VISION_SCORE_FIELDS) };
  }

  function candidate(raw, taxonId) {
    return {
      id: taxonId,
      visionScore: Number(raw?.id) === taxonId
        ? rawScore(raw, VISION_SCORE_FIELDS)
        : null
    };
  }

  function candidateList(candidates) {
    return Array.isArray(candidates) ? candidates : [];
  }

  function candidateId(entry) {
    return Number(entry?.id ?? entry);
  }

  function candidateIds(candidates) {
    return new Set(candidateList(candidates)
      .map(candidateId)
      .filter(id => Number.isSafeInteger(id) && id > 0));
  }

  function candidateSignature(candidates) {
    return JSON.stringify(candidateList(candidates).map(entry => [
      candidateId(entry) || 0,
      normalizedScore(entry?.visionScore)
    ]));
  }

  function readyResponse(payload, requestId, capturedAt) {
    const entries = Array.isArray(payload?.scores) ? payload.scores : [];
    const scores = new Map();
    for (const entry of entries) {
      const id = Number(entry?.id);
      const combined = score(entry?.combinedScore);
      const vision = score(entry?.visionScore);
      if (Number.isSafeInteger(id) && id > 0 && combined !== null) {
        scores.set(id, { combined, vision });
      }
    }
    return { state: "ready", requestId, scores, capturedAt, claimedBy: null };
  }

  // Return a sortable strength only when a response can safely describe the
  // currently visible candidates. Native vision scores are a fingerprint;
  // taxon overlap is the fallback when that fingerprint is unavailable.
  function matchStrength(response, candidates, allowSingleId = false) {
    let overlap = 0;
    let visionMatches = 0;
    let visionMismatches = 0;
    for (const entry of candidateList(candidates)) {
      const pair = response.scores.get(candidateId(entry));
      if (!pair) continue;
      overlap++;
      const expected = normalizedScore(entry?.visionScore);
      if (expected === null || pair.vision === null) continue;
      if (Math.abs(expected - pair.vision) <= VISION_SCORE_TOLERANCE) visionMatches++;
      else visionMismatches++;
    }
    if (!overlap || visionMismatches) return null;
    const ids = candidateIds(candidates);
    const requiredOverlap = allowSingleId
      ? Math.min(ids.size, 1)
      : Math.min(ids.size, Math.max(2, Math.ceil(ids.size / 2)));
    if (!visionMatches && overlap < requiredOverlap) return null;
    return visionMatches * 1000 + overlap;
  }

  function createStore(now = () => Date.now()) {
    const responses = [];
    const scoped = new Map();
    const pooled = [];
    const bindings = new Map();

    function rememberScopedResponse(scope, response) {
      scoped.delete(scope);
      scoped.set(scope, response);
    }

    function releaseBinding(scope) {
      const binding = bindings.get(scope);
      if (binding?.response?.claimedBy === scope) binding.response.claimedBy = null;
      bindings.delete(scope);
    }

    function add(payload) {
      const scope = typeof payload?.scope === "string" && payload.scope ? payload.scope : null;
      const requestId = Number(payload?.requestId) || 0;
      const capturedAt = Number(payload?.capturedAt) || now();

      // Uploader CV requests can begin before Leafwise opens a particular
      // autocomplete. Keep those responses as a short-lived pool and bind one
      // to one card later from the candidate IDs plus native vision scores.
      if (scope === UPLOAD_PAGE_SCOPE) {
        let response = pooled.find(entry => entry.requestId === requestId);
        if (payload?.state === "pending") {
          if (!response) {
            response = { state: "pending", requestId, scores: new Map(), capturedAt, claimedBy: null };
            pooled.unshift(response);
          }
        } else {
          const ready = readyResponse(payload, requestId, capturedAt);
          if (response) Object.assign(response, ready);
          else pooled.unshift(ready);
        }
        pooled.splice(MAX_RESPONSES);
        return true;
      }

      if (scope && payload?.state === "pending") {
        const current = scoped.get(scope);
        if (!current || requestId >= current.requestId) {
          releaseBinding(scope);
          rememberScopedResponse(scope, { state: "pending", requestId, capturedAt, scores: new Map() });
        }
        return true;
      }

      const response = readyResponse(payload, requestId, capturedAt);
      if (scope) {
        const current = scoped.get(scope);
        if (current && requestId < current.requestId) return false;
        releaseBinding(scope);
        rememberScopedResponse(scope, response);
        return true;
      }
      if (!response.scores.size) return false;
      responses.unshift(response);
      responses.splice(MAX_RESPONSES);
      return true;
    }

    function bind(scope, candidates = [], fallbackScope = null) {
      if (typeof scope !== "string" || !scope) return null;
      const exact = scoped.get(scope);
      if (exact?.state === "pending") return null;
      // A scope records where a request began, not which cached menu it later
      // rendered. Even an explicitly marked card response must agree with the
      // current menu before it can provide scores.
      const allowSingleId = scope !== UPLOAD_PAGE_SCOPE && scope.startsWith("page:/observations/");
      if (exact?.state === "ready" && matchStrength(exact, candidates, allowSingleId) !== null) return exact;

      const signature = candidateSignature(candidates);
      const existing = bindings.get(scope);
      if (existing?.signature === signature && existing.response.state === "ready") return existing.response;
      if (existing) releaseBinding(scope);
      if (fallbackScope !== UPLOAD_PAGE_SCOPE) return null;

      const ranked = pooled
        .filter(response => response.state === "ready" && now() - response.capturedAt <= MAX_AGE &&
          (!response.claimedBy || response.claimedBy === scope))
        .map(response => ({ response, strength: matchStrength(response, candidates) }))
        .filter(entry => entry.strength !== null)
        .sort((a, b) => b.strength - a.strength || b.response.requestId - a.response.requestId);
      if (!ranked.length || (ranked[1] && ranked[1].strength === ranked[0].strength)) return null;
      const response = ranked[0].response;
      response.claimedBy = scope;
      bindings.set(scope, { response, signature });
      return response;
    }

    function state(scope, candidates = [], fallbackScope = null) {
      const exact = typeof scope === "string" ? scoped.get(scope) : null;
      if (exact?.state === "pending") return "pending";
      // Keep the low-level response-state query useful for callers that are not
      // rendering a menu. Adapters always provide candidates and therefore go
      // through fingerprint validation below.
      if (exact?.state === "ready" && (!Array.isArray(candidates) || !candidates.length) && fallbackScope === null) {
        return "ready";
      }
      if (bind(scope, candidates, fallbackScope)) return "ready";
      if (fallbackScope === UPLOAD_PAGE_SCOPE && pooled.some(response => response.state === "pending")) return "pending";
      return "unknown";
    }

    function values(raw, taxonId, candidates = [], scope = null, fallbackScope = null) {
      const own = direct(raw, taxonId);
      if (own !== null) return own;
      if (typeof scope === "string" && scope) {
        const response = bind(scope, candidates, fallbackScope);
        return response?.state === "ready" ? response.scores.get(taxonId) || null : null;
      }
      const visible = candidateIds(candidates);
      let best = null;
      for (const response of responses) {
        if (now() - response.capturedAt > MAX_AGE || !response.scores.has(taxonId)) continue;
        let overlap = 0;
        for (const id of visible) if (response.scores.has(id)) overlap++;
        if (!best || overlap > best.overlap) best = { response, overlap };
      }
      return best ? best.response.scores.get(taxonId) : null;
    }

    function value(raw, taxonId, candidates = [], scope = null, fallbackScope = null) {
      return values(raw, taxonId, candidates, scope, fallbackScope)?.combined ?? null;
    }

    return { add, value, values, state, bind, direct, candidate, score, responses, scoped, pooled, bindings };
  }

  const store = createStore();
  const receive = event => {
    try { store.add(JSON.parse(event.detail)); } catch { /* Ignore foreign or malformed events. */ }
  };
  root.addEventListener?.(EVENT_NAME, receive);
  root.addEventListener?.("pagehide", () => root.removeEventListener?.(EVENT_NAME, receive), { once: true });
  root.LeafwiseVisionScores = Object.freeze({ add: store.add, value: store.value, values: store.values,
    state: store.state, bind: store.bind, direct, candidate, score, normalizedScore });
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createStore, direct, candidate, score, normalizedScore, UPLOAD_PAGE_SCOPE };
  }
})(globalThis);
