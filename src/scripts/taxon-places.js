/* Taxon-page single-place shortcuts; saved groups are never modified. */
(function (root) {
  "use strict";
  function taxonPage(href) {
    try {
      const url = new URL(href);
      return url.protocol === "https:" && !url.port && !url.username && !url.password
        && ["www.inaturalist.org", "inaturalist.org"].includes(url.hostname)
        && /^\/taxa\/[1-9]\d*(?:-[^/]*)?\/?$/.test(url.pathname);
    } catch { return false; }
  }
  function singlePlaces(groups) {
    const seen = new Set();
    return (Array.isArray(groups) ? groups.slice(0, 50) : []).flatMap(group => {
      const id = group?.place;
      if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)
        || !Number.isSafeInteger(Number(id)) || seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: typeof group.name === "string" && group.name.trim() ? group.name : id }];
    });
  }
  function preferenceRequest(href, place, csrf) {
    if (!taxonPage(href) || typeof csrf !== "string" || !csrf.trim() || csrf.length > 4096 || /[\r\n]/.test(csrf)
      || !(place === "any" || typeof place === "string" && /^[1-9]\d*$/.test(place) && Number.isSafeInteger(Number(place)))) {
      throw new Error("Invalid taxon place preference");
    }
    const body = new FormData();
    body.append("authenticity_token", csrf);
    // Match iNaturalist's updateSession / clearPlace (FormData turns null into "null").
    body.append("preferred_taxon_page_place_id", place === "any" ? "null" : place);
    return { url: new URL("/users/update_session", href).href,
      init: { method: "PUT", credentials: "same-origin", mode: "same-origin", redirect: "error", body } };
  }
  const api = { taxonPage, singlePlaces, preferenceRequest };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  if (!taxonPage(location.href) || !root.LeafwiseTaxonStatus || root.LeafwiseTaxonPlaces) return;
  root.LeafwiseTaxonPlaces = true;
  const t = (text, ...values) => globalThis.LeafwiseI18n.t(text, ...values);
  const host = document.createElement("span");
  host.id = "leafwise-taxon-places";
  host.dir = /^(ar|he|fa)(-|$)/.test(root.LeafwiseI18n?.locale() || "") ? "rtl" : "ltr";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host{display:inline-flex;position:relative;vertical-align:middle;margin-inline-start:8px;max-width:100%;color-scheme:light}
    :host([hidden]){display:none}
    select{box-sizing:border-box;min-width:0;width:132px;max-width:32vw;height:28px;padding:2px 7px;border:1px solid #a9b99d;border-radius:6px;background:#f4f7f1;color:#49613d;font:12px/1.4 system-ui,sans-serif;cursor:pointer}
    select:focus-visible{outline:3px solid #83af53;outline-offset:2px}
    select:disabled{cursor:wait;opacity:.7}
    #status{position:absolute;inset-inline-end:0;top:100%;z-index:10;width:max-content;max-width:260px;white-space:normal;background:white;color:#915315;font:12px/1.4 system-ui,sans-serif}
    #status:empty{display:none}
  </style><select id="place-choice" disabled></select><span id="status" role="status" aria-live="polite"></span>`;
  const select = shadow.querySelector("select"), status = shadow.querySelector("#status");
  select.setAttribute("aria-label", t("常用地点"));
  let choices = [], loaded = false, active = true, busy = false;
  let revision = 0, readToken = 0, generation = 0, scope = "", current = undefined, pending = null, optionKey = "";
  const nativePlace = () => root.LeafwiseTaxonStatus.selectedTaxonPlace(document, location.href);
  const placeChooser = () => taxonPage(location.href) ? document.querySelector("#place-chooser-container") : null;
  function signature(container) {
    const trigger = container?.querySelector(".PlaceChooserPopoverTrigger");
    // The chooser exists even when the observation panel renders no links.
    // Use the native label only to detect changes, never to infer a place ID.
    return trigger ? JSON.stringify([location.href, trigger.classList.contains("chosen"), trigger.textContent.trim()]) : "";
  }
  function refresh() {
    const key = JSON.stringify([t("常用地点"), t("全球"), t("管理常用地區…"), choices]);
    if (key !== optionKey) {
      optionKey = key;
      select.replaceChildren(new Option(t("常用地点"), ""), new Option(t("全球"), "any"));
      choices.forEach(place => select.add(new Option(place.name, place.id)));
      select.add(new Option(t("管理常用地區…"), "settings"));
      select.setAttribute("aria-label", t("常用地点"));
    }
    const value = current === null ? "any" : choices.some(place => place.id === String(current)) ? String(current) : "";
    if (select.value !== value) select.value = value;
    select.disabled = !loaded || busy || !scope;
  }
  function cancel() {
    generation++;
    pending?.abort(); pending = null;
    busy = false;
  }
  function untilAborted(promise, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new Error("Cancelled"));
      if (signal.aborted) { abort(); return; }
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  function mount() {
    if (!active) return;
    const container = placeChooser();
    // Native remounts can clone the old light-DOM host without its shadow tree.
    document.querySelectorAll("#leafwise-taxon-places").forEach(node => { if (node !== host) node.remove(); });
    const next = signature(container);
    if (scope !== next) {
      if (busy) status.textContent = "";
      cancel();
      scope = next;
    }
    host.hidden = !container;
    if (container && host.parentElement !== container) container.append(host);
    else if (!container) host.remove();
    current = container ? nativePlace() : undefined;
    refresh();
  }
  select.addEventListener("change", async () => {
    const chosen = select.value;
    status.textContent = "";
    if (!chosen || busy || !active || !taxonPage(location.href)) return;
    if (chosen === "settings") {
      refresh();
      try {
        const reply = await chrome.runtime.sendMessage({ type: "qg-open-options" });
        if (!reply?.ok) throw new Error();
      } catch { status.textContent = t("无法打开设置，请点击浏览器工具栏中的扩展图标。"); }
      return;
    }
    if (chosen !== "any" && !choices.some(place => place.id === chosen)) { refresh(); return; }
    if (chosen === (current === null ? "any" : String(current))) { refresh(); return; }
    const identity = signature(placeChooser()), version = revision;
    if (!identity || identity !== scope) { mount(); return; }
    const token = ++generation;
    const live = () => active && token === generation && version === revision && signature(placeChooser()) === identity;
    busy = true; select.disabled = true; status.textContent = t("正在保存…");
    const controller = new AbortController(); pending = controller;
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
      preferenceRequest(location.href, chosen, csrf);
      // Validate the saved ID using the existing public API transport before
      // touching the native preference; a deleted/malformed place must not become global.
      if (chosen !== "any") {
        const reply = await untilAborted(chrome.runtime.sendMessage({ type: "leafwise-taxon-place", placeId: Number(chosen) }), controller.signal);
        if (!reply?.ok || reply.place?.id !== Number(chosen)) throw new Error();
      }
      if (!live() || controller.signal.aborted) throw new Error();
      const request = preferenceRequest(location.href, chosen, document.querySelector('meta[name="csrf-token"]')?.content);
      const response = await untilAborted(fetch(request.url, { ...request.init, signal: controller.signal }), controller.signal);
      if (!response.ok || response.status !== 204) throw new Error();
      if (!live() || controller.signal.aborted) return;
      // Reload the SAME taxon/tab/hash after the native preference is saved.
      // No private Redux access, no fake place_id URL that the page would ignore.
      location.reload();
    } catch {
      if (live()) status.textContent = t("请求失败，请稍后重试。");
    } finally {
      clearTimeout(timeout);
      if (token === generation) { pending = null; busy = false; refresh(); }
    }
  });
  function storageChanged(changes, area) {
    if (area !== "local" || !changes.leafwiseExploreLibraryV1) return;
    revision++; cancel();
    choices = singlePlaces(changes.leafwiseExploreLibraryV1.newValue?.groups);
    loaded = true; status.textContent = ""; refresh();
  }
  function readLibrary() {
    const token = ++readToken, version = revision;
    chrome.runtime.sendMessage({ type: "leafwise-explore-library", action: "list" }).then(reply => {
      if (!active || token !== readToken || version !== revision) return;
      if (!reply?.ok || !Array.isArray(reply.library?.groups)) throw new Error();
      choices = singlePlaces(reply.library.groups); loaded = true;
      status.textContent = ""; refresh();
    }).catch(() => {
      if (active && token === readToken && version === revision) status.textContent = t("读取设置失败，请刷新页面重试。");
    });
  }
  // A subsequent native choice or navigation wins over a late shortcut reply.
  function nativeInteraction(event) {
    if (!busy || event.composedPath().includes(host)) return;
    if (event.target?.closest?.("#place-chooser-container, .PlaceChooserPopover")) {
      cancel(); status.textContent = ""; refresh();
    }
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!active || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  });
  function connect() {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "class"] });
  }
  chrome.storage.onChanged.addListener(storageChanged);
  document.addEventListener("click", nativeInteraction, true);
  document.addEventListener("input", nativeInteraction, true);
  window.addEventListener("popstate", mount);
  let timer = setInterval(mount, 750);
  window.addEventListener("pagehide", () => { active = false; readToken++; cancel(); clearInterval(timer); observer.disconnect(); host.remove(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted) { active = true; timer = setInterval(mount, 750); connect(); readLibrary(); mount(); }
  });
  // The low-frequency timer only detects remounts; it never makes requests.
  connect(); readLibrary(); mount();
})(globalThis);
