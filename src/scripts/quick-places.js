/* Saved place groups on the observation search page; no automatic filters. */
(() => {
  "use strict";
  const filters = globalThis.QGInatFilters;
  const tools = globalThis.LeafwiseExploreTools;
  const core = globalThis.QGInatHigherTaxa;
  if (!tools || !core || !filters?.isSearchPage(location.href) || globalThis.LeafwiseQuickPlaces) return;
  // Also guard injection before the native heading has been mounted.
  globalThis.LeafwiseQuickPlaces = true;
  const t = (text, ...values) => globalThis.LeafwiseI18n?.t(text, ...values) ?? text;
  const host = document.createElement("span");
  host.id = "leafwise-quick-places";
  host.dir = /^(ar|he|fa)(-|$)/.test(globalThis.LeafwiseI18n?.locale() || "") ? "rtl" : "ltr";
  const shadow = host.attachShadow({mode:"open"});
  shadow.innerHTML = `<style>
    :host {display:inline-flex;max-width:100%;margin-inline-start:8px;vertical-align:middle;color-scheme:light}
    :host([hidden]) {display:none}
    select {box-sizing:border-box;max-width:100%;width:220px;padding:3px 9px;border:1px solid #a9b99d;border-radius:6px;background:#f4f7f1;color:#49613d;font:12px/1.4 system-ui,sans-serif;cursor:pointer}
    select:focus-visible {outline:3px solid #83af53;outline-offset:2px}
    .status {color:#963d20;font:12px/1.4 system-ui,sans-serif;margin-inline-start:6px}
  </style><select></select><span class="status" role="status" aria-live="polite"></span>`;
  const select = shadow.querySelector("select");
  const status = shadow.querySelector(".status");
  select.setAttribute("aria-label", t("快速選擇地點組合…"));
  let groups = [], href = "", revision = 0, readToken = 0;

  function refresh() {
    select.replaceChildren(new Option(t("快速選擇地點組合…"), ""), new Option(t("全球"), "any"));
    for (const group of groups) select.add(new Option(group.name, group.id));
    select.add(new Option(t("管理常用地區…"), "settings"));
    const params = new URL(location.href).searchParams;
    const bounded = ["swlat", "swlng", "nelat", "nelng", "lat", "lng", "radius"].some(key => params.has(key));
    const place = params.get("place_id") || "any";
    let canonical = null;
    try { canonical = core.placeIDs(place).join(","); } catch { /* Keep the native/custom scope. */ }
    select.value = bounded ? "" : canonical === "" ? "any" : groups.find(group => group.place === canonical)?.id || "";
  }
  select.addEventListener("change", async () => {
    const chosen = select.value;
    status.textContent = "";
    if (!chosen) return;
    try {
      if (chosen === "settings") {
        refresh();
        const reply = await chrome.runtime.sendMessage({type:"qg-open-options"});
        if (!reply?.ok) throw new Error(reply?.error || t("無法讀取收藏。"));
      } else {
        const place = chosen === "any" ? "any" : groups.find(group => group.id === chosen)?.place;
        const next = tools.placeSearchURL(location.href, place, core);
        if (next !== location.href) location.assign(next);
      }
    } catch (error) {
      refresh();
      status.textContent = globalThis.LeafwiseI18n?.legacy(error.message) ?? error.message;
    }
  });
  function mount() {
    host.hidden = !filters.isSearchPage(location.href);
    if (host.hidden) return;
    const heading = document.querySelector("#filters > h1, #filters h1");
    // Do not reorder sibling Leafwise controls on each observer callback.
    if (heading && host.parentElement !== heading) heading.append(host);
    if (href !== location.href) { href = location.href; refresh(); }
  }
  function storageChanged(changes, area) {
    if (area !== "local" || !changes.leafwiseExploreLibraryV1) return;
    revision++;
    groups = changes.leafwiseExploreLibraryV1.newValue?.groups || [];
    if (!Array.isArray(groups)) groups = [];
    status.textContent = "";
    refresh(); // Saving/editing choices never applies one to the page.
  }
  chrome.storage.onChanged.addListener(storageChanged);
  function readLibrary() {
    const token = ++readToken, readRevision = revision;
    chrome.runtime.sendMessage({type:"leafwise-explore-library",action:"list"}).then(reply => {
      if (token !== readToken || readRevision !== revision) return;
      if (!reply?.ok || !Array.isArray(reply.library?.groups)) throw new Error(reply?.error || t("無法讀取收藏。"));
      groups = reply.library.groups;
      status.textContent = "";
      refresh();
    }).catch(error => {
      if (token === readToken && readRevision === revision) status.textContent = globalThis.LeafwiseI18n?.legacy(error.message) ?? error.message;
    });
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  });
  observer.observe(document.body, {childList:true,subtree:true});
  setInterval(mount, 750);
  window.addEventListener("popstate", mount);
  window.addEventListener("pagehide", () => { readToken++; });
  window.addEventListener("pageshow", event => { if (event.persisted) { readLibrary(); mount(); } });
  readLibrary();
  mount();
})();
