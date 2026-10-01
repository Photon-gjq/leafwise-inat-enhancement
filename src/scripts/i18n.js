/* Presentation only. Never translate API data, user input, or native site DOM. */
(function (root) {
  "use strict";
  if (root.LeafwiseI18n) return;
  const data = root.LeafwiseTranslations || { locales: {}, source: {} };
  const LAST_LOCALE_KEY = "leafwiseLastSiteLocale";
  let optionsLocale = null;

  function normalize(value) {
    const parts = String(value || "").replaceAll("_", "-").toLowerCase().split("-");
    if (parts[0] === "iw") parts[0] = "he";
    if (parts[0] === "zh") {
      if (parts.includes("hk")) return "zh-HK";
      if (parts.includes("hant") || parts.includes("tw") || parts.includes("mo")) return "zh-TW";
      return "zh-CN";
    }
    const exact = Object.keys(data.locales).find(code => code.toLowerCase() === parts.join("-"));
    return exact || (Object.hasOwn(data.locales, parts[0]) ? parts[0] : "en");
  }
  function siteLocale(doc = root.document) {
    // iNaturalist's server template sets <html lang> and Content-Language.
    // Browser language must not override an unsupported but explicit site locale.
    return doc?.documentElement?.getAttribute("lang")?.trim()
      || doc?.querySelector('meta[http-equiv="Content-Language" i]')?.content?.trim()
      || "en";
  }
  function locale() { return optionsLocale || normalize(siteLocale()); }
  function message(source) {
    const key = Object.hasOwn(data.source, source) ? data.source[source] : String(source ?? "");
    const code = locale();
    for (const catalog of [data.locales[code], data.locales[code.split("-")[0]]]) {
      if (catalog && Object.hasOwn(catalog, key)) return catalog[key];
    }
    return key;
  }
  function t(source, ...values) {
    return message(source).replace(/\{(\d+)\}/g, (placeholder, index) =>
      Number(index) < values.length ? String(values[index] ?? "") : placeholder);
  }

  // Called only at the creation of a constant extension-owned HTML template.
  // No MutationObserver, innerHTML rewriting of live forms, or site-wide scan.
  function translateStatic(container) {
    const doc = container.ownerDocument || root.document;
    const walker = doc.createTreeWalker(container, 4 /* SHOW_TEXT */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest("style,script,textarea,[data-i18n-skip]")) continue;
      const text = node.nodeValue;
      const key = text.trim();
      if (key && (Object.hasOwn(data.source, key) || Object.hasOwn(data.locales.en || {}, key))) {
        node.nodeValue = text.replace(key, () => message(key));
      }
    }
    for (const element of container.querySelectorAll("[title],[aria-label],[placeholder]")) {
      if (element.closest("[data-i18n-skip]")) continue;
      for (const name of ["title", "aria-label", "placeholder"]) {
        const value = element.getAttribute(name);
        if (value && (Object.hasOwn(data.source, value) || Object.hasOwn(data.locales.en || {}, value))) {
          element.setAttribute(name, message(value));
        }
      }
    }
  }
  function html(source) {
    const template = root.document.createElement("template");
    template.innerHTML = source;
    translateStatic(template.content);
    // Set direction on our own template roots, never on iNaturalist's DOM.
    for (const element of template.content.children) {
      if (element.tagName !== "STYLE") element.dir = ["ar", "he", "fa"].includes(locale()) ? "rtl" : "ltr";
    }
    return template.innerHTML;
  }

  // Core/service error contracts are left unchanged. Recognize only our known
  // messages, preserving inserted IDs/names and unknown native error details.
  const patterns = Object.entries(data.source).filter(([source]) => /\{\d+\}/.test(source))
    .sort((a, b) => b[0].length - a[0].length).map(([source]) => {
      const slots = [];
      const expression = source.split(/(\{\d+\})/).map(part => {
        const slot = part.match(/^\{(\d+)\}$/);
        if (slot) { slots.push(Number(slot[1])); return "([\\s\\S]*?)"; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }).join("");
      return { source, slots, regexp: new RegExp(`^${expression}$`) };
    });
  function legacy(value, depth = 0) {
    const text = String(value ?? "");
    if (Object.hasOwn(data.source, text)) return t(text);
    if (depth > 3) return text;
    for (const pattern of patterns) {
      const match = text.match(pattern.regexp);
      if (!match) continue;
      const values = [];
      pattern.slots.forEach((slot, index) => { values[slot] = legacy(match[index + 1], depth + 1); });
      return t(pattern.source, ...values);
    }
    // Uploader decision reasons concatenate a score prefix with a fixed
    // outcome. Split only known prefixes; do not translate arbitrary data.
    for (const source of ["首選綜合分數不可讀；", "首選綜合分數 {0} 未超過 {1}；"]) {
      const prefix = patterns.find(pattern => pattern.source === source);
      const end = text.indexOf("；");
      if (end < 0) continue;
      const head = text.slice(0, end + 1);
      if (head === source || prefix?.regexp.test(head)) return legacy(head, depth + 1) + legacy(text.slice(end + 1), depth + 1);
    }
    return text;
  }
  async function initializeOptions(api = root.chrome) {
    let previous;
    try { previous = (await api?.storage?.local?.get(LAST_LOCALE_KEY))?.[LAST_LOCALE_KEY]; } catch { /* Use the browser fallback. */ }
    optionsLocale = normalize(previous || api?.i18n?.getUILanguage?.() || root.navigator?.language || "en");
    root.document.documentElement.lang = optionsLocale;
    root.document.documentElement.dir = ["ar", "he", "fa"].includes(optionsLocale) ? "rtl" : "ltr";
    translateStatic(root.document);
    return optionsLocale;
  }
  function rememberSiteLocale(api = root.chrome) {
    // MAIN-world scripts have no extension API; the all-site isolated script
    // remembers the language once for the settings page. No account data saved.
    if (!api?.runtime?.id || !api?.storage?.local || !/^https:\/\/(www\.)?inaturalist\.org\//.test(root.location?.href || "")) return;
    const remember = () => {
      const code = normalize(siteLocale());
      api.storage.local.get(LAST_LOCALE_KEY).then(saved => {
        if (saved?.[LAST_LOCALE_KEY] !== code) return api.storage.local.set({ [LAST_LOCALE_KEY]: code });
      }).catch(() => {});
    };
    remember();
    const observer = new root.MutationObserver(remember);
    observer.observe(root.document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    root.addEventListener?.("pagehide", () => observer.disconnect(), { once: true });
  }
  const api = Object.freeze({ t, html, legacy, normalize, locale, siteLocale, translateStatic, initializeOptions, rememberSiteLocale, LAST_LOCALE_KEY });
  root.LeafwiseI18n = api;
  if (typeof module !== "undefined" && module.exports && !root.document) module.exports = api;
  if (root.document) rememberSiteLocale();
})(globalThis);
