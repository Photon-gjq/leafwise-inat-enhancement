(() => {
  "use strict";
  const t = (text, ...values) => globalThis.LeafwiseI18n?.t(text, ...values) ?? text.replace(/\{(\d+)\}/g, (_, i) => String(values[i] ?? ""));
  const html = text => globalThis.LeafwiseI18n?.html(text) ?? text;
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
  if (globalThis.LeafwiseUserFilters) return;
  globalThis.LeafwiseUserFilters = true;
  const modalHost = document.createElement("div");
  modalHost.id = "qg-inat-native-filter-tools";
  const modalShadow = modalHost.attachShadow({ mode: "open" });
  modalShadow.innerHTML = html(`
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
      #modal-message { grid-column: 1 / -1; color: #915315; font-size: 12px; }
      #modal-message:empty { display: none; }
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
      <span id="modal-message" role="status" aria-live="polite"></span>
    </div>`);
  const message = modalShadow.querySelector("#modal-message");
  const modalSourceField = {
    key: "user_id",
    select: modalShadow.querySelector("#modal-source"),
    input: modalShadow.querySelector("#modal-source-name"),
    empty: t("不限用户")
  };
  const modalSource = modalSourceField.select;
  const modalExcludeField = {
    key: "unobserved_by_user_id",
    select: modalShadow.querySelector("#modal-exclude"),
    input: modalShadow.querySelector("#modal-exclude-name"),
    empty: t("不排除")
  };
  const users = globalThis.QGInatUsers;
  let usernames = [];
  let storedUsers = {};
  let lastHref = "";
  let lastNativePerson = "";
  let ready = false;
  function value(field) {
    const selected = field.select.value;
    if (selected === "none" || selected === "settings") return "";
    return selected.startsWith("user:") ? selected.slice(5) : field.input.value.trim();
  }
  function populate(field, current, mode) {
    field.select.replaceChildren();
    const add = (value, label) => field.select.add(new Option(label, value));
    add("none", field.empty);
    usernames.forEach(username => add(`user:${username}`, username));
    add("custom", t("指定其他用户…"));
    add("settings", t("管理常用用户…"));
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
    // A present but empty native field means the user cleared the filter.
    // Only fall back to the URL when the native controls do not exist.
    return String(modeled ? modeled.value : visible ? visible.value : new URL(location.href).searchParams.get("user_id") || "").trim();
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
    // Our own input events must not repopulate the custom field while typing.
    lastNativePerson = nativePersonValue();
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
    populateModalSource(params.get("user_id") || "");
    populate(modalExcludeField, params.get("unobserved_by_user_id") || "");
    lastNativePerson = nativePersonValue();
  }
  function syncNativePerson() {
    if (!ready) return;
    const current = nativePersonValue();
    if (current === lastNativePerson) return;
    lastNativePerson = current;
    populateModalSource(current);
  }
  function syncURL() {
    lastHref = location.href;
    syncModalFromURL();
  }
  async function openSettings() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "qg-open-options" });
      if (!result?.ok) throw new Error("options");
    } catch { message.textContent = t("无法打开设置，请点击浏览器工具栏中的扩展图标。"); }
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
        modalExcludeField.input.setCustomValidity(t("请输入用户名，不能只包含空格。"));
        modalExcludeField.input.reportValidity();
        return;
      }
      setNativeUnobserved(selected);
      const pending = { user_id: nativePersonValue(), unobserved_by_user_id: selected };
      try { sessionStorage.setItem(nativePendingKey, JSON.stringify(pending)); } catch {}
      const before = location.href;
      setTimeout(() => {
        if (location.href === before && readPendingNativeFilter() !== null) finishPendingNativeFilter();
      }, 1200);
    }, true);
  }
  // User filtering lives only in the native filter menu, not in comparison.
  function mount() {
    if (!api.isSearchPage(location.href)) { modalHost.remove(); return; }
    const nativePerson = nativePersonInput();
    const nativePersonGroup = nativePerson?.closest(".form-group");
    const middleColumn = document.querySelector("#more-filters > .row > .col-xs-4:nth-child(2)");
    if (middleColumn && modalHost.parentElement !== middleColumn) middleColumn.append(modalHost);
    else if (!middleColumn && nativePersonGroup && modalHost.parentElement !== nativePersonGroup.parentElement) nativePersonGroup.after(modalHost);
    bindNativeUpdate();
    if (ready && lastHref !== location.href) syncURL();
    else syncNativePerson();
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  }).observe(document.body, { childList: true, subtree: true });
  // pushState/replaceState do not emit popstate in the isolated script world.
  setInterval(() => {
    if (lastHref !== location.href && readPendingNativeFilter() !== null && finishPendingNativeFilter()) return;
    mount();
  }, 750);
  window.addEventListener("popstate", mount);
  mount();
  chrome.storage.sync.get(users.storageKeys).then(data => {
    storedUsers = data;
    usernames = users.read(storedUsers);
    ready = true;
    syncURL();
  }).catch(() => { message.textContent = t("读取设置失败，请刷新页面重试。"); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !users.storageKeys.some(key => changes[key]) || !ready) return;
    // Preserve selected values when a saved candidate changes, including unsaved drafts.
    const sourceDraft = { value: modalSourceValue(), mode: modalSource.value };
    const modalDraft = { value: value(modalExcludeField), mode: modalExcludeField.select.value };
    for (const key of users.storageKeys) {
      if (changes[key]) storedUsers[key] = changes[key].newValue;
    }
    usernames = users.read(storedUsers);
    populate(modalSourceField, sourceDraft.value, sourceDraft.mode === "custom" ? "custom" : undefined);
    populate(modalExcludeField, modalDraft.value, modalDraft.mode === "custom" ? "custom" : undefined);
  });
})();
