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

  function values(value) {
    if (typeof value === "number") return { combined: score(value), vision: null };
    return { combined: score(value?.combined), vision: score(value?.vision) };
  }

  function clearRow(row) {
    row?.classList?.remove("leafwise-ai-score-row");
    row?.style?.removeProperty("--leafwise-score-accent");
    row?.style?.removeProperty("border-left");
    row?.style?.removeProperty("border-radius");
  }

  function ensureStyles(doc) {
    // Remove the stylesheet used by the older chip-and-row-accent treatment if
    // this script is re-evaluated in a long-lived page during development.
    doc?.getElementById?.("leafwise-vision-score-css")?.remove?.();
  }

  function decorate(result, row, value) {
    const pair = values(value);
    if (pair.combined === null) {
      clearRow(row);
      result?.querySelector?.(".leafwise-ai-score")?.remove();
      return null;
    }
    const accent = color(pair.combined);
    ensureStyles(result?.ownerDocument || root.document);
    clearRow(row);
    let badge = result?.querySelector?.(".leafwise-ai-score");
    if (!badge) {
      const ownerDocument = result?.ownerDocument || root.document;
      if (!ownerDocument?.createElement) return null;
      badge = ownerDocument.createElement("span");
      badge.className = "leafwise-ai-score";
    }
    badge.style.cssText =
      "all:initial;display:inline-block!important;flex:0 0 auto!important;align-self:center!important;min-width:34px;" +
      "box-sizing:border-box!important;margin:0 8px;padding:0!important;border:0!important;" +
      "border-radius:0!important;box-shadow:none!important;background:transparent!important;" +
      `color:${accent}!important;font:700 15px/1.2 Arial,sans-serif;` +
      "font-variant-numeric:tabular-nums;text-align:right;letter-spacing:.1px;" +
      "white-space:nowrap;vertical-align:middle;";
    const combinedText = pair.combined.toFixed(1);
    const visionText = pair.vision === null ? null : pair.vision.toFixed(1);
    const text = `${combinedText}${visionText === null ? "" : `(${visionText})`}`;
    const description = visionText === null
      ? `綜合評分 ${combinedText} / 100（視覺＋地點與日期；不是正確率）`
      : `綜合評分 ${combinedText} / 100；括號內為視覺評分 ${visionText} / 100（兩者都不是正確率）`;
    badge.setAttribute("aria-label", description);
    badge.setAttribute("title", description);
    if (badge.textContent !== text) badge.textContent = text;
    const view = result.querySelector?.(".ac-view") || Array.from(result.querySelectorAll?.("a") || [])
      .find(link => /查看|檢視|view/i.test((link.textContent || "").trim()));
    if (view) view.before(badge);
    else if (!badge.parentElement) (result.querySelector?.(".ac-label") || result).append(badge);
    return badge;
  }

  root.LeafwiseVisionScoreStyle = Object.freeze({ score, color, values, clearRow, decorate, ensureStyles });
  if (typeof module !== "undefined" && module.exports) module.exports = root.LeafwiseVisionScoreStyle;
})(globalThis);
