(function (root) {
  "use strict";
  const core = root.LeafwiseUploadCore;
  const scoreStyle = root.LeafwiseVisionScoreStyle;
  const scores = root.LeafwiseVisionScores;
  const SCORE_EVENT = "leafwise:cv-combined-scores";
  const SCORE_LISTENER = Symbol.for("leafwise.upload.scoreListener");
  const REQUEST_MARKER = "data-leafwise-vision-request";
  const FALLBACK_SCOPE = "page:/observations/upload";
  let markerSequence = 0;
  const cardSelector = ".ObsCardComponent .card[data-id]";
  const cards = () => Array.from(document.querySelectorAll(cardSelector));
  const key = card => card.getAttribute("data-id");
  const scope = card => card && key(card) ? `card:${key(card)}` : null;
  const find = id => cards().find(card => key(card) === id);
  const chooser = card => card?.querySelector(".TaxonAutocomplete");
  const input = card => chooser(card)?.querySelector("input[name='taxon_name']");
  const taxonID = card => chooser(card)?.querySelector("input[name='taxon_id']")?.value || "";
  const filled = card => Boolean(taxonID(card).trim() || input(card)?.value.trim());
  const visible = element => Boolean(element?.isConnected && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  function signature(card) {
    if (!card) return "";
    const values = Array.from(card.querySelectorAll("input,textarea,select"), element => [element.name, element.value]);
    const photos = Array.from(card.querySelectorAll("img")).filter(element => !element.closest(".TaxonAutocomplete")).map(element => element.currentSrc || element.src);
    return JSON.stringify([key(card), values, photos]);
  }
  function editable(card) {
    return card?.isConnected && !card.matches(".saving,.saved") && input(card) && !input(card).disabled;
  }
  function hasPhoto(card) {
    return Boolean(card.querySelector(".Photo img[src]"));
  }
  // The platform adapter is loaded before this shared script.
  const data = root.LeafwiseUploadPageData;
  const widget = card => input(card) && data(input(card), "uiAutocomplete");
  function menu(card) {
    // The upstream component appends its menu inside this exact chooser.
    return chooser(card)?.querySelector("ul.ac-menu.taxon-autocomplete") || null;
  }
  function close(card) {
    try { widget(card)?.close(); } catch { /* A React replacement may destroy it. */ }
    if (document.activeElement === input(card)) input(card).blur();
    card?.removeAttribute?.(REQUEST_MARKER);
  }
  function expireMarker(card, marker) {
    const clear = () => {
      if (card?.getAttribute?.(REQUEST_MARKER) === marker) card.removeAttribute(REQUEST_MARKER);
    };
    if (typeof root.queueMicrotask === "function") root.queueMicrotask(clear);
    else if (typeof root.setTimeout === "function") root.setTimeout(clear, 0);
    else clear();
  }
  function open(card) {
    if (!editable(card)) throw new Error("卡片已移除、上傳中或尚未就緒");
    for (const other of cards()) if (other !== card && visible(menu(other))) close(other);
    for (const other of cards()) other.removeAttribute?.(REQUEST_MARKER);
    const marker = String(++markerSequence);
    card.setAttribute(REQUEST_MARKER, marker);
    const field = input(card);
    const ac = widget(card);
    if (ac && typeof ac.search === "function") {
      // The site's blur handler clears unselected free text. In replacement
      // mode, search without focusing a filled field; a rejected suggestion
      // must leave its original text untouched.
      if (!filled(card)) field.focus({ preventScroll: true });
      // An explicit empty query requests CV even when replacing an existing ID.
      // Preserve both the current name and hidden ID until a qualifying click.
      ac.search("");
      // A cached native menu does not issue a CV request. Do not let its stale
      // marker claim a later prefetch or another card's request.
      expireMarker(card, marker);
    } else {
      if (filled(card)) throw new Error("無法讀取建議元件，已保留原分類");
      field.focus({ preventScroll: true });
      field.click();
      expireMarker(card, marker);
    }
  }

  function candidateRows(list) {
    const rows = [];
    let confident = false;
    let section = 0;
    let confidentDOM = false;
    for (const li of list.children) {
      if (li.matches(".header-category")) {
        section++;
        if (core.confidentHeader(li.textContent)) confidentDOM = true;
        continue;
      }
      const result = li.querySelector(".ac.vision[data-taxon-id]");
      if (!result || li.matches(".non-option")) continue;
      const id = Number(result.getAttribute("data-taxon-id"));
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const raw = data(li, "ui-autocomplete-item") || data(li, "item.autocomplete");
      let ancestor = confidentDOM && section === 1;
      // Copy only these primitives. Ignore unrelated jQuery state and functions.
      try {
        if (raw && raw.id === id && raw.isVisionResult === true) {
          ancestor = raw.isCommonAncestor === true;
        }
      } catch { /* Fall back to the visible official category structure. */ }
      if (ancestor) confident = true;
      rows.push({ li, result, id, raw, ancestor });
    }
    return { rows, confident: confident || confidentDOM };
  }

  function read(card, decorate = false) {
    const list = menu(card);
    if (!visible(list)) return null;
    const { rows, confident } = candidateRows(list);
    const items = [];
    const candidates = rows.map(entry => scores?.candidate?.(entry.raw, entry.id) || { id: entry.id, visionScore: null });
    scores?.bind?.(scope(card), candidates, FALLBACK_SCOPE);
    for (const { li, result, id, raw, ancestor } of rows) {
      const pair = scores?.values?.(raw, id, candidates, scope(card), FALLBACK_SCOPE) || null;
      const value = core.score(pair?.combined);
      const name = (result.querySelector(".title")?.textContent || result.textContent).trim().slice(0,250);
      const item = { id, name, vision: true, ancestor, score: value, visionScore: pair?.vision ?? null };
      items.push(item);
      if (decorate) {
        scoreStyle?.decorate(result, li, pair);
      }
    }
    if (!items.length && /not confident|没有足够|沒有足夠|没有信心|沒有信心/i.test(list.textContent)) return { items: [], confident: false };
    return items.length ? { items, confident,
      scoreState: scores?.state?.(scope(card), candidates, FALLBACK_SCOPE) || "unknown" } : null;
  }
  function click(card, id) {
    const list = menu(card);
    if (!visible(list)) throw new Error("建議清單已關閉，未選取");
    const target = Array.from(list.querySelectorAll("li.ac-result .ac.vision[data-taxon-id]"))
      .find(element => Number(element.getAttribute("data-taxon-id")) === id);
    if (!target) throw new Error("建議已變更，未選取");
    // Click the actual suggestion, preserving React state and CV attribution.
    // Never click .ac-view, the side editor, or the uploader's submit button.
    const label = target.querySelector(".ac-label") || target;
    label.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    label.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    label.click();
  }
  function scanScores() {
    let count = 0;
    for (const card of cards()) {
      if (!visible(menu(card))) continue;
      if (read(card, true)) count++;
    }
    return count;
  }
  function installScoreListener(target = root, rescan = scanScores) {
    if (target[SCORE_LISTENER]) return target[SCORE_LISTENER];
    const onScore = () => rescan();
    const state = { onScore, cleanup: null };
    const cleanup = () => {
      target.removeEventListener?.(SCORE_EVENT, onScore);
      target.removeEventListener?.("pagehide", cleanup);
      try { delete target[SCORE_LISTENER]; } catch { /* The page is already leaving. */ }
    };
    state.cleanup = cleanup;
    try { Object.defineProperty(target, SCORE_LISTENER, { configurable: true, value: state }); }
    catch { target[SCORE_LISTENER] = state; }
    target.addEventListener?.(SCORE_EVENT, onScore);
    target.addEventListener?.("pagehide", cleanup, { once: true });
    return state;
  }
  root.LeafwiseUploadAdapter = { cards, key, scope, find, input, taxonID, filled, signature, editable, hasPhoto,
    menu, visible, open, close, expireMarker, read, click, scanScores, installScoreListener };
  if (/^\/observations\/upload\/?$/.test(root.location?.pathname || "")) installScoreListener();
})(globalThis);
