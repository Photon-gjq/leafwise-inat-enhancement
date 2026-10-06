/* Compact Observations / Identify toolbar: saved places/taxa; explicit filters only. */
(() => {
  "use strict";
  const tools = globalThis.LeafwiseExploreTools;
  const core = globalThis.QGInatHigherTaxa;
  const savedTaxa = globalThis.QGInatSavedTaxa;
  if (!tools || !core || !savedTaxa || !tools.quickSearchPage(location.href) || globalThis.LeafwiseQuickPlaces) return;
  // Also guard injection before the native heading has been mounted.
  globalThis.LeafwiseQuickPlaces = true;
  const t = (text, ...values) => globalThis.LeafwiseI18n?.t(text, ...values) ?? text;
  const host = document.createElement("div");
  host.id = "leafwise-quick-places";
  host.dir = /^(ar|he|fa)(-|$)/.test(globalThis.LeafwiseI18n?.locale() || "") ? "rtl" : "ltr";
  const shadow = host.attachShadow({mode:"open"});
  shadow.innerHTML = `<style>
    :host {display:flex;clear:both;align-items:center;flex-wrap:wrap;gap:6px;max-width:100%;margin:8px 0 0;color-scheme:light}
    :host([data-page="identify"]) {margin:-12px 0 20px}
    :host([data-placement="stats"]) {position:absolute;inset:7px 15px auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:28px 28px;gap:5px 6px;margin:0;pointer-events:none;--leafwise-trigger-background:#484f42;--leafwise-trigger-color:#fff;--leafwise-trigger-border:#afbe97}
    :host([data-placement="stats"]) slot {display:block;grid-column:1 / -1;justify-self:end;max-width:50%;pointer-events:auto}
    :host([data-placement="stats"]) select {width:100%;height:28px;pointer-events:auto;background:#484f42;color:#fff;border-color:#afbe97}
    :host([data-placement="stats"]) option {background:#fff;color:#333}
    :host([data-placement="stats"]) .status {position:absolute;top:100%;inset-inline-start:0;z-index:5;max-width:100%;white-space:normal;background:#fff;padding:4px;border-radius:4px;pointer-events:auto}
    :host([data-aligned]) {display:block;position:relative;height:28px}
    :host([data-aligned]) select {position:absolute;top:0;height:28px;width:var(--field-width);left:var(--field-left)}
    :host([data-aligned]) .status {position:relative;top:30px}
    :host([hidden]) {display:none}
    slot {display:contents}
    select {box-sizing:border-box;min-width:0;max-width:100%;width:180px;flex:0 1 180px;padding:3px 9px;border:1px solid #a9b99d;border-radius:6px;background:#f4f7f1;color:#49613d;font:12px/1.4 system-ui,sans-serif;cursor:pointer}
    select:focus-visible {outline:3px solid #83af53;outline-offset:2px}
    .status {color:#963d20;font:12px/1.4 system-ui,sans-serif;margin-inline-start:6px}
    .status:empty {display:none}
    @media (max-width:600px) {select {flex:1 1 140px}}
  </style><slot name="comparison-trigger"></slot><select id="taxon-choice"></select><select id="place-choice"></select><span id="taxa-status" class="status" role="status" aria-live="polite"></span><span id="place-status" class="status" role="status" aria-live="polite"></span>`;
  const select = shadow.querySelector("#place-choice");
  const status = shadow.querySelector("#place-status");
  const taxonSelect = shadow.querySelector("#taxon-choice");
  const taxaStatus = shadow.querySelector("#taxa-status");
  // Scope the only native style adjustment to the statistics place column.
  // Keep its Angular spans/clear controls intact; no React/Angular reparenting.
  const statsStyle = document.createElement("style");
  statsStyle.textContent = `
    #stats-container .col-xs-4[data-leafwise-shortcuts] {position:relative;overflow:visible}
    #stats-container .col-xs-4[data-leafwise-shortcuts] > .geo {display:inline-block;vertical-align:top;line-height:28px;margin-top:7px;max-width:calc(50% - 3px);overflow:hidden;text-overflow:ellipsis}
    #stats-container .col-xs-4[data-leafwise-shortcuts] > .geo.selected {position:relative;box-sizing:border-box;line-height:24px;padding:0 22px 0 4px}
    #stats-container .col-xs-4[data-leafwise-shortcuts] > .geo.selected > .glyphicon-remove-sign {position:absolute;inset-inline-end:4px;top:7px;background:#565656}
  `;
  host.append(statsStyle);
  let statsColumn = null, resizeTargets = [];
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => scheduleMount()) : null;
  function observeLayout(targets) {
    if (targets.length === resizeTargets.length && targets.every((target, index) => target === resizeTargets[index])) return;
    resizeObserver?.disconnect();
    resizeTargets = targets;
    for (const target of targets) resizeObserver?.observe(target);
  }
  function alignIdentify(searchBar) {
    const taxon = searchBar.querySelector('.TaxonAutocomplete input[type="search"], input[name="taxon_name"], input[type="search"]');
    const place = searchBar.querySelector('input[name="place_name"]');
    observeLayout([searchBar.parentElement, searchBar, taxon, place].filter(Boolean));
    const fields = [taxon, place].map(field => field?.getBoundingClientRect());
    if (fields.some(box => !box?.width)) { delete host.dataset.aligned; return; }
    host.dataset.aligned = "";
    const origin = host.getBoundingClientRect().left;
    for (const [index, control] of [taxonSelect, select].entries()) {
      control.style.setProperty("--field-left", `${fields[index].left - origin}px`);
      control.style.setProperty("--field-width", `${fields[index].width}px`);
    }
  }
  select.setAttribute("aria-label", t("快速選擇地點組合…"));
  taxonSelect.setAttribute("aria-label", t("选择常用类群"));
  let groups = [], taxa = [], scope = "", revision = 0, readToken = 0, taxaRevision = 0, taxaReadToken = 0;

  function nativePlace() {
    // Identify omits the account's preferred place from its URL. Read only the
    // public hidden input, never React state, to avoid labelling it worldwide.
    return tools.quickSearchPage(location.href) === "identify"
      ? document.querySelector('#Identify .SearchBar input[name="place_id"]')?.value || "" : "";
  }

  function refresh() {
    select.replaceChildren(new Option(t("快速選擇地點組合…"), ""), new Option(t("全球"), "any"));
    for (const group of groups) select.add(new Option(group.name, group.id));
    select.add(new Option(t("管理常用地區…"), "settings"));
    const params = new URL(location.href).searchParams;
    const bounded = ["swlat", "swlng", "nelat", "nelng", "lat", "lng", "radius"].some(key => params.has(key));
    const place = params.get("place_id") || nativePlace() || "any";
    let canonical = null;
    try { canonical = core.placeIDs(place).join(","); } catch { /* Keep the native/custom scope. */ }
    select.value = bounded ? "" : canonical === "" ? "any" : groups.find(group => group.place === canonical)?.id || "";
    taxonSelect.replaceChildren(new Option(t("常用类群"), ""), new Option(t("不限"), "any"));
    for (const taxon of taxa) {
      const name = taxon.name || t("类群 {0}", taxon.id);
      const label = taxon.withoutTaxonIds ? `${name} · ${t("排除 {0}", taxon.withoutTaxonIds.join(","))}` : name;
      taxonSelect.add(new Option(label, `taxon:${savedTaxa.key(taxon)}`));
    }
    taxonSelect.add(new Option(t("管理常用类群…"), "settings"));
    const currentTaxon = params.get("taxon_id");
    let currentKey = null;
    try {
      if (currentTaxon) currentKey = savedTaxa.key({id:currentTaxon, withoutTaxonIds:params.getAll("without_taxon_id").join(",")});
    } catch { /* Native/custom taxon scopes remain unselected, not rewritten. */ }
    const match = taxa.find(taxon => savedTaxa.key(taxon) === currentKey);
    taxonSelect.value = currentTaxon ? match ? `taxon:${currentKey}` : "" : params.get("without_taxon_id") ? "" : "any";
  }
  async function openSettings() {
    const reply = await chrome.runtime.sendMessage({type:"qg-open-options"});
    if (!reply?.ok) throw new Error(t("无法打开设置，请点击浏览器工具栏中的扩展图标。"));
  }
  select.addEventListener("change", async () => {
    const chosen = select.value;
    status.textContent = "";
    if (!chosen) return;
    try {
      if (chosen === "settings") {
        refresh();
        await openSettings();
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
  taxonSelect.addEventListener("change", async () => {
    const chosen = taxonSelect.value;
    taxaStatus.textContent = "";
    if (!chosen) return;
    try {
      if (chosen === "settings") { refresh(); await openSettings(); }
      else {
        const taxon = chosen === "any" ? "any" : taxa.find(item => `taxon:${savedTaxa.key(item)}` === chosen);
        const next = tools.taxonSearchURL(location.href, taxon, savedTaxa);
        if (next !== location.href) location.assign(next);
      }
    } catch (error) {
      refresh();
      taxaStatus.textContent = globalThis.LeafwiseI18n?.legacy(error.message) ?? error.message;
    }
  });
  function mount() {
    const page = tools.quickSearchPage(location.href);
    const searchBar = page === "identify" ? document.querySelector("#Identify .SearchBar") : null;
    const nextColumn = page === "observations" ? document.querySelector("#stats-container .row > .col-xs-4") : null;
    if (statsColumn !== nextColumn) {
      statsColumn?.removeAttribute("data-leafwise-shortcuts");
      statsColumn = nextColumn;
    }
    host.hidden = !page || page === "identify" && (!searchBar || searchBar.classList.contains("disabled") || document.querySelector("#Identify.blind"));
    if (host.hidden) { observeLayout([]); return; }
    host.dataset.page = page;
    host.dataset.placement = statsColumn ? "stats" : "fallback";
    statsColumn?.setAttribute("data-leafwise-shortcuts", "");
    const container = page === "identify" ? searchBar.parentElement : statsColumn || document.querySelector("#filters");
    // The real search page has a fixed-height statistics column. Keep all
    // shortcuts there, leaving the native white header at its original height.
    // If upstream omits it, retain the previous safe standalone fallback.
    if (container && (host.parentElement !== container || page === "identify" && searchBar.nextElementSibling !== host)) {
      if (page === "identify") searchBar.after(host);
      else container.append(host);
    }
    if (page === "identify") alignIdentify(searchBar);
    else { delete host.dataset.aligned; observeLayout(statsColumn ? [statsColumn] : []); }
    const nextScope = `${location.href}|${nativePlace()}`;
    if (scope !== nextScope) { scope = nextScope; refresh(); }
  }
  function storageChanged(changes, area) {
    if (area === "local" && changes.leafwiseExploreLibraryV1) {
      revision++;
      groups = changes.leafwiseExploreLibraryV1.newValue?.groups || [];
      if (!Array.isArray(groups)) groups = [];
      status.textContent = "";
      refresh(); // Saving/editing choices never applies one to the page.
    }
    if (area === "sync" && changes.savedTaxa) {
      taxaRevision++;
      try {
        taxa = savedTaxa.read({savedTaxa:changes.savedTaxa.newValue});
        taxaStatus.textContent = "";
        refresh();
      } catch (error) { taxaStatus.textContent = globalThis.LeafwiseI18n?.legacy(error.message) ?? error.message; }
    }
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
  function readTaxa() {
    const token = ++taxaReadToken, readRevision = taxaRevision;
    chrome.storage.sync.get(savedTaxa.storageKeys).then(data => {
      if (token !== taxaReadToken || readRevision !== taxaRevision) return;
      taxa = savedTaxa.read(data);
      taxaStatus.textContent = "";
      refresh();
    }).catch(error => {
      if (token === taxaReadToken && readRevision === taxaRevision) taxaStatus.textContent = globalThis.LeafwiseI18n?.legacy(error.message) ?? error.message;
    });
  }
  let scheduled = false;
  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  }
  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.body, {childList:true,subtree:true});
  setInterval(mount, 750);
  window.addEventListener("popstate", mount);
  window.addEventListener("resize", scheduleMount);
  document.fonts?.ready.then(scheduleMount);
  window.addEventListener("pagehide", () => { readToken++; taxaReadToken++; });
  window.addEventListener("pageshow", event => { if (event.persisted) { readLibrary(); readTaxa(); mount(); } });
  readLibrary();
  readTaxa();
  mount();
})();
