(function (root) {
  "use strict";
  const core = root.LeafwiseUploadCore;
  const cardSelector = ".ObsCardComponent .card[data-id]";
  const cards = () => Array.from(document.querySelectorAll(cardSelector));
  const key = card => card.getAttribute("data-id");
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
  }
  function open(card) {
    if (!editable(card)) throw new Error("卡片已移除、上傳中或尚未就緒");
    for (const other of cards()) if (other !== card && visible(menu(other))) close(other);
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
    } else {
      if (filled(card)) throw new Error("無法讀取建議元件，已保留原分類");
      field.focus({ preventScroll: true });
      field.click();
    }
  }
  function read(card, decorate = false) {
    const list = menu(card);
    if (!visible(list)) return null;
    const items = [];
    let confident = false, section = 0, confidentDOM = false;
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
      let value = null, ancestor = confidentDOM && section === 1;
      // Copy only these primitives. Ignore unrelated jQuery state and functions.
      try {
        if (raw && raw.id === id && raw.isVisionResult === true) {
          ancestor = raw.isCommonAncestor === true;
          value = core.score(raw.visionScore);
        }
      } catch { /* Fall back to the visible official category structure. */ }
      if (ancestor) confident = true;
      const name = (result.querySelector(".title")?.textContent || result.textContent).trim().slice(0,250);
      const item = { id, name, vision: true, ancestor, score: value };
      items.push(item);
      if (decorate) {
        let badge = result.querySelector(".leafwise-ai-score");
        if (!badge) {
          badge = document.createElement("span"); badge.className = "leafwise-ai-score";
          badge.style.cssText = "display:block;font:12px/1.5 sans-serif;color:#48692e;margin-top:3px";
          (result.querySelector(".ac-label") || result).append(badge);
        }
        const text = ancestor ? "官方確定的上階類群；不代表下方物種同樣確定"
          : value === null ? "Leafwise：視覺分數不可讀"
            : `Leafwise 視覺分數：${value.toFixed(2)} / 100（非正確率）`;
        if (badge.textContent !== text) badge.textContent = text;
      }
    }
    if (!items.length && /not confident|没有足够|沒有足夠|没有信心|沒有信心/i.test(list.textContent)) return { items: [], confident: false };
    return items.length ? { items, confident: confident || confidentDOM } : null;
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
  root.LeafwiseUploadAdapter = { cards, key, find, input, taxonID, filled, signature, editable, hasPhoto, menu, visible, open, close, read, click };
})(globalThis);
