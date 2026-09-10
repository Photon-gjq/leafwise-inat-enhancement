(() => {
  const api = globalThis.QGInatFilters;
  if (!api.isSearchPage(location.href)) return;
  const nativePendingKey = "qgInatPendingUnobservedUser";
  function readPendingNativeFilter() {
    try {
      const raw = sessionStorage.getItem(nativePendingKey);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {}
      return { unobserved_by_user_id: raw };
    } catch { return null; }
  }
  function clearPendingNativeFilter() {
    try { sessionStorage.removeItem(nativePendingKey); } catch {}
  }
  function finishPendingNativeFilter() {
    const pending = readPendingNativeFilter();
    if (pending === null) return false;
    clearPendingNativeFilter();
    const next = api.updateFilters(location.href, pending);
    if (next !== location.href) {
      location.replace(next);
      return true;
    }
    return false;
  }
  if (finishPendingNativeFilter()) return;
  const host = document.createElement("div");
  host.id = "qg-inat-user-filters";
  const shadow = host.attachShadow({ mode: "open" });
  const summaryHost = document.createElement("span");
  summaryHost.id = "qg-inat-user-filters-summary";
  const summaryShadow = summaryHost.attachShadow({ mode: "open" });
  summaryShadow.innerHTML = `
    <style>
      :host { display: inline-flex; margin-left: 10px; vertical-align: middle; }
      :host([hidden]) { display: none; }
      button { max-width: 440px; padding: 3px 9px; overflow: hidden; border: 1px solid #a9b99d; border-radius: 999px; background: #f4f7f1; color: #49613d; font: 12px/1.4 system-ui, sans-serif; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
      button:hover { border-color: #66834f; background: #eaf1e4; }
      button:focus-visible { outline: 3px solid #83af53; outline-offset: 2px; }
    </style>
    <button type="button" aria-label="展开 QG 用户筛选" title="点击展开用户筛选"></button>`;
  const modalHost = document.createElement("div");
  modalHost.id = "qg-inat-native-filter-tools";
  const modalShadow = modalHost.attachShadow({ mode: "open" });
  modalShadow.innerHTML = `
    <style>
      :host { position: relative; z-index: 1; display: block; width: calc(200% + 30px); margin: 10px 0 0; color-scheme: light; }
      * { box-sizing: border-box; }
      .box { display: grid; grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr); align-items: end; gap: 10px; padding: 10px; border: 1px solid #c2d0b8; border-radius: 5px; background: #e8eee3; color: #333; font: 13px/1.4 system-ui, sans-serif; }
      .field { min-width: 0; }
      label { display: block; margin-bottom: 4px; font-weight: 600; }
      .control { display: flex; gap: 6px; }
      select, input, button { min-height: 32px; border: 1px solid #aaa; border-radius: 4px; background: white; color: #333; font: inherit; }
      select, input { min-width: 0; width: 100%; padding: 5px 7px; }
      button { width: 34px; padding: 0; color: #496f29; font-size: 18px; cursor: pointer; }
      [hidden] { display: none !important; }
      :focus-visible { outline: 3px solid #83af53; outline-offset: 2px; }
      @media (max-width: 900px) {
        :host { width: 100%; }
        .box { grid-template-columns: 1fr; }
        button { justify-self: center; transform: rotate(90deg); }
      }
    </style>
    <div class="box">
      <div class="field">
        <label for="modal-source">观察来源</label>
        <div class="control">
          <select id="modal-source" aria-label="选择观察来源用户" disabled></select>
          <input id="modal-source-name" aria-label="观察来源用户名" placeholder="输入用户名" spellcheck="false" autocomplete="off" hidden>
        </div>
      </div>
      <button id="modal-swap" type="button" aria-label="互换观察来源和排除已观察" title="互换观察来源和排除已观察">⇄</button>
      <div class="field">
        <label for="modal-exclude">排除已观察</label>
        <div class="control">
          <select id="modal-exclude" disabled></select>
          <input id="modal-exclude-name" aria-label="排除已观察用户名" placeholder="输入用户名" spellcheck="false" autocomplete="off" hidden>
        </div>
      </div>
    </div>`;
  shadow.innerHTML = `
    <style>
      :host { display: block; clear: both; margin: 12px 16px; color-scheme: light; }
      :host([hidden]) { display: none; }
      * { box-sizing: border-box; }
      form { margin: 0; padding: 12px 16px; border: 1px solid #ccd9c0; border-radius: 6px; background: #f5f8f0; color: #293524; font: 14px/1.5 system-ui, sans-serif; }
      .row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 18px; }
      .field { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      label { font-weight: 600; }
      select, input, button { font: inherit; border: 1px solid #95a58b; border-radius: 4px; padding: 6px 9px; background: white; color: #293524; min-height: 34px; }
      select { max-width: 260px; } input { width: 170px; }
      button { cursor: pointer; } button[type=submit] { background: #496f29; border-color: #496f29; color: white; }
      button:disabled { opacity: .5; cursor: default; }
      .swap { width: 34px; padding-inline: 0; color: #496f29; font-size: 18px; line-height: 1; }
      .apply-status { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .apply-status button { flex-shrink: 0; }
      #message { color: #915315; font-size: 12px; }
      #message:empty { display: none; } [hidden] { display: none !important; }
      :focus-visible { outline: 3px solid #83af53; outline-offset: 2px; }
    </style>
    <form aria-label="QG 用户筛选">
      <div class="row">
        <div class="field"><label for="source">观察来源</label><select id="source" disabled></select><input id="source-name" aria-label="观察来源用户名" placeholder="输入用户名" spellcheck="false" autocomplete="off" hidden></div>
        <button type="button" class="swap" aria-label="互换观察来源和排除用户" title="互换观察来源和排除用户">⇄</button>
        <div class="field"><label for="exclude">排除已观察</label><select id="exclude" disabled></select><input id="exclude-name" aria-label="排除已观察用户名" placeholder="输入用户名" spellcheck="false" autocomplete="off" hidden></div>
        <div class="apply-status"><button type="submit" disabled>应用</button><span id="message" role="status" aria-live="polite"></span></div>
      </div>
    </form>`;
  const form = shadow.querySelector("form");
  const message = shadow.querySelector("#message");
  const submit = shadow.querySelector("[type=submit]");
  const summaryButton = summaryShadow.querySelector("button");
  const modalSourceField = {
    key: "user_id",
    select: modalShadow.querySelector("#modal-source"),
    input: modalShadow.querySelector("#modal-source-name"),
    empty: "不限用户"
  };
  const modalSource = modalSourceField.select;
  const modalExcludeField = {
    key: "unobserved_by_user_id",
    select: modalShadow.querySelector("#modal-exclude"),
    input: modalShadow.querySelector("#modal-exclude-name"),
    empty: "不排除"
  };
  const users = globalThis.QGInatUsers;
  let usernames = [];
  let storedUsers = {};
  let lastHref = "";
  let ready = false;
  const collapsedKey = "qgInatUserFiltersCollapsed";
  let collapsed = true;
  function summaryText(href = location.href) {
    const params = new URL(href).searchParams;
    const source = params.get("user_id");
    const exclude = params.get("unobserved_by_user_id");
    if (source && exclude) return `来源 ${source} · 排除 ${exclude}`;
    if (source) return `来源 ${source}`;
    if (exclude) return `排除 ${exclude}`;
    return "用户筛选：未启用";
  }
  function saveCollapsed(value) {
    try {
      if (value) sessionStorage.setItem(collapsedKey, "1");
      else sessionStorage.removeItem(collapsedKey);
    } catch {}
  }
  function setCollapsed(value, persist = true, href = location.href) {
    collapsed = value;
    host.hidden = value;
    summaryHost.hidden = !value;
    summaryButton.textContent = summaryText(href);
    summaryButton.title = `${summaryButton.textContent}；点击展开用户筛选`;
    if (persist) saveCollapsed(value);
  }
  summaryButton.addEventListener("click", () => setCollapsed(false));
  try {
    const savedCollapsed = sessionStorage.getItem(collapsedKey);
    collapsed = savedCollapsed === null || savedCollapsed === "1";
  } catch {}
  setCollapsed(collapsed, false);
  const fields = api.keys.map((key, index) => {
    const id = index === 0 ? "source" : "exclude";
    return { key, select: shadow.querySelector(`#${id}`), input: shadow.querySelector(`#${id}-name`), empty: index === 0 ? "不限用户" : "不排除" };
  });
  function value(field) {
    const selected = field.select.value;
    if (selected === "none" || selected === "settings") return "";
    return selected.startsWith("user:") ? selected.slice(5) : field.input.value.trim();
  }
  function warn() {
    const [source, exclude] = fields.map(value);
    message.textContent = source && exclude && source.toLowerCase() === exclude.toLowerCase()
      ? "两个筛选使用同一用户，通常会得到空结果；仍可点击应用。" : "";
  }
  function populate(field, current, mode) {
    field.select.replaceChildren();
    const add = (value, label) => field.select.add(new Option(label, value));
    add("none", field.empty);
    usernames.forEach(username => add(`user:${username}`, username));
    add("custom", "指定其他用户…");
    add("settings", "管理常用用户…");
    field.select.value = mode || (current ? (usernames.includes(current) ? `user:${current}` : "custom") : "none");
    field.input.value = current || "";
    field.input.hidden = field.select.value !== "custom";
    field.input.required = !field.input.hidden;
    field.select.disabled = false;
    field.lastValue = value(field);
    field.lastMode = field.select.value;
  }
  function nativePersonInput() {
    return document.querySelector("#filter-dropdown input[name='user_name']");
  }
  function nativePersonValue() {
    const modeled = document.querySelector("#filter-dropdown input[name='user_id'][ng-model]");
    const visible = nativePersonInput();
    return String(modeled?.value || visible?.value || new URL(location.href).searchParams.get("user_id") || "").trim();
  }
  function emitInput(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function setNativePerson(username) {
    const next = String(username || "").trim();
    const visible = nativePersonInput();
    if (visible) { visible.value = next; emitInput(visible); }
    document.querySelectorAll("#filters input[name='user_id']").forEach(input => {
      input.value = next;
      input.setAttribute("value", next);
      emitInput(input);
    });
  }
  function setNativeUnobserved(username) {
    const next = String(username || "").trim();
    document.querySelectorAll("#filters input[name='unobserved_by_user_id']").forEach(input => {
      input.value = next;
      input.setAttribute("value", next);
      emitInput(input);
    });
  }
  function populateModalSource(current = nativePersonValue()) {
    populate(modalSourceField, current);
  }
  function modalSourceValue() {
    return value(modalSourceField);
  }
  function syncModalFromURL() {
    const params = new URL(location.href).searchParams;
    populateModalSource(params.get("user_id") || nativePersonValue());
    populate(modalExcludeField, params.get("unobserved_by_user_id") || "");
  }
  function syncURL() {
    const params = new URL(location.href).searchParams;
    fields.forEach(field => populate(field, params.get(field.key) || ""));
    lastHref = location.href;
    summaryButton.textContent = summaryText();
    summaryButton.title = `${summaryButton.textContent}；点击展开用户筛选`;
    syncModalFromURL();
    warn();
  }
  async function openSettings() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "qg-open-options" });
      if (!result?.ok) throw new Error("options");
    } catch { message.textContent = "无法打开设置，请点击浏览器工具栏中的扩展图标。"; }
  }
  modalSource.addEventListener("change", () => {
    if (modalSource.value === "settings") {
      populate(modalSourceField, modalSourceField.lastValue, modalSourceField.lastMode);
      openSettings();
      return;
    }
    modalSourceField.input.hidden = modalSource.value !== "custom";
    modalSourceField.input.required = !modalSourceField.input.hidden;
    modalSourceField.input.setCustomValidity("");
    setNativePerson(modalSourceValue());
    if (!modalSourceField.input.hidden) modalSourceField.input.focus();
    modalSourceField.lastValue = modalSourceValue();
    modalSourceField.lastMode = modalSource.value;
  });
  modalSourceField.input.addEventListener("input", () => {
    modalSourceField.input.setCustomValidity("");
    setNativePerson(modalSourceValue());
    modalSourceField.lastValue = modalSourceValue();
    modalSourceField.lastMode = "custom";
  });
  modalExcludeField.select.addEventListener("change", () => {
    if (modalExcludeField.select.value === "settings") {
      populate(modalExcludeField, modalExcludeField.lastValue, modalExcludeField.lastMode);
      openSettings();
      return;
    }
    modalExcludeField.input.hidden = modalExcludeField.select.value !== "custom";
    modalExcludeField.input.required = !modalExcludeField.input.hidden;
    modalExcludeField.input.setCustomValidity("");
    if (!modalExcludeField.input.hidden) modalExcludeField.input.focus();
    modalExcludeField.lastValue = value(modalExcludeField);
    modalExcludeField.lastMode = modalExcludeField.select.value;
  });
  modalExcludeField.input.addEventListener("input", () => {
    modalExcludeField.input.setCustomValidity("");
    modalExcludeField.lastValue = value(modalExcludeField);
    modalExcludeField.lastMode = "custom";
  });
  modalShadow.querySelector("#modal-swap").addEventListener("click", () => {
    const source = nativePersonValue();
    const exclude = value(modalExcludeField);
    setNativePerson(exclude);
    populateModalSource(exclude);
    populate(modalExcludeField, source);
  });
  shadow.querySelector(".swap").addEventListener("click", () => {
    const drafts = fields.map(field => ({ value: value(field), custom: field.select.value === "custom" }));
    populate(fields[0], drafts[1].value, drafts[1].custom ? "custom" : undefined);
    populate(fields[1], drafts[0].value, drafts[0].custom ? "custom" : undefined);
    warn();
  });
  fields.forEach(field => {
    field.select.addEventListener("change", () => {
      if (field.select.value === "settings") {
        populate(field, field.lastValue, field.lastMode);
        openSettings();
        return;
      }
      field.input.hidden = field.select.value !== "custom";
      field.input.required = !field.input.hidden;
      field.input.setCustomValidity("");
      warn();
      if (!field.input.hidden) field.input.focus();
      field.lastValue = value(field);
      field.lastMode = field.select.value;
    });
    field.input.addEventListener("input", () => {
      field.input.setCustomValidity(""); warn();
      field.lastValue = value(field);
      field.lastMode = "custom";
    });
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!ready || !api.isSearchPage(location.href)) return;
    if (lastHref !== location.href) {
      syncURL();
      message.textContent = "页面筛选已变化，已同步当前条件，请重新选择后应用。";
      return;
    }
    const changes = {};
    for (const field of fields) {
      const selected = value(field);
      if (field.select.value !== "none" && !selected) {
        if (field.select.value === "settings") {
          message.textContent = "请先设置常用用户名。";
          openSettings();
        } else {
          field.input.setCustomValidity("请输入用户名，不能只包含空格。");
          field.input.reportValidity();
        }
        return;
      }
      changes[field.key] = selected;
    }
    const next = api.updateFilters(location.href, changes);
    setCollapsed(true, true, next);
    if (next !== location.href) location.assign(next);
  });
  const boundNativeUpdates = new WeakSet();
  function bindNativeUpdate() {
    const update = document.querySelector("#filters-footer .btn-primary");
    if (!update || boundNativeUpdates.has(update)) return;
    boundNativeUpdates.add(update);
    update.addEventListener("click", event => {
      const selected = value(modalExcludeField);
      if (modalExcludeField.select.value === "custom" && !selected) {
        event.preventDefault();
        event.stopImmediatePropagation();
        modalExcludeField.input.setCustomValidity("请输入用户名，不能只包含空格。");
        modalExcludeField.input.reportValidity();
        return;
      }
      setNativeUnobserved(selected);
      const pending = { user_id: nativePersonValue(), unobserved_by_user_id: selected };
      try { sessionStorage.setItem(nativePendingKey, JSON.stringify(pending)); } catch {}
      saveCollapsed(true);
      const before = location.href;
      setTimeout(() => {
        if (location.href === before && readPendingNativeFilter() !== null) finishPendingNativeFilter();
      }, 1200);
    }, true);
  }
  // Prefer the search toolbar; fallback remains in normal document flow.
  function mount() {
    if (!api.isSearchPage(location.href)) { host.remove(); summaryHost.remove(); modalHost.remove(); return; }
    const heading = document.querySelector("#filters > h1, #filters h1");
    if (heading && summaryHost.parentElement !== heading) heading.append(summaryHost);
    const nativePerson = nativePersonInput();
    const nativePersonGroup = nativePerson?.closest(".form-group");
    const middleColumn = document.querySelector("#more-filters > .row > .col-xs-4:nth-child(2)");
    if (middleColumn && modalHost.parentElement !== middleColumn) middleColumn.append(modalHost);
    else if (!middleColumn && nativePersonGroup && modalHost.parentElement !== nativePersonGroup.parentElement) nativePersonGroup.after(modalHost);
    bindNativeUpdate();
    const anchor = document.querySelector("#observations-search .SearchBar, #observations .SearchBar, .Observations .SearchBar, #observations-search .search-bar");
    if (anchor) {
      if (anchor.nextElementSibling !== host) anchor.after(host);
    } else if (!host.isConnected) {
      const container = document.querySelector("#observations-search, #observations, main, #wrapper, #main") || document.body;
      container.prepend(host);
    }
    host.hidden = collapsed;
    summaryHost.hidden = !collapsed;
    if (ready && lastHref !== location.href) syncURL();
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  }).observe(document.body, { childList: true, subtree: true });
  // pushState/replaceState do not emit popstate in the isolated script world.
  setInterval(() => {
    if (lastHref === location.href) return;
    if (readPendingNativeFilter() !== null && finishPendingNativeFilter()) return;
    mount();
  }, 750);
  window.addEventListener("popstate", mount);
  mount();
  chrome.storage.sync.get(users.storageKeys).then(data => {
    storedUsers = data;
    usernames = users.read(storedUsers);
    ready = true;
    syncURL();
    submit.disabled = false;
  }).catch(() => { message.textContent = "读取设置失败，请刷新页面重试。"; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !users.storageKeys.some(key => changes[key]) || !ready) return;
    // Preserve selected values when a saved candidate changes, including unsaved drafts.
    const drafts = fields.map(field => ({ value: value(field), mode: field.select.value }));
    const modalDraft = { value: value(modalExcludeField), mode: modalExcludeField.select.value };
    for (const key of users.storageKeys) {
      if (changes[key]) storedUsers[key] = changes[key].newValue;
    }
    usernames = users.read(storedUsers);
    fields.forEach((field, index) => {
      const draft = drafts[index];
      const mode = draft.mode === "custom" ? "custom" : undefined;
      populate(field, draft.value, mode);
    });
    populateModalSource();
    populate(modalExcludeField, modalDraft.value, modalDraft.mode === "custom" ? "custom" : undefined);
    warn();
  });
})();
