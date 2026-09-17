(function (root) {
  const MARKER_ID = "qg-inat-own-taxon-status";
  const YOURS_MARKER_CLASS = "qg-inat-yours-count";
  const TAXONOMY_MARKER_CLASS = "qg-inat-taxonomy-status";
  const TAXONOMY_ROOT_SELECTOR = [
    "#taxonomy", "#taxon_tree", "#taxon-tree",
    ".TaxonomicBranch", ".taxon_tree", ".taxon-tree",
    ".Taxonomy", ".TaxonTree", ".TaxonTaxonomy",
    "[id*='taxonomy' i]", "[class*='Taxonomy']", "[class*='TaxonTree']",
    "[data-testid*='taxonomy' i]", "[data-tab='taxonomy']"
  ].join(",");
  const OBSERVATION_TAXON_SELECTORS = [
    ".ObservationShow .TaxonSummary a[href*='/taxa/']", ".ObservationShow .TaxonSummary a[data-taxon-id]",
    ".ObservationShow .taxon-summary a[href*='/taxa/']", ".ObservationShow .taxon-summary a[data-taxon-id]",
    ".observation-show .taxon a[href*='/taxa/']", ".observation-show .taxon a[data-taxon-id]",
    ".observation-taxon a[href*='/taxa/']", ".observation-taxon a[data-taxon-id]",
    ".ObservationShow a[href*='/taxa/']", ".ObservationShow a[data-taxon-id]",
    ".observation-show a[href*='/taxa/']", ".observation-show a[data-taxon-id]",
    "[data-testid*='observation' i] a[href*='/taxa/']", "[data-testid*='observation' i] a[data-taxon-id]",
    "a.taxon-name[href*='/taxa/']", "a.taxon-name[data-taxon-id]",
    "h1 a[href*='/taxa/']", "h1 a[data-taxon-id]", "h2 a[href*='/taxa/']", "h2 a[data-taxon-id]"
  ];

  function pageInfo(href) {
    const url = new URL(href);
    let match = url.pathname.match(/^\/observations\/(\d+)\/?$/);
    if (match) return { kind: "observation", id: Number(match[1]) };
    match = url.pathname.match(/^\/taxa\/(\d+)(?:-[^/]*)?\/?$/);
    if (match) return { kind: "taxon", id: Number(match[1]), taxonId: Number(match[1]) };
    return null;
  }

  function userInfoFromHrefs(observationsHref, profileHrefs, baseHref) {
    if (!observationsHref) return null;
    const observationsURL = new URL(observationsHref, baseHref);
    const loginMatch = observationsURL.pathname.match(/^\/observations\/([^/]+)\/?$/);
    if (!loginMatch) return null;
    const username = decodeURIComponent(loginMatch[1]).trim();
    let userId = null;
    for (const href of profileHrefs || []) {
      const match = new URL(href, baseHref).pathname.match(/^\/people\/(\d+)\/?$/);
      if (match) { userId = Number(match[1]); break; }
    }
    return username && Number.isSafeInteger(userId) && userId > 0 ? { username, userId } : null;
  }

  function loggedInUser(doc, href) {
    const observationsLink = doc.querySelector(".navtab.user a.observations_link[href]");
    const profileLinks = Array.from(doc.querySelectorAll(".navtab.user a.profile_link[href]"), link => link.getAttribute("href"));
    return userInfoFromHrefs(observationsLink?.getAttribute("href"), profileLinks, href);
  }

  function ownObservationsURL(pageHref, username, taxonId) {
    const url = new URL("/observations", pageHref);
    url.searchParams.set("user_id", username);
    url.searchParams.set("taxon_id", String(taxonId));
    url.searchParams.set("verifiable", "any");
    return url.toString();
  }

  function taxonIdFromHref(href, baseHref) {
    try {
      const match = new URL(href, baseHref).pathname.match(/^\/taxa\/(\d+)(?:-[^/]*)?\/?$/);
      return match ? Number(match[1]) : null;
    } catch { return null; }
  }

  function taxonIdFromElement(element, baseHref) {
    const hrefID = taxonIdFromHref(element?.getAttribute?.("href"), baseHref);
    if (hrefID) return hrefID;
    const numeric = Number(element?.getAttribute?.("data-taxon-id") || element?.getAttribute?.("data-taxonid"));
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
  }

  function observationTaxonLinks(doc, baseHref) {
    for (const selector of OBSERVATION_TAXON_SELECTORS) {
      const links = Array.from(doc.querySelectorAll(selector)).filter(link => taxonIdFromElement(link, baseHref));
      if (links.length) return links;
    }
    return Array.from(doc.querySelectorAll("a[href*='/taxa/'],a[data-taxon-id],a[data-taxonid]")).filter(link => {
      if (!taxonIdFromElement(link, baseHref) || link.closest?.("nav,header,footer") || link.closest?.(TAXONOMY_ROOT_SELECTOR)) return false;
      return typeof link.getClientRects !== "function" || link.getClientRects().length > 0;
    });
  }

  function currentObservationTaxonId(doc, baseHref) {
    const links = observationTaxonLinks(doc, baseHref);
    const link = links.find(candidate => candidate.matches?.("a.taxon-name")) || links[0];
    return link ? taxonIdFromElement(link, baseHref) : null;
  }

  function mainObservationTaxonLink(doc, taxonId, baseHref) {
    let links = observationTaxonLinks(doc, baseHref).filter(link => taxonIdFromElement(link, baseHref) === taxonId);
    if (!links.length) {
      links = Array.from(doc.querySelectorAll("a[href*='/taxa/'],a[data-taxon-id],a[data-taxonid]"))
        .filter(link => taxonIdFromElement(link, baseHref) === taxonId);
    }
    if (!links.length) return null;
    const firstParent = links[0].parentElement;
    return links.filter(link => link.parentElement === firstParent).at(-1) || links[0];
  }

  function taxonTitle(doc) {
    for (const selector of ["#taxon_page h1", ".taxon-page h1", "#taxon-show h1", "main h1", "h1"]) {
      const title = doc.querySelector(selector); if (title) return title;
    }
    return null;
  }

  function createPriorityQueue(worker, concurrency = 3) {
    const high = [];
    const normal = [];
    const known = new Set();
    let active = 0;
    const pump = () => {
      while (active < concurrency && (high.length || normal.length)) {
        const task = high.shift() || normal.shift();
        active++;
        Promise.resolve(worker(task)).catch(() => {}).finally(() => {
          active--;
          pump();
        });
      }
    };
    return {
      enqueue(task, priority = "normal") {
        const key = task.key ?? task;
        if (known.has(key)) return false;
        known.add(key);
        (priority === "high" ? high : normal).push(task);
        pump();
        return true;
      }
    };
  }

  function orderTaxonomyEntries(entries, ancestorIds) {
    const ancestorPosition = new Map(ancestorIds.map((id, index) => [Number(id), index]));
    const descendants = [];
    const ancestors = [];
    for (const entry of entries) {
      if (ancestorPosition.has(entry.taxonId)) ancestors.push(entry);
      else descendants.push(entry);
    }
    ancestors.sort((a, b) => ancestorPosition.get(b.taxonId) - ancestorPosition.get(a.taxonId));
    return { descendants, ancestors };
  }

  function taxonomyRoots(doc) {
    const roots = Array.from(doc.querySelectorAll(TAXONOMY_ROOT_SELECTOR));
    for (const heading of doc.querySelectorAll("h2,h3,h4,h5,.panel-heading,.section-header")) {
      if (!/^(taxonomy|分类学)$/i.test(heading.textContent?.trim() || "")) continue;
      const root = heading.closest?.(".panel,section,article,.tab-pane") || heading.parentElement;
      if (root) roots.push(root);
    }
    for (const control of doc.querySelectorAll("a[aria-controls],button[aria-controls]")) {
      if (!/^(taxonomy|分类学)$/i.test(control.textContent?.trim() || "")) continue;
      const id = control.getAttribute("aria-controls");
      const root = id && doc.getElementById(id);
      if (root) roots.push(root);
    }
    return [...new Set(roots)];
  }

  function taxonomyEntries(doc, currentTaxonId, ancestorIds, baseHref = location.href) {
    const byTaxon = new Map();
    let order = 0;
    for (const root of taxonomyRoots(doc)) {
      for (const link of root.querySelectorAll("a[href*='/taxa/']")) {
        const taxonId = taxonIdFromHref(link.getAttribute("href"), baseHref);
        if (!taxonId || taxonId === currentTaxonId || !link.textContent?.trim()) continue;
        if (typeof link.getClientRects === "function" && link.getClientRects().length === 0) continue;
        const row = link.closest?.(".SplitTaxon,.name-row,.row-content,li") || link.parentElement;
        if (row?.querySelector?.(`.${TAXONOMY_MARKER_CLASS}`)) continue;
        const existing = byTaxon.get(taxonId);
        if (existing) existing.link = link;
        else byTaxon.set(taxonId, { key: link, link, taxonId, order: order++ });
      }
    }
    return orderTaxonomyEntries([...byTaxon.values()], ancestorIds);
  }

  function makeTaxonomyMarker(doc, count, href, username) {
    const marker = count > 0 ? doc.createElement("a") : doc.createElement("span");
    marker.className = TAXONOMY_MARKER_CLASS;
    marker.textContent = count > 0 ? `(${count})` : "🆕";
    marker.title = count > 0 ? `${username} 全球已观察 ${count} 次；点击查看` : `${username} 尚未观察过该分类单元`;
    marker.style.marginLeft = "0.35em";
    marker.style.whiteSpace = "nowrap";
    if (count > 0) {
      marker.href = href;
      marker.style.color = "#4f772d";
      marker.style.textDecoration = "none";
    }
    return marker;
  }

  function taxonomyRow(link) {
    return link.closest?.(".SplitTaxon,.name-row,.row-content,li") || link.parentElement;
  }

  function placeTaxonomyMarker(doc, entry, count, user) {
    if (entry.link.isConnected === false) return false;
    const row = taxonomyRow(entry.link);
    if (row?.querySelector?.(`.${TAXONOMY_MARKER_CLASS}`)) return true;
    const browseHref = ownObservationsURL(location.href, user.username, entry.taxonId);
    entry.link.after(makeTaxonomyMarker(doc, count, browseHref, user.username));
    return true;
  }

  function placeCurrentTaxonomyStatus(doc, currentTaxonId, count, browseHref, username) {
    for (const root of taxonomyRoots(doc)) {
      const target = root.querySelector([
        "li.current > .row-content .SplitTaxon a.secondary-name",
        "li.current > .row-content .name-row a.secondary-name",
        "li.current > .row-content .SplitTaxon a:last-child"
      ].join(","));
      if (!target) continue;
      const row = taxonomyRow(target);
      if (!row?.querySelector?.(`.${TAXONOMY_MARKER_CLASS}`)) {
        target.after(makeTaxonomyMarker(doc, count, browseHref, username));
      }
      return true;
    }
    return false;
  }

  function watchTaxonomyStatuses(doc, user, currentTaxonId, currentCount, currentBrowseHref, ancestorIds, isActive = () => true) {
    const queue = createPriorityQueue(async entry => {
      if (!isActive() || entry.link.isConnected === false) return;
      const row = taxonomyRow(entry.link);
      if (row?.querySelector?.(`.${TAXONOMY_MARKER_CLASS}`)) return;
      const result = await chrome.runtime.sendMessage({
        type: "qg-taxon-observation-count",
        userId: user.userId,
        taxonId: entry.taxonId
      });
      if (!isActive() || !result?.ok || !Number.isSafeInteger(result.count) || result.count < 0 || entry.link.isConnected === false) return;
      if (row?.querySelector?.(`.${TAXONOMY_MARKER_CLASS}`)) return;
      placeTaxonomyMarker(doc, entry, result.count, user);
    }, 3);
    const seenLinks = new Set();
    let scanning = false;
    let rescanRequested = false;
    const scan = async () => {
      if (!isActive()) return;
      if (scanning) {
        rescanRequested = true;
        return;
      }
      scanning = true;
      try {
        placeCurrentTaxonomyStatus(doc, currentTaxonId, currentCount, currentBrowseHref, user.username);
        const entries = taxonomyEntries(doc, currentTaxonId, ancestorIds);
        const descendants = entries.descendants.filter(entry => !seenLinks.has(entry.link));
        const ancestors = entries.ancestors.filter(entry => !seenLinks.has(entry.link));
        const fresh = [...descendants, ...ancestors];
        fresh.forEach(entry => seenLinks.add(entry.link));
        let cachedCounts = {};
        if (fresh.length) {
          const cachedResult = await chrome.runtime.sendMessage({
            type: "qg-cached-taxon-observation-counts",
            userId: user.userId,
            taxonIds: fresh.map(entry => entry.taxonId)
          });
          if (!isActive()) return;
          if (cachedResult?.ok && cachedResult.counts && typeof cachedResult.counts === "object") {
            cachedCounts = cachedResult.counts;
          }
        }
        for (const entry of fresh) {
          const count = Number(cachedCounts[entry.taxonId]);
          if (Object.hasOwn(cachedCounts, entry.taxonId) && Number.isSafeInteger(count) && count >= 0) {
            placeTaxonomyMarker(doc, entry, count, user);
          }
        }
        for (const entry of descendants) {
          if (!Object.hasOwn(cachedCounts, entry.taxonId)) queue.enqueue(entry, "high");
        }
        for (const entry of ancestors) {
          if (!Object.hasOwn(cachedCounts, entry.taxonId)) queue.enqueue(entry);
        }
      } finally {
        scanning = false;
        if (rescanRequested) {
          rescanRequested = false;
          scan();
        }
      }
    };
    scan();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scan();
      });
    });
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"]
    });
    return () => observer.disconnect();
  }

  function countRequestFromHref(href, user, taxonId, baseHref) {
    try {
      const url = new URL(href, baseHref);
      if (url.pathname !== "/observations" || url.searchParams.get("taxon_id") !== String(taxonId)) return null;
      const linkUser = url.searchParams.get("user_id");
      if (linkUser !== user.username && linkUser !== String(user.userId)) return null;
      const endpoint = url.searchParams.get("view") === "species" ? "species_counts" : "observations";
      const params = { user_id: user.userId, taxon_id: taxonId };
      const verifiable = url.searchParams.get("verifiable");
      const place = url.searchParams.get("place_id");
      const rank = url.searchParams.get("rank");
      if (verifiable) params.verifiable = verifiable;
      if (place && place !== "any") params.place_id = place;
      if (rank) params.rank = rank;
      return { endpoint, params };
    } catch { return null; }
  }

  function nativeYoursLinks(doc, user, taxonId) {
    return Array.from(doc.querySelectorAll("a[href*='/observations']")).filter(link => {
      if (link.id === MARKER_ID || link.className === TAXONOMY_MARKER_CLASS) return false;
      return Boolean(countRequestFromHref(link.getAttribute("href"), user, taxonId, location.href));
    });
  }

  function isTitleCountRequest(request) {
    return request.endpoint === "observations"
      && request.params.verifiable === "any"
      && !request.params.place_id
      && !request.params.rank;
  }

  function watchYoursCounts(doc, user, taxonId, titleCount, isActive = () => true) {
    const processed = new Map();
    const requests = new Map();
    const requestKey = request => {
      const params = Object.keys(request.params).sort().map(key => [key, request.params[key]]);
      return JSON.stringify([request.endpoint, params]);
    };
    const scan = () => {
      if (!isActive()) return;
      for (const link of nativeYoursLinks(doc, user, taxonId)) {
        const request = countRequestFromHref(link.getAttribute("href"), user, taxonId, location.href);
        if (!request) continue;
        const key = requestKey(request);
        const previousKey = processed.get(link);
        const existingMarker = link.querySelector(`.${YOURS_MARKER_CLASS}`);
        if (previousKey === key) continue;
        if (existingMarker) existingMarker.remove();
        processed.set(link, key);
        let countPromise = requests.get(key);
        if (!countPromise) {
          countPromise = isTitleCountRequest(request)
            ? Promise.resolve(titleCount)
            : chrome.runtime.sendMessage({
              type: "qg-scoped-observation-count",
              endpoint: request.endpoint,
              params: request.params
            }).then(result => result?.ok ? result.count : null);
          requests.set(key, countPromise);
        }
        countPromise.then(count => {
          if (!isActive() || !Number.isSafeInteger(count) || count <= 0 || link.isConnected === false) return;
          const latest = countRequestFromHref(link.getAttribute("href"), user, taxonId, location.href);
          if (!latest || requestKey(latest) !== key || processed.get(link) !== key) return;
          if (link.querySelector(`.${YOURS_MARKER_CLASS}`)) return;
          const marker = doc.createElement("span");
          marker.className = YOURS_MARKER_CLASS;
          marker.textContent = `: ${count}`;
          link.append(marker);
        }).catch(() => {});
      }
    };
    scan();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scan();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    return () => observer.disconnect();
  }

  function makeTitleMarker(doc, count, href, username) {
    const marker = count > 0 ? doc.createElement("a") : doc.createElement("span");
    marker.id = MARKER_ID;
    marker.textContent = count > 0 ? `(${count})` : "🆕";
    marker.title = count > 0 ? `${username} 全球已观察 ${count} 次；点击查看` : `${username} 尚未观察过该分类单元`;
    marker.style.marginLeft = "0.35em";
    marker.style.whiteSpace = "nowrap";
    if (count > 0) {
      marker.href = href;
      marker.style.color = "#4f772d";
      marker.style.textDecoration = "none";
    }
    return marker;
  }

  function attachRecords(marker, user, taxonId, browseHref, count) {
    marker.title = `${user.username} 已記錄 ${count} 次；點擊查看首次與最近紀錄`;
    marker.setAttribute("aria-expanded", "false");
    marker.addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      const old = document.getElementById("leafwise-personal-records");
      if (old) { old.remove(); marker.setAttribute("aria-expanded", "false"); return; }
      const host=document.createElement("div");host.id="leafwise-personal-records";
      const shadow=host.attachShadow({mode:"open"});
      shadow.innerHTML=`<style>:host{position:fixed;z-index:10000;width:min(360px,calc(100vw - 32px));color-scheme:light;font:14px/1.5 system-ui,sans-serif;color:#293524}*{box-sizing:border-box}.card{background:#f5f8f0;border:1px solid #95a58b;border-radius:6px;padding:14px;box-shadow:0 4px 18px #0002;max-height:calc(100vh - 32px);overflow:auto}header{display:flex;justify-content:space-between;align-items:center;gap:12px}button{font:inherit;background:white;border:1px solid #95a58b;border-radius:4px;cursor:pointer;padding:4px 9px;color:inherit}a{color:#496f29}p{margin:8px 0}.muted{font-size:12px;color:#607056}.error{color:#963d20}[hidden]{display:none!important}</style><section class="card" role="region" aria-label="我的紀錄"><header><strong>我的紀錄</strong><button id="close" type="button" aria-label="關閉我的紀錄">×</button></header><p id="status" role="status" aria-live="polite">正在讀取首次與最近紀錄…</p><div id="records"></div><button id="retry" type="button" hidden>重試</button><p id="all"></p><p class="muted">按觀察日期排序，包含此類群及後代；未填日期的觀察不參與排序。只讀取公開可見資料，快取 5 分鐘。</p></section>`;
      document.body.append(host);marker.setAttribute("aria-expanded","true");
      const rect=marker.getBoundingClientRect();
      host.style.left=`${Math.max(16,Math.min(rect.left,innerWidth-376))}px`;
      host.style.top=`${Math.max(16,Math.min(rect.bottom+8,innerHeight-340))}px`;
      shadow.querySelector(".card").style.maxHeight=`${Math.max(80,innerHeight-parseFloat(host.style.top)-16)}px`;
      const close=()=>{host.remove();marker.setAttribute("aria-expanded","false");if(marker.isConnected)marker.focus();};
      shadow.querySelector("#close").addEventListener("click",close);
      shadow.addEventListener("keydown",event=>{if(event.key==="Escape"){event.stopPropagation();close();}});
      const all=document.createElement("a");all.href=browseHref;all.textContent=`查看我的全部 ${count} 筆觀察`;shadow.querySelector("#all").append(all);
      async function load() {
        const status=shadow.querySelector("#status"),retry=shadow.querySelector("#retry");retry.hidden=true;status.className="";status.textContent="正在讀取首次與最近紀錄…";
        try {
          const reply=await chrome.runtime.sendMessage({type:"leafwise-personal-records",userId:user.userId,taxonId});
          if(!host.isConnected||!marker.isConnected)return;
          if(!reply?.ok)throw new Error(reply?.error||"無法讀取個人紀錄。");
          const data=reply.result;status.textContent=`${user.username} · 有日期的觀察 ${data.datedCount} 筆`;
          const body=shadow.querySelector("#records");body.replaceChildren();
          for(const [label,item] of [["首次",data.first],["最近",data.latest]]) {
            const p=document.createElement("p");p.textContent=label+"：";
            if(item){const a=document.createElement("a");a.href=`https://www.inaturalist.org/observations/${item.id}`;a.textContent=item.date;a.target="_blank";a.rel="noopener noreferrer";p.append(a,document.createElement("br"),document.createTextNode(item.place));}
            else p.append(document.createTextNode("沒有可排序的日期紀錄"));
            body.append(p);
          }
        }catch(error){if(host.isConnected){status.textContent=error.message;status.className="error";retry.hidden=false;}}
      }
      shadow.querySelector("#retry").addEventListener("click",load);
      shadow.querySelector("#close").focus({preventScroll:true});load();
    });
  }

  function placeStatus(doc, info, user, taxonId, count, browseHref) {
    if (info.kind === "observation") {
      const currentTaxonId = currentObservationTaxonId(doc, location.href);
      if (!currentTaxonId || currentTaxonId !== taxonId) return false;
    }
    let titleReady = Boolean(doc.getElementById(MARKER_ID));
    if (!titleReady) {
      const target = info.kind === "taxon" ? taxonTitle(doc) : mainObservationTaxonLink(doc, taxonId, location.href);
      if (target) {
        const titleMarker = makeTitleMarker(doc, count, browseHref, user.username);
        if(count>0)attachRecords(titleMarker,user,taxonId,browseHref,count);
        if (info.kind === "taxon") target.append(titleMarker);
        else {
          const targetStyle = globalThis.getComputedStyle?.(target);
          if (targetStyle?.fontSize) titleMarker.style.fontSize = targetStyle.fontSize;
          if (targetStyle?.lineHeight) titleMarker.style.lineHeight = targetStyle.lineHeight;
          target.after(titleMarker);
        }
        titleReady = true;
      }
    }

    return titleReady;
  }

  async function run(isActive = () => true, registerCleanup = () => {}, forceCount = false) {
    const info = pageInfo(location.href);
    if (!info) return;
    const user = loggedInUser(document, location.href);
    if (!user) return;
    let taxonId = info.taxonId;
    if (!taxonId) {
      taxonId = currentObservationTaxonId(document, location.href);
      if (!taxonId) {
        const result = await chrome.runtime.sendMessage({ type: "qg-observation-taxon", observationId: info.id });
        if (!isActive() || !result?.ok || !result.taxonId) return;
        taxonId = result.taxonId;
      }
    }
    const result = await chrome.runtime.sendMessage({ type: "qg-taxon-observation-count", userId: user.userId, taxonId, force: forceCount });
    if (!isActive() || !result?.ok || !Number.isSafeInteger(result.count) || result.count < 0) return;
    const browseHref = ownObservationsURL(location.href, user.username, taxonId);
    let statusScheduled = false;
    const ensureStatus = () => {
      if (statusScheduled || !isActive()) return;
      statusScheduled = true;
      requestAnimationFrame(() => {
        statusScheduled = false;
        if (info.kind === "observation" && currentObservationTaxonId(document, location.href) !== taxonId) return;
        if (isActive()) placeStatus(document, info, user, taxonId, result.count, browseHref);
      });
    };
    placeStatus(document, info, user, taxonId, result.count, browseHref);
    const statusObserver = new MutationObserver(ensureStatus);
    statusObserver.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["href", "data-taxon-id", "data-taxonid"] });
    registerCleanup(() => statusObserver.disconnect());
    if (info.kind === "taxon") {
      registerCleanup(watchYoursCounts(document, user, taxonId, result.count, isActive));
      const ancestorsResult = await chrome.runtime.sendMessage({ type: "qg-taxon-ancestors", taxonId });
      if (!isActive()) return;
      const ancestorIds = ancestorsResult?.ok && Array.isArray(ancestorsResult.ancestorIds)
        ? ancestorsResult.ancestorIds.map(Number).filter(Number.isSafeInteger)
        : [];
      registerCleanup(watchTaxonomyStatuses(document, user, taxonId, result.count, browseHref, ancestorIds, isActive));
    }
  }

  function pageIdentity(href) {
    const info = pageInfo(href);
    return info ? `${info.kind}:${info.id}` : "";
  }

  function clearStatusMarkers(doc) {
    for (const marker of doc.querySelectorAll(`#${MARKER_ID},.${YOURS_MARKER_CLASS},.${TAXONOMY_MARKER_CLASS},#leafwise-personal-records`)) marker.remove();
  }

  function startPageController() {
    let identity = null;
    let observationTaxonId = null;
    let generation = 0;
    let cleanups = [];
    const clearRun = () => {
      generation++;
      cleanups.forEach(cleanup => cleanup());
      cleanups = [];
      clearStatusMarkers(document);
    };
    const check = () => {
      const next = pageIdentity(location.href);
      const info = pageInfo(location.href);
      const detectedTaxonId = info?.kind === "observation" ? currentObservationTaxonId(document, location.href) : null;
      let forceCount = false;
      if (next === identity) {
        if (info?.kind === "observation" && detectedTaxonId && detectedTaxonId !== observationTaxonId) {
          forceCount = Boolean(observationTaxonId);
          observationTaxonId = detectedTaxonId;
        } else return;
      }
      identity = next;
      observationTaxonId = detectedTaxonId;
      clearRun();
      if (!next) return;
      const current = generation;
      const active = () => current === generation && pageIdentity(location.href) === next;
      const register = cleanup => {
        if (typeof cleanup !== "function") return;
        if (active()) cleanups.push(cleanup);
        else cleanup();
      };
      run(active, register, forceCount).catch(() => {});
    };
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; check(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["href", "data-taxon-id", "data-taxonid"] });
    if (typeof setInterval === "function") setInterval(check, 500);
    globalThis.addEventListener?.("popstate", check);
    globalThis.addEventListener?.("hashchange", check);
    check();
  }

  const api = {
    pageInfo, userInfoFromHrefs, ownObservationsURL, taxonIdFromHref, currentObservationTaxonId,
    createPriorityQueue, orderTaxonomyEntries, taxonomyEntries, countRequestFromHref,
    pageIdentity, clearStatusMarkers
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else startPageController();
})(globalThis);
