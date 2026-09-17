(function (root) {
  "use strict";
  if (root.LeafwiseVisionScoreStyle) return;

  function score(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : null;
  }

  function mix(a, b, ratio) {
    return a.map((value, index) => Math.round(value + (b[index] - value) * ratio));
  }

  function color(value) {
    const normalized = score(value);
    if (normalized === null) return "";
    const low = [166, 67, 62], middle = [157, 105, 25], high = [42, 119, 74];
    const channels = normalized < 50
      ? mix(low, middle, normalized / 50)
      : mix(middle, high, (normalized - 50) / 50);
    return `rgb(${channels.join(", ")})`;
  }

  function clearRow(row) {
    row?.classList?.remove("leafwise-ai-score-row");
    row?.style?.removeProperty("--leafwise-score-accent");
    row?.style?.removeProperty("border-left");
    row?.style?.removeProperty("border-radius");
  }

  function ensureStyles(doc) {
    if (!doc?.createElement || doc.getElementById?.("leafwise-vision-score-css")) return;
    const sheet = doc.createElement("style");
    sheet.id = "leafwise-vision-score-css";
    sheet.textContent = ".leafwise-ai-score-row{position:relative!important}" +
      ".leafwise-ai-score-row::before{content:'';position:absolute;z-index:1;inset-block:0;" +
      "inset-inline-start:0;width:3px;border-radius:2px;background:var(--leafwise-score-accent);pointer-events:none}";
    (doc.head || doc.documentElement)?.append(sheet);
  }

  function decorate(result, row, value) {
    const normalized = score(value);
    if (normalized === null) {
      clearRow(row);
      result?.querySelector?.(".leafwise-ai-score")?.remove();
      return null;
    }
    const accent = color(normalized);
    ensureStyles(result?.ownerDocument || root.document);
    row?.classList?.add("leafwise-ai-score-row");
    row?.style?.setProperty("--leafwise-score-accent", accent);
    row?.style?.removeProperty("border-left");
    let badge = result?.querySelector?.(".leafwise-ai-score");
    if (!badge) {
      const ownerDocument = result?.ownerDocument || root.document;
      if (!ownerDocument?.createElement) return null;
      badge = ownerDocument.createElement("span");
      badge.className = "leafwise-ai-score";
    }
    badge.style.cssText =
      "all:initial;display:inline-flex!important;align-items:center;justify-content:center;" +
      "flex:0 0 auto!important;min-width:46px;height:24px;box-sizing:border-box!important;" +
      "margin:0 7px;padding:0 8px;border-radius:7px!important;" +
      `background:${accent}!important;color:#fff;font:600 13px/1 Arial,sans-serif;` +
      "font-variant-numeric:tabular-nums;letter-spacing:.1px;white-space:nowrap;vertical-align:middle;";
    const text = normalized.toFixed(1);
    const description = `綜合評分 ${text} / 100（視覺＋地點與日期；不是正確率）`;
    badge.setAttribute("aria-label", description);
    badge.setAttribute("title", description);
    if (badge.textContent !== text) badge.textContent = text;
    const view = result.querySelector?.(".ac-view") || Array.from(result.querySelectorAll?.("a") || [])
      .find(link => /查看|檢視|view/i.test((link.textContent || "").trim()));
    if (view) view.before(badge);
    else if (!badge.parentElement) (result.querySelector?.(".ac-label") || result).append(badge);
    return badge;
  }

  root.LeafwiseVisionScoreStyle = Object.freeze({ score, color, clearRow, decorate, ensureStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.LeafwiseVisionScoreStyle;
})(globalThis);
