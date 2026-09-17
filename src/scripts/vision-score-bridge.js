(function (root) {
  "use strict";

  const EVENT_NAME = "leafwise:cv-combined-scores";
  const FETCH_WRAPPED = Symbol.for("leafwise.cv.fetchWrapped");
  const XHR_OPEN_WRAPPED = Symbol.for("leafwise.cv.xhrOpenWrapped");
  const XHR_SEND_WRAPPED = Symbol.for("leafwise.cv.xhrSendWrapped");
  const FUNCTION_WRAPPED = Symbol.for("leafwise.cv.functionWrapped");
  const STARTED = Symbol.for("leafwise.cv.bridgeStarted");
  const ENDPOINT = /^\/v[12]\/computervision\/(?:score_image|score_observation)(?:\/\d+)?\/?$/;
  let sequence = 0;

  function validScore(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return null;
    return value <= 1 ? value * 100 : value;
  }

  function resultList(response) {
    if (Array.isArray(response?.results)) return response.results;
    if (Array.isArray(response?.data?.results)) return response.data.results;
    return [];
  }

  function requestURL(input, target = root) {
    const value = typeof input === "string" ? input : input?.url ?? input?.href;
    if (typeof value !== "string" || !value) return null;
    try { return new (target.URL || URL)(value, target.location?.href || "https://www.inaturalist.org/"); }
    catch { return null; }
  }

  function isVisionURL(input, target = root) {
    const url = requestURL(input, target);
    if (!url || url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "inaturalist.org" && !hostname.endsWith(".inaturalist.org")) return false;
    return ENDPOINT.test(url.pathname);
  }

  function scoreEntries(response) {
    const scores = [];
    for (const result of resultList(response)) {
      const id = Number(result?.taxon?.id ?? result?.taxon_id);
      const combinedScore = validScore(result?.combined_score);
      if (Number.isSafeInteger(id) && id > 0 && combinedScore !== null) scores.push({ id, combinedScore });
    }
    return scores;
  }

  function capture(response, target = root) {
    const scores = scoreEntries(response);
    if (scores.length && typeof target.dispatchEvent === "function" && typeof target.CustomEvent === "function") {
      target.dispatchEvent(new target.CustomEvent(EVENT_NAME, {
        detail: JSON.stringify({ sequence: ++sequence, capturedAt: Date.now(), scores })
      }));
    }
    return response;
  }

  function inspectFetchResponse(response, target = root) {
    let copy;
    try { copy = response?.clone?.(); } catch { return; }
    if (!copy || typeof copy.json !== "function") return;
    Promise.resolve().then(() => copy.json()).then(value => capture(value, target)).catch(() => {});
  }

  function installFetch(target = root) {
    const original = target.fetch;
    if (typeof original !== "function") return false;
    if (original[FETCH_WRAPPED]) return true;
    function wrappedFetch(...args) {
      const shouldInspect = isVisionURL(args[0], target);
      const pending = original.apply(this, args);
      if (shouldInspect) {
        Promise.resolve(pending).then(response => inspectFetchResponse(response, target)).catch(() => {});
      }
      return pending;
    }
    Object.defineProperty(wrappedFetch, FETCH_WRAPPED, { value: true });
    try { target.fetch = wrappedFetch; } catch { return false; }
    return target.fetch === wrappedFetch;
  }

  function inspectXHR(xhr, target = root) {
    let value;
    try {
      if (xhr.responseType === "json") {
        value = xhr.response;
      } else if (!xhr.responseType && /(?:^|[+/])json(?:\s*;|$)/i.test(xhr.getResponseHeader?.("content-type") || "")) {
        value = JSON.parse(xhr.responseText);
      } else {
        return;
      }
    } catch { return; }
    capture(value, target);
  }

  function installXHR(target = root) {
    const prototype = target.XMLHttpRequest?.prototype;
    if (!prototype) return false;
    const urls = new WeakMap();
    if (typeof prototype.open === "function" && !prototype.open[XHR_OPEN_WRAPPED]) {
      const originalOpen = prototype.open;
      function wrappedOpen(method, url, ...rest) {
        urls.set(this, url);
        return originalOpen.call(this, method, url, ...rest);
      }
      Object.defineProperty(wrappedOpen, XHR_OPEN_WRAPPED, { value: true });
      try { prototype.open = wrappedOpen; } catch { return false; }
    }
    if (typeof prototype.send === "function" && !prototype.send[XHR_SEND_WRAPPED]) {
      const originalSend = prototype.send;
      function wrappedSend(...args) {
        if (isVisionURL(urls.get(this), target) && typeof this.addEventListener === "function") {
          this.addEventListener("loadend", () => inspectXHR(this, target), { once: true });
        }
        return originalSend.apply(this, args);
      }
      Object.defineProperty(wrappedSend, XHR_SEND_WRAPPED, { value: true });
      try { prototype.send = wrappedSend; } catch { return false; }
    }
    return Boolean(prototype.open?.[XHR_OPEN_WRAPPED] && prototype.send?.[XHR_SEND_WRAPPED]);
  }

  // Compatibility for older pages that exposed inaturalistjs globally. Current
  // uploader modules import it into module scope, so network observation above
  // is the primary path and this wrapper must never be required for capture.
  function wrap(owner, name, target = root) {
    const original = owner?.[name];
    if (typeof original !== "function") return false;
    if (original[FUNCTION_WRAPPED]) return true;
    function wrapped(...args) {
      const pending = original.apply(this, args);
      Promise.resolve(pending).then(response => capture(response, target)).catch(() => {});
      return pending;
    }
    Object.defineProperty(wrapped, FUNCTION_WRAPPED, { value: true });
    try { owner[name] = wrapped; } catch { return false; }
    return owner[name] === wrapped;
  }

  function installLegacy(target = root) {
    const cv = target.inaturalistjs?.computervision;
    if (!cv) return false;
    wrap(cv, "score_image", target);
    wrap(cv, "score_observation", target);
    return true;
  }

  function install(target = root) {
    const fetchInstalled = installFetch(target);
    const xhrInstalled = installXHR(target);
    const legacyInstalled = installLegacy(target);
    return fetchInstalled || xhrInstalled || legacyInstalled;
  }

  function start(target = root) {
    if (target[STARTED]) return target[STARTED];
    const state = { timer: null };
    try { Object.defineProperty(target, STARTED, { configurable: true, value: state }); }
    catch { target[STARTED] = state; }
    install(target);
    if (!installLegacy(target)) {
      state.timer = target.setInterval?.(() => {
        if (installLegacy(target)) { target.clearInterval?.(state.timer); state.timer = null; }
      }, 250);
    }
    const cleanup = () => {
      target.clearInterval?.(state.timer);
      state.timer = null;
      target.removeEventListener?.("pagehide", cleanup);
    };
    state.cleanup = cleanup;
    target.addEventListener?.("pagehide", cleanup, { once: true });
    return state;
  }

  const api = { EVENT_NAME, validScore, resultList, requestURL, isVisionURL, scoreEntries, capture,
    inspectFetchResponse, installFetch, inspectXHR, installXHR, wrap, installLegacy, install, start };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  if (/^\/observations\/(?:upload|\d+)\/?$/.test(root.location?.pathname || "")) start(root);
})(globalThis);
