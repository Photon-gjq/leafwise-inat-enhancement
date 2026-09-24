(function (root) {
  "use strict";

  const EVENT_NAME = "leafwise:cv-combined-scores";
  const FETCH_WRAPPED = Symbol.for("leafwise.cv.fetchWrapped");
  const XHR_OPEN_WRAPPED = Symbol.for("leafwise.cv.xhrOpenWrapped");
  const XHR_SEND_WRAPPED = Symbol.for("leafwise.cv.xhrSendWrapped");
  const FUNCTION_WRAPPED = Symbol.for("leafwise.cv.functionWrapped");
  const STARTED = Symbol.for("leafwise.cv.bridgeStarted");
  const OBSERVATION_ID = "(?:\\d+|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})";
  const ENDPOINT = new RegExp(`^/v[12]/computervision/(?:score_image|score_observation)(?:/${OBSERVATION_ID})?/?$`, "i");
  const V2_OBSERVATION_ENDPOINT = new RegExp(`^/v2/computervision/score_observation(?:/${OBSERVATION_ID})?/?$`, "i");
  const V2_ENDPOINT = new RegExp(`^/v2/computervision/(?:score_image|score_observation)(?:/${OBSERVATION_ID})?/?$`, "i");
  const CARD_SELECTOR = ".ObsCardComponent .card[data-id]";
  const REQUEST_MARKER = "data-leafwise-vision-request";
  let sequence = 0;
  let requestSequence = 0;

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

  function isV2ObservationURL(input, target = root) {
    const url = requestURL(input, target);
    if (!url || url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return (hostname === "inaturalist.org" || hostname.endsWith(".inaturalist.org")) &&
      V2_OBSERVATION_ENDPOINT.test(url.pathname);
  }

  function isV2VisionURL(input, target = root) {
    const url = requestURL(input, target);
    if (!url || url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return (hostname === "inaturalist.org" || hostname.endsWith(".inaturalist.org")) &&
      V2_ENDPOINT.test(url.pathname);
  }

  function pageScope(target = root) {
    return `page:${target.location?.pathname || "/"}`;
  }

  function requestScope(target = root) {
    const doc = target.document;
    if (!doc || !/^\/observations\/upload\/?$/.test(target.location?.pathname || "")) {
      return pageScope(target);
    }
    const marked = doc.querySelector(`${CARD_SELECTOR}[${REQUEST_MARKER}]`);
    if (marked?.getAttribute("data-id")) return `card:${marked.getAttribute("data-id")}`;
    // Focus and an open menu are not request identities: uploader prefetches
    // can overlap with user interaction. Unmarked requests enter the page pool
    // and are claimed later only by a matching candidate fingerprint.
    return pageScope(target);
  }

  function requestContext(target = root) {
    const scope = requestScope(target);
    // The marker identifies one explicit autocomplete request. Consuming it
    // here prevents a later background CV request from inheriting the card
    // merely because its menu remained open.
    if (scope.startsWith("card:")) {
      target.document?.querySelector?.(`${CARD_SELECTOR}[${REQUEST_MARKER}]`)
        ?.removeAttribute?.(REQUEST_MARKER);
    }
    return { requestId: ++requestSequence, scope };
  }

  function risonFieldsWithScores(fields) {
    if (typeof fields !== "string" || fields.length < 2 || fields[0] !== "(" || fields.at(-1) !== ")") return fields;
    const additions = [];
    if (!/(?:^\(|,)combined_score:/.test(fields)) additions.push("combined_score:!t");
    if (!/(?:^\(|,)vision_score:/.test(fields)) additions.push("vision_score:!t");
    if (!additions.length) return fields;
    const body = fields.slice(1, -1);
    return `(${additions.join(",")}${body ? `,${body}` : ""})`;
  }

  function fieldsWithScores(fields) {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return fields;
    if (fields.combined_score === true && fields.vision_score === true) return fields;
    return { ...fields, combined_score: true, vision_score: true };
  }

  function inputWithURL(input, url, target = root) {
    if (typeof input === "string") return url.href;
    const URLCtor = target.URL;
    if (URLCtor && input instanceof URLCtor) return new URLCtor(url.href);
    const RequestCtor = target.Request;
    if (RequestCtor && input instanceof RequestCtor) {
      try { return new RequestCtor(url.href, input); } catch { return input; }
    }
    return input;
  }

  // Current API v2 clients request an explicit response-field projection that
  // omits one or both scores. Add only those response fields to the existing
  // query or multipart request without issuing another CV request.
  function URLWithScores(input, target = root) {
    if (!isV2VisionURL(input, target)) return input;
    const url = requestURL(input, target);
    const fields = url?.searchParams?.get("fields");
    const augmented = risonFieldsWithScores(fields);
    if (!url || augmented === fields) return input;
    url.searchParams.set("fields", augmented);
    return inputWithURL(input, url, target);
  }

  function JSONBodyWithScores(body) {
    if (typeof body !== "string") return body;
    try {
      const value = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value)) return body;
      const fields = fieldsWithScores(value.fields);
      return fields === value.fields ? body : JSON.stringify({ ...value, fields });
    } catch { return body; }
  }

  function formDataWithScores(body, target = root) {
    const FormDataCtor = target.FormData;
    if (!FormDataCtor || !(body instanceof FormDataCtor) || typeof body.get !== "function") return body;
    const encoded = body.get("fields");
    if (typeof encoded !== "string") return body;
    let value;
    try { value = JSON.parse(encoded); } catch { return body; }
    const fields = fieldsWithScores(value);
    if (fields === value) return body;
    const copy = new FormDataCtor();
    for (const [key, entry] of body.entries()) {
      if (key !== "fields") copy.append(key, entry);
    }
    copy.append("fields", JSON.stringify(fields));
    return copy;
  }

  function bodyWithScores(body, target = root) {
    return formDataWithScores(JSONBodyWithScores(body), target);
  }

  function fetchArgsWithScores(args, target = root) {
    const input = args[0];
    if (!isV2VisionURL(input, target)) return args;
    const rewrittenInput = URLWithScores(input, target);
    const init = args[1];
    const rewrittenBody = bodyWithScores(init?.body, target);
    if (rewrittenInput === input && rewrittenBody === init?.body) return args;
    const rewritten = [...args];
    rewritten[0] = rewrittenInput;
    if (rewrittenBody !== init?.body) rewritten[1] = { ...init, body: rewrittenBody };
    return rewritten;
  }

  function scoreEntries(response) {
    const scores = [];
    for (const result of resultList(response)) {
      const id = Number(result?.taxon?.id ?? result?.taxon_id);
      const combinedScore = validScore(result?.combined_score);
      const visionScore = validScore(result?.vision_score);
      if (Number.isSafeInteger(id) && id > 0 && combinedScore !== null) {
        scores.push({ id, combinedScore, ...(visionScore === null ? {} : { visionScore }) });
      }
    }
    return scores;
  }

  function dispatch(payload, target = root) {
    if (typeof target.dispatchEvent !== "function" || typeof target.CustomEvent !== "function") return false;
    target.dispatchEvent(new target.CustomEvent(EVENT_NAME, { detail: JSON.stringify(payload) }));
    return true;
  }

  function announce(context, target = root) {
    if (!context?.scope) return false;
    return dispatch({ sequence: ++sequence, capturedAt: Date.now(), state: "pending", ...context }, target);
  }

  function capture(response, target = root, context = requestContext(target)) {
    const scores = scoreEntries(response);
    dispatch({ sequence: ++sequence, capturedAt: Date.now(), state: "ready", scores, ...context }, target);
    return response;
  }

  function inspectFetchResponse(response, target = root, context) {
    let copy;
    try { copy = response?.clone?.(); } catch { return; }
    if (!copy || typeof copy.json !== "function") return;
    Promise.resolve().then(() => copy.json()).then(value => capture(value, target, context)).catch(() => {});
  }

  function installFetch(target = root) {
    const original = target.fetch;
    if (typeof original !== "function") return false;
    if (original[FETCH_WRAPPED]) return true;
    function wrappedFetch(...args) {
      const requestArgs = fetchArgsWithScores(args, target);
      const shouldInspect = isVisionURL(requestArgs[0], target);
      const context = shouldInspect ? requestContext(target) : null;
      if (context) announce(context, target);
      const pending = original.apply(this, requestArgs);
      if (shouldInspect) {
        Promise.resolve(pending).then(response => inspectFetchResponse(response, target, context)).catch(() => {});
      }
      return pending;
    }
    Object.defineProperty(wrappedFetch, FETCH_WRAPPED, { value: true });
    try { target.fetch = wrappedFetch; } catch { return false; }
    return target.fetch === wrappedFetch;
  }

  function inspectXHR(xhr, target = root, context) {
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
    capture(value, target, context);
  }

  function installXHR(target = root) {
    const prototype = target.XMLHttpRequest?.prototype;
    if (!prototype) return false;
    const urls = new WeakMap();
    const contexts = new WeakMap();
    if (typeof prototype.open === "function" && !prototype.open[XHR_OPEN_WRAPPED]) {
      const originalOpen = prototype.open;
      function wrappedOpen(method, url, ...rest) {
        const requestURL = URLWithScores(url, target);
        urls.set(this, requestURL);
        if (isVisionURL(requestURL, target)) contexts.set(this, requestContext(target));
        return originalOpen.call(this, method, requestURL, ...rest);
      }
      Object.defineProperty(wrappedOpen, XHR_OPEN_WRAPPED, { value: true });
      try { prototype.open = wrappedOpen; } catch { return false; }
    }
    if (typeof prototype.send === "function" && !prototype.send[XHR_SEND_WRAPPED]) {
      const originalSend = prototype.send;
      function wrappedSend(...args) {
        if (isVisionURL(urls.get(this), target) && typeof this.addEventListener === "function") {
          announce(contexts.get(this), target);
          this.addEventListener("loadend", () => inspectXHR(this, target, contexts.get(this)), { once: true });
        }
        const requestArgs = isV2VisionURL(urls.get(this), target) && args.length
          ? [bodyWithScores(args[0], target), ...args.slice(1)]
          : args;
        return originalSend.apply(this, requestArgs);
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
      const context = requestContext(target);
      announce(context, target);
      const pending = original.apply(this, args);
      Promise.resolve(pending).then(response => capture(response, target, context)).catch(() => {});
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

  const api = { EVENT_NAME, validScore, resultList, requestURL, isVisionURL, isV2ObservationURL,
    isV2VisionURL, pageScope, requestScope, requestContext,
    risonFieldsWithScores, fieldsWithScores, URLWithScores, JSONBodyWithScores,
    formDataWithScores, bodyWithScores, fetchArgsWithScores, scoreEntries,
    dispatch, announce, capture, inspectFetchResponse, installFetch, inspectXHR,
    installXHR, wrap, installLegacy, install, start };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  if (/^\/observations\/(?:upload|\d+)\/?$/.test(root.location?.pathname || "")) start(root);
})(globalThis);
