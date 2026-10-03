(() => {
  "use strict";
  const t = (text, ...values) => globalThis.LeafwiseI18n?.t(text, ...values) ?? text.replace(/\{(\d+)\}/g, (_, i) => String(values[i] ?? ""));
  const rules = globalThis.LeafwiseNotificationFilter;
  const ROW_CLASS = "leafwise-open-update-observations";
  const FILTER_KEY = "leafwiseNotificationFilterV1";
  const menu = document.querySelector("#updatesnav #updatessubnav");
  if (!menu || !rules || menu.dataset.leafwiseNotifications) return;
  menu.dataset.leafwiseNotifications = "1";
  let enabled = false;
  let preferenceChanged = false;
  let busy = false;
  let stopped = false;
  let status = "";
  let clearStatusTimer;
  let currentList;
  let currentViewer;
  let currentSignature;
  let generation = 0;
  const outcomes = new Map();
  const pending = new Set();
  const hiddenRows = new Map();

  function viewerId() {
    for (const link of document.querySelectorAll(".navtab.user a.profile_link[href]")) {
      let url;
      try { url = new URL(link.href, location.href); } catch { continue; }
      if (url.origin !== location.origin) continue;
      const match = /^\/people\/([1-9]\d*)\/?$/.exec(url.pathname);
      if (match && Number.isSafeInteger(Number(match[1]))) return Number(match[1]);
    }
    return null;
  }

  function rows() {
    return [...menu.querySelectorAll(":scope > ul > li > a[href]")].map(link => ({
      row: link.parentElement, ...rules.observationLink(link.href, location.href)
    }));
  }

  function restoreRows() {
    for (const row of [...hiddenRows.keys()]) restoreRow(row);
    hiddenRows.clear();
  }

  function restoreRow(row) {
    const saved = hiddenRows.get(row);
    row.hidden = saved.hidden;
    if (saved.display) row.style.setProperty("display", saved.display, saved.priority);
    else row.style.removeProperty("display");
    hiddenRows.delete(row);
  }

  function observationIds() {
    return [...new Set(rows().filter(item => item.observationId && !item.row.hidden)
      .map(item => String(item.observationId)))];
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
      if (!stopped && token === generation) {
        ids.forEach(id => pending.delete(id));
        refresh();
      }
    }
  }

  function controls(list) {
    let row = list.querySelector(":scope > li." + ROW_CLASS);
    if (row) return row;
    row = document.createElement("li");
    row.className = ROW_CLASS;
    row.style.cssText = "text-align:center;padding:8px 12px;border-top:1px solid #eee;white-space:normal";
    row.addEventListener("click", event => event.stopPropagation());
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;justify-content:center;gap:6px;font-weight:normal;margin:0 0 8px;cursor:pointer";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "leafwise-notification-filter";
    checkbox.style.cssText = "margin:0;flex:none";
    checkbox.addEventListener("change", () => {
      preferenceChanged = true;
      enabled = checkbox.checked;
      generation++;
      outcomes.clear();
      pending.clear();
      restoreRows();
      try { chrome.storage.local.set({ [FILTER_KEY]: enabled }).catch(() => {}); } catch {}
      refresh();
    });
    label.append(checkbox, document.createElement("span"));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-default btn-sm";
    button.style.cssText = "max-width:100%;white-space:normal";
    button.addEventListener("click", async event => {
      event.preventDefault();
      if (stopped) return;
      refresh(); // Recheck the signed-in viewer before using filtered results.
      if (busy || (enabled && pending.size)) return;
      const ids = observationIds();
      if (!ids.length) return;
      busy = true;
      status = t("正在開啟觀察…");
      clearTimeout(clearStatusTimer);
      refresh();
      try {
        const reply = await chrome.runtime.sendMessage({ type: "leafwise-open-update-observations", observationIds: ids });
        status = reply?.ok && reply.opened === ids.length
          ? t("已開啟 {0} 個觀察", reply.opened)
          : t("已開啟 {0} 個；其餘未能開啟", reply?.opened || 0);
      } catch { status = t("開啟失敗，請重試"); }
      finally {
        busy = false;
        if (!stopped) {
          refresh();
          clearStatusTimer = setTimeout(() => { status = ""; refresh(); }, 4000);
        }
      }
    });
    const hint = document.createElement("div");
    hint.className = "leafwise-notification-filter-status";
    hint.setAttribute("role", "status");
    hint.style.cssText = "font-size:12px;margin-top:4px";
    row.append(label, button, hint);
    list.insertBefore(row, list.lastElementChild);
    return row;
  }

  function refresh() {
    if (stopped) return;
    const list = menu.querySelector(":scope > ul");
    const viewer = viewerId();
    const signature = rows().map(item => `${item.observationId}:${item.identification}`).join(",");
    if (list !== currentList || viewer !== currentViewer || signature !== currentSignature) {
      generation++;
      restoreRows();
      outcomes.clear();
      pending.clear();
      currentList = list;
      currentViewer = viewer;
      currentSignature = signature;
    }
    if (!list) return;
    const control = controls(list);
    const label = control.querySelector("label");
    const checkbox = label.querySelector("input");
    checkbox.checked = enabled;
    label.title = t("只隱藏與您此前鑑定完全相同且無文字說明的鑑定；評論及無法判斷的消息保留。");
    const text = t("僅顯示非完全贊同的鑑定");
    if (label.lastElementChild.textContent !== text) label.lastElementChild.textContent = text;
    control.dir = ["ar", "he", "fa"].includes(globalThis.LeafwiseI18n?.locale()) ? "rtl" : "ltr";
    let uncertain = false;
    const candidates = rows().filter(item => item.identification);
    if (enabled && viewer) {
      const ids = [...new Set(candidates.map(item => item.observationId))]
        .filter(id => !outcomes.has(id) && !pending.has(id));
      for (let index = 0; index < ids.length; index += 20) void checkBatch(ids.slice(index, index + 20), generation, viewer);
    }
    for (const item of candidates) {
      const result = enabled ? rules.classify(outcomes.get(item.observationId), item.identification, viewer) : null;
      if (result === "confirming") {
        if (!hiddenRows.has(item.row)) hiddenRows.set(item.row, {
          hidden: item.row.hidden, display: item.row.style.getPropertyValue("display"),
          priority: item.row.style.getPropertyPriority("display")
        });
        item.row.hidden = true;
        item.row.style.setProperty("display", "none", "important");
      } else if (hiddenRows.has(item.row)) {
        restoreRow(item.row);
      }
      if (enabled && result === "unknown" && !pending.has(item.observationId)) uncertain = true;
    }
    const button = control.querySelector("button");
    const count = observationIds().length;
    const caption = status || t(enabled ? "開啟篩選後的觀察（{0}）" : "一鍵開啟這些觀察（{0}）", count);
    if (button.textContent !== caption) button.textContent = caption;
    button.disabled = busy || count === 0 || (enabled && pending.size > 0);
    const hint = control.querySelector(".leafwise-notification-filter-status");
    const message = enabled && pending.size ? t("正在篩選鑑定…") : uncertain ? t("無法判斷的消息已保留") : "";
    if (hint.textContent !== message) hint.textContent = message;
  }

  const observer = new MutationObserver(refresh);
  observer.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  window.addEventListener("pagehide", () => {
    stopped = true;
    generation++;
    observer.disconnect();
    restoreRows();
    clearTimeout(clearStatusTimer);
  });
  window.addEventListener("pageshow", event => {
    if (!event.persisted || !stopped) return;
    stopped = false;
    outcomes.clear();
    pending.clear();
    observer.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    refresh();
  });
  refresh();
  (async () => {
    try {
      const saved = await chrome.storage.local.get(FILTER_KEY);
      if (!stopped && !preferenceChanged) { enabled = saved[FILTER_KEY] === true; refresh(); }
    } catch { /* Storage failure leaves the safe, unfiltered default. */ }
  })();
})();
