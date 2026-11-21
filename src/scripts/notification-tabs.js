(() => {
  "use strict";
  const t = (text, ...values) => globalThis.LeafwiseI18n?.t(text, ...values) ?? text.replace(/\{(\d+)\}/g, (_, i) => String(values[i] ?? ""));
  const rules = globalThis.LeafwiseNotificationFilter;
  const queueRules = globalThis.LeafwiseNotificationQueue;
  const FILTER_KEY = "leafwiseNotificationFilterV1", ROW_CLASS = "leafwise-open-update-observations";
  const menu = document.querySelector("#updatesnav #updatessubnav");
  if (!menu || !rules || !queueRules || menu.dataset.leafwiseNotifications) return;
  menu.dataset.leafwiseNotifications = "1";
  let enabled = false, preferenceChanged = false, busy = false, stopped = false;
  let currentViewer, queue = null, signature = "", blockedSignature = null, generation = 0, mutations = 0;
  let queueError = false, queueFull = false, lifecycle = 0, status = "", clearStatusTimer, viewerTimer;
  const outcomes = new Map(), pending = new Set(), hiddenRows = new Map();
  let linkGeneration = 0;
  const linkResults = new Map(), pendingLinks = new Set(), linkControllers = new Set();

  function viewerId() {
    for (const link of document.querySelectorAll(".navtab.user a.profile_link[href]")) {
      let url;
      try { url = new URL(link.href, location.href); } catch { continue; }
      const match = url.origin === location.origin && /^\/people\/([1-9]\d*)\/?$/.exec(url.pathname);
      if (match && Number.isSafeInteger(Number(match[1]))) return Number(match[1]);
    }
    return null;
  }
  function rows() {
    return [...menu.querySelectorAll(":scope > ul:not([data-leafwise-queue]) > li > a[href]")].map(link => ({
      row: link.parentElement, link,
      ...(rules.observationLink(link.href, location.href) || rules.flagLink(link.href, location.href) || {})
    }));
  }
  function captureEntries() {
    return rows().flatMap(({ link }) => {
      try {
        const item = queueRules.event({ href: link.href });
        if (!new URL(item.href).hash) {
          // Rails has no update ID for favorites/resolved flags. Fingerprint
          // the tagline, excluding compact_date (which changes overnight).
          // Neither message text nor the compact date is stored.
          const copy = link.cloneNode(true);
          copy.querySelectorAll(".small.meta, time").forEach(node => node.remove());
          let hash = 14695981039346656037n;
          for (const char of copy.textContent.trim().slice(0, 4000)) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0))) * 1099511628211n);
          item.stamp = hash.toString(16).padStart(16, "0");
        }
        return [item];
      } catch { return []; }
    });
  }
  async function request(action, fields = {}, viewer = currentViewer) {
    const epoch = lifecycle;
    const reply = await chrome.runtime.sendMessage({ type: "leafwise-notification-queue", action, viewerId: viewer, ...fields });
    if (!reply?.ok || !reply.queue) throw new Error("Queue unavailable");
    if (!stopped && epoch === lifecycle && viewer === currentViewer && viewerId() === viewer && (!queue || reply.queue.revision >= queue.revision)) {
      queue = reply.queue;
      if (action === "capture") queueFull = reply.full === true;
    }
    return reply;
  }
  function mutate(action, fields = {}) {
    const viewer = currentViewer;
    const epoch = lifecycle;
    mutations++;
    return request(action, fields, viewer).then(reply => {
      if (epoch === lifecycle && viewer === currentViewer && !stopped) queueError = false;
      return reply;
    }).catch(error => {
      if (epoch === lifecycle && viewer === currentViewer && !stopped) queueError = true;
      throw error;
    }).finally(() => {
      if (epoch === lifecycle && viewer === currentViewer && !stopped) { mutations--; refresh(); }
    });
  }
  function restoreRow(row) {
    const saved = hiddenRows.get(row);
    row.hidden = saved.hidden;
    if (saved.display) row.style.setProperty("display", saved.display, saved.priority);
    else row.style.removeProperty("display");
    hiddenRows.delete(row);
  }
  function restoreRows() { for (const row of [...hiddenRows.keys()]) restoreRow(row); }
  function resetLinks() {
    linkGeneration++;
    for (const controller of linkControllers) controller.abort();
    linkControllers.clear(); pendingLinks.clear(); linkResults.clear();
  }
  async function resolveLinks(urls, token, viewer) {
    urls.forEach(url => pendingLinks.add(url));
    const controller = new AbortController();
    linkControllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 10000);
    let next = 0;
    const worker = async () => {
      while (!stopped && token === linkGeneration && next < urls.length) {
        const url = urls[next++];
        let result = null;
        try {
          const response = await fetch(url, { credentials: "omit", signal: controller.signal });
          void response.body?.cancel().catch(() => {});
          const direct = rules.observationLink(response.url, location.href) || rules.flagLink(response.url, location.href);
          if (direct?.observationId) result = "/observations/" + direct.observationId;
          else if (direct?.flagId) result = "/flags/" + direct.flagId;
          else if (new URL(response.url).origin === location.origin && /^\/(journal|posts|taxa|trips|taxon_links)\//.test(new URL(response.url).pathname)) result = false;
        } catch { /* Keep the native read-only permalink when resolution fails. */ }
        if (stopped || token !== linkGeneration || viewerId() !== viewer) return;
        linkResults.set(url, result); pendingLinks.delete(url);
      }
    };
    try {
      await Promise.all([worker(), worker()]);
      if (stopped || token !== linkGeneration || viewerId() !== viewer) return;
      const entries = (queue?.entries || []).filter(item => !item.opened && item.target === undefined).flatMap(item => {
        const url = rules.activityLink(item.href, location.href), target = linkResults.get(url);
        return url && target != null ? [{ ...item, target }] : [];
      });
      if (entries.length) await mutate("resolve", { entries });
    } catch { /* mutate exposes the storage error and disables opening. */ }
    finally {
      clearTimeout(timer); linkControllers.delete(controller);
      if (!stopped && token === linkGeneration) refresh();
    }
  }
  async function checkBatch(ids, token, viewer) {
    ids.forEach(id => pending.add(id));
    try {
      const reply = await chrome.runtime.sendMessage({ type: "leafwise-update-identifications", observationIds: ids });
      if (stopped || token !== generation || viewerId() !== viewer) return;
      for (const id of ids) outcomes.set(id, reply?.ok ? reply.observations?.[id] : null);
    } catch {
      if (!stopped && token === generation) ids.forEach(id => outcomes.set(id, null));
    } finally {
      if (!stopped && token === generation) { ids.forEach(id => pending.delete(id)); refresh(); }
    }
  }
  function classification(item) {
    const direct = rules.observationLink(item.href, location.href);
    return direct?.identification ? rules.classify(outcomes.get(direct.observationId), direct.identification, currentViewer) : null;
  }
  function eligible() { return queueRules.groups(queue?.entries || [], item => !enabled || classification(item) !== "confirming"); }
  function locked() { return busy || mutations > 0 || pendingLinks.size > 0 || (enabled && pending.size > 0); }
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  async function openTargets(targets) {
    refresh();
    if (locked() || queueError || !queue || !currentViewer || !targets.length) return;
    const allowed = eligible();
    targets = targets.filter(path => allowed.has(path)).slice(0, queue.batchSize);
    if (!targets.length) return;
    const viewer = currentViewer;
    const epoch = lifecycle;
    busy = true; status = ""; clearTimeout(clearStatusTimer); refresh();
    try {
      const reply = await mutate("open", { targets });
      if (epoch === lifecycle && viewer === currentViewer && viewerId() === viewer && !stopped) status = reply.failedTargets.length
        ? t("已開啟 {0} 個；其餘未能開啟", reply.openedTargets.length) : t("已開啟 {0} 個頁面", reply.openedTargets.length);
    } catch { /* Keep the queue and expose retry. */ }
    finally {
      if (epoch === lifecycle && viewer === currentViewer && !stopped) {
        if (queueFull) signature = "";
        busy = false; refresh(); clearStatusTimer = setTimeout(() => { status = ""; refresh(); }, 4000);
      }
    }
  }
  function controls(list) {
    let row = list.querySelector(":scope > li." + ROW_CLASS);
    if (row) return row;
    row = document.createElement("li"); row.className = ROW_CLASS;
    row.style.cssText = "text-align:center;padding:8px 12px;border-top:1px solid #eee;white-space:normal";
    row.addEventListener("click", event => event.stopPropagation());
    row.innerHTML = '<label style="display:flex;align-items:center;justify-content:center;gap:6px;font-weight:normal;cursor:pointer;margin:0 0 8px"><input type="checkbox" class="leafwise-notification-filter" style="margin:0;flex:none"><span></span></label>'
      + '<label class="leafwise-notification-batch-label" style="display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;font-weight:normal;margin:0 0 8px"><span></span><input class="leafwise-notification-batch" type="number" min="1" max="50" step="1" style="width:64px;max-width:100%;color:#333;background:#fff;border:1px solid #aaa;border-radius:3px;padding:3px"></label>'
      + '<button type="button" class="btn btn-default btn-sm leafwise-notification-open" style="max-width:100%;white-space:normal"></button>'
      + '<div class="leafwise-notification-count" style="font-size:12px;margin-top:6px"></div>'
      + '<div class="leafwise-notification-filter-status" style="font-size:12px;margin-top:4px"></div>'
      + '<div class="leafwise-notification-status" role="status" style="font-size:12px;margin-top:4px"></div>'
      + '<button type="button" class="btn btn-default btn-sm leafwise-notification-retry" style="margin-top:6px"></button>'
      + '<details class="leafwise-notification-list" style="margin-top:8px;text-align:start"><summary style="cursor:pointer;text-align:center"></summary><ol style="max-height:180px;overflow:auto;padding-inline-start:24px"></ol></details>'
      + '<button type="button" class="btn btn-default btn-sm leafwise-notification-clear" style="margin-top:6px;max-width:100%;white-space:normal"></button>';
    const checkbox = row.querySelector(".leafwise-notification-filter");
    checkbox.addEventListener("change", () => {
      preferenceChanged = true; enabled = checkbox.checked; generation++; outcomes.clear(); pending.clear(); restoreRows();
      try { chrome.storage.local.set({ [FILTER_KEY]: enabled }).catch(() => {}); } catch {}
      refresh();
    });
    row.querySelector(".leafwise-notification-batch").addEventListener("change", event => {
      const value = Number(event.target.value);
      if (!Number.isInteger(value) || value < 1 || value > 50) { status = t("請輸入 1 至 50 的整數。"); refresh(); return; }
      status = ""; void mutate("size", { batchSize: value }).catch(() => {}); refresh();
    });
    row.querySelector(".leafwise-notification-open").addEventListener("click", () => void openTargets([...eligible().keys()]));
    row.querySelector(".leafwise-notification-clear").addEventListener("click", () => {
      if (locked() || !queue) return;
      if (confirm(t("清空 {0} 個待開啟頁面？", queueRules.groups(queue.entries).size))) {
        status = ""; void mutate("clear").then(() => { if (queueFull) signature = ""; }).catch(() => {}).finally(refresh); refresh();
      }
    });
    row.querySelector(".leafwise-notification-retry").addEventListener("click", () => {
      if (locked() || !currentViewer) return;
      signature = ""; queueError = false; refresh();
    });
    row.querySelector("details").addEventListener("toggle", refresh);
    list.insertBefore(row, list.lastElementChild);
    return row;
  }
  function renderList(control, all, available) {
    const details = control.querySelector("details");
    const key = JSON.stringify([globalThis.LeafwiseI18n?.locale(), [...all.keys()], [...available.keys()], locked(), queueError]);
    if (!details.open || details.dataset.signature === key) return;
    details.dataset.signature = key;
    const list = details.querySelector("ol"); list.replaceChildren();
    for (const path of all.keys()) {
      const li = document.createElement("li"), button = document.createElement("button");
      button.type = "button";
      button.style.cssText = "border:0;background:none;color:#337ab7;text-align:start;overflow-wrap:anywhere;max-width:100%;padding:3px;cursor:pointer";
      const [kind, id] = path.slice(1).split("/");
      button.textContent = t(kind === "observations" ? "觀察 {0}" : kind === "flags" ? "標記 {0}" : "通知 {0}", id);
      button.disabled = locked() || queueError || !available.has(path);
      if (!available.has(path)) li.style.opacity = "0.55";
      button.addEventListener("click", () => void openTargets([path])); li.append(button); list.append(li);
    }
  }
  function refresh() {
    if (stopped) return;
    const viewer = viewerId();
    if (viewer !== currentViewer) {
      const switched = currentViewer !== undefined;
      lifecycle++;
      generation++; restoreRows(); outcomes.clear(); pending.clear(); resetLinks();
      currentViewer = viewer; queue = null; signature = ""; mutations = 0; busy = false; queueError = false; queueFull = false; status = "";
      // An in-place account switch can leave the previous account's menu in
      // the DOM. Load the new account's queue, but wait for a new menu snapshot.
      blockedSignature = switched ? JSON.stringify(captureEntries()) : null;
      if (viewer) void mutate("list").catch(() => {});
    }
    const entries = captureEntries(), nextSignature = JSON.stringify(entries);
    if (viewer && nextSignature !== signature && nextSignature !== blockedSignature) {
      blockedSignature = null;
      signature = nextSignature; generation++; outcomes.clear(); pending.clear();
      void mutate("capture", { entries }).catch(() => {});
    }
    let list = menu.querySelector(":scope > ul:not([data-leafwise-queue])");
    const fallback = menu.querySelector(":scope > ul[data-leafwise-queue]");
    if (list) fallback?.remove();
    else if (queueRules.groups(queue?.entries || []).size) {
      list = fallback || document.createElement("ul");
      if (!fallback) { list.dataset.leafwiseQueue = "1"; menu.append(list); }
    } else { fallback?.remove(); return; }
    const control = controls(list), label = control.querySelector("label"), checkbox = control.querySelector(".leafwise-notification-filter");
    checkbox.checked = enabled;
    label.title = t("只隱藏與您此前鑑定完全相同且無文字說明的鑑定；評論及無法判斷的消息保留。");
    setText(label.querySelector("span"), t("僅顯示非完全贊同的鑑定"));
    control.dir = ["ar", "he", "fa"].includes(globalThis.LeafwiseI18n?.locale()) ? "rtl" : "ltr";
    const pendingEntries = (queue?.entries || []).filter(item => !item.opened);
    const links = [...new Set(pendingEntries.filter(item => item.target === undefined).map(item => rules.activityLink(item.href, location.href)).filter(Boolean))]
      .filter(url => !linkResults.has(url) && !pendingLinks.has(url));
    if (links.length && !linkControllers.size) void resolveLinks(links, linkGeneration, viewer);
    const candidates = [...pendingEntries.map(item => rules.observationLink(item.href, location.href)), ...rows()]
      .filter(item => item?.identification);
    if (enabled && viewer) {
      const ids = [...new Set(candidates.map(item => item.observationId))].filter(id => !outcomes.has(id) && !pending.has(id));
      for (let index = 0; index < ids.length; index += 20) void checkBatch(ids.slice(index, index + 20), generation, viewer);
    }
    for (const item of rows()) {
      const result = enabled && item.identification ? rules.classify(outcomes.get(item.observationId), item.identification, viewer) : null;
      if (result === "confirming") {
        if (!hiddenRows.has(item.row)) hiddenRows.set(item.row, { hidden: item.row.hidden, display: item.row.style.getPropertyValue("display"), priority: item.row.style.getPropertyPriority("display") });
        item.row.hidden = true; item.row.style.setProperty("display", "none", "important");
      } else if (hiddenRows.has(item.row)) restoreRow(item.row);
    }
    const all = queueRules.groups(pendingEntries), available = eligible(), input = control.querySelector(".leafwise-notification-batch");
    setText(control.querySelector(".leafwise-notification-batch-label span"), t("每批開啟頁數")); input.setAttribute("aria-label", t("每批開啟頁數"));
    if (document.activeElement !== input && input.value !== String(queue?.batchSize || 10)) input.value = queue?.batchSize || 10;
    input.disabled = busy || !viewer || !queue || queueError;
    const button = control.querySelector(".leafwise-notification-open");
    setText(button, t("開啟下一批（{0}）", Math.min(available.size, queue?.batchSize || 10)));
    button.disabled = locked() || !available.size || !queue || queueError || !viewer;
    const hidden = all.size - available.size;
    setText(control.querySelector(".leafwise-notification-count"), t("待開啟：{0} 個頁面", available.size) + (hidden ? " · " + t("篩選已隱藏 {0} 個頁面", hidden) : ""));
    const uncertain = enabled && pendingEntries.some(item => classification(item) === "unknown") || pendingEntries.some(item => {
      const url = rules.activityLink(item.href, location.href); return url && linkResults.has(url) && linkResults.get(url) == null;
    });
    setText(control.querySelector(".leafwise-notification-filter-status"), enabled && pending.size ? t("正在篩選鑑定…") : uncertain ? t("無法判斷的消息已保留") : "");
    setText(control.querySelector(".leafwise-notification-status"), !viewer ? t("登入後可保存待開啟清單") : queueError ? t("清單儲存失敗，請重試") : queueFull ? t("待開啟清單已滿") : status);
    const retry = control.querySelector(".leafwise-notification-retry"); setText(retry, t("重試")); retry.hidden = !queueError; retry.disabled = locked();
    setText(control.querySelector("summary"), t("查看待開啟清單"));
    const clear = control.querySelector(".leafwise-notification-clear"); setText(clear, t("清空待開啟清單")); clear.disabled = locked() || !all.size || queueError;
    renderList(control, all, available);
  }
  const observer = new MutationObserver(refresh);
  const accountObserver = new MutationObserver(() => { if (viewerId() !== currentViewer) refresh(); });
  function watch() {
    observer.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    accountObserver.observe(document.querySelector(".navtab.user")?.parentElement || document.body,
      { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    viewerTimer = setInterval(() => { if (viewerId() !== currentViewer) refresh(); }, 1000);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (stopped || area !== "local" || !currentViewer) return;
    const value = changes[queueRules.PREFIX + currentViewer]?.newValue;
    if (value && (!queue || value.revision > queue.revision)) {
      const viewer = currentViewer, epoch = lifecycle;
      void request("list", {}, viewer).then(refresh).catch(() => {
        if (!stopped && epoch === lifecycle && viewer === currentViewer) { queueError = true; refresh(); }
      });
    }
  });
  window.addEventListener("pagehide", () => {
    stopped = true; lifecycle++; generation++; observer.disconnect(); accountObserver.disconnect(); clearInterval(viewerTimer); resetLinks(); restoreRows(); clearTimeout(clearStatusTimer);
  });
  window.addEventListener("pageshow", event => {
    if (!event.persisted || !stopped) return;
    stopped = false; currentViewer = undefined; watch(); refresh();
  });
  watch(); refresh();
  (async () => {
    try {
      const saved = await chrome.storage.local.get(FILTER_KEY);
      if (!stopped && !preferenceChanged) { enabled = saved[FILTER_KEY] === true; refresh(); }
    } catch { /* Safe, unfiltered default. */ }
  })();
})();
