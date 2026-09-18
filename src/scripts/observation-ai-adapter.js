(function (root) {
  "use strict";

  const style = root.LeafwiseVisionScoreStyle;
  const scores = root.LeafwiseVisionScores;
  const pageData = root.LeafwiseUploadPageData || (() => null);
  const PATH = /^\/observations\/\d+\/?$/;
  const MENU = "ul.ac-menu.taxon-autocomplete,ul.ui-autocomplete,[role='listbox']";

  function active() { return PATH.test(root.location?.pathname || ""); }
  function visible(element) {
    if (!element?.isConnected || element.hidden) return false;
    const css = root.getComputedStyle?.(element);
    return (!css || (css.display !== "none" && css.visibility !== "hidden")) &&
      (typeof element.getClientRects !== "function" || element.getClientRects().length > 0);
  }
  function raw(item, result) {
    return pageData(item, "ui-autocomplete-item") || pageData(item, "item.autocomplete") ||
      pageData(result, "ui-autocomplete-item") || pageData(result, "item.autocomplete");
  }
  function vision(data, result, id) {
    // The official TaxonAutocomplete template derives .ac.vision from
    // isVisionResult. The DOM marker keeps detail-page scores working when a
    // browser's isolated world cannot read the page's jQuery data cache.
    return (data && Number(data.id) === id && data.isVisionResult === true) ||
      result?.classList?.contains("vision") === true;
  }
  function scan(doc = root.document) {
    if (!active() || !style || !scores) return 0;
    let count = 0;
    for (const menu of Array.from(doc.querySelectorAll(MENU)).filter(visible)) {
      const rows = Array.from(menu.querySelectorAll("li"));
      const ids = rows.map(item => Number((item.matches("[data-taxon-id]") ? item : item.querySelector("[data-taxon-id]"))?.getAttribute("data-taxon-id")))
        .filter(id => Number.isSafeInteger(id) && id > 0);
      for (const item of rows) {
        const result = item.matches("[data-taxon-id]") ? item : item.querySelector("[data-taxon-id]");
        if (!result) continue;
        const id = Number(result.getAttribute("data-taxon-id"));
        if (!Number.isSafeInteger(id) || id <= 0) continue;
        const data = raw(item, result);
        const value = vision(data, result, id)
          ? scores.value(data, id, ids)
          : null;
        style.decorate(result, item.matches("li") ? item : result.closest("li"), value);
        if (value !== null) count++;
      }
    }
    return count;
  }

  const api = { active, visible, vision, scan };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  if (!root.document?.body || !active()) return;
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    (root.requestAnimationFrame || root.setTimeout)(() => { pending = false; scan(); });
  };
  const observer = new root.MutationObserver(schedule);
  observer.observe(root.document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "style", "hidden", "data-taxon-id"] });
  const timer = root.setInterval?.(scan, 1200);
  root.addEventListener?.("leafwise:cv-combined-scores", schedule);
  root.addEventListener?.("pagehide", () => {
    observer.disconnect(); root.clearInterval?.(timer);
    root.removeEventListener?.("leafwise:cv-combined-scores", schedule);
  }, { once: true });
  scan();
})(globalThis);
