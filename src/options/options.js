(async () => {
  "use strict";
  const t = (text, ...values) => globalThis.LeafwiseI18n?.t(text, ...values) ?? text.replace(/\{(\d+)\}/g, (_, i) => String(values[i] ?? ""));
  const localizedError = text => globalThis.LeafwiseI18n?.legacy(text) ?? text;
  await globalThis.LeafwiseI18n?.initializeOptions(chrome);
  document.title = t("开卷有益 - Leafwise iNaturalist Enhancement 设置");
  document.querySelector("#page-title").textContent = document.title;
  const users = globalThis.QGInatUsers;
  const taxa = globalThis.QGInatSavedTaxa;
  const usernameInput = document.querySelector("#username");
  const taxaInput = document.querySelector("#taxa");
  const userButton = document.querySelector("#users-form button");
  const taxaButton = document.querySelector("#taxa-form button");
  const userStatus = document.querySelector("#user-status");
  const taxaStatus = document.querySelector("#taxa-status");
  const placesInput = document.querySelector("#places");
  const placesButton = document.querySelector('#places-form button[type="submit"]');
  const placesStatus = document.querySelector("#places-status");
  const explore = globalThis.LeafwiseExploreTools;
  const exampleChoice = document.querySelector("#place-example");
  const exampleButton = document.querySelector("#add-place-example");
  const exampleMembers = document.querySelector("#place-example-members");
  let savedGroups = null;

  exampleChoice.add(new Option(t("選擇範例…"), ""));
  for (const example of explore.groups) exampleChoice.add(new Option(t(example.name), example.id));
  exampleChoice.addEventListener("change", () => {
    const example = explore.groups.find(item => item.id === exampleChoice.value);
    exampleMembers.textContent = example ? example.place.split(",").map(id => `${t(explore.places[id])} (${id})`).join(" · ") : "";
    exampleButton.disabled = !savedGroups || !example;
  });
  exampleButton.addEventListener("click", () => {
    const example = explore.groups.find(item => item.id === exampleChoice.value);
    if (!savedGroups || !example) return;
    try {
      placesInput.value = explore.appendPlaceGroup(placesInput.value, {...example, name:t(example.name)}, globalThis.QGInatHigherTaxa);
      placesStatus.textContent = t("已加入清单（相同组合不会重复添加）。请点击保存常用地区。");
    } catch (error) { placesStatus.textContent = localizedError(error.message); }
  });

  async function libraryRequest(action, entry) {
    const reply = await chrome.runtime.sendMessage({type:"leafwise-explore-library", action, entry});
    if (!reply?.ok || !Array.isArray(reply.library?.groups)) throw new Error(reply?.error || t("读取设置失败，请重新打开此页面。"));
    return reply.library;
  }
  libraryRequest("list").then(library => {
    savedGroups = library.groups;
    placesInput.value = explore.formatPlaceGroups(savedGroups);
    placesInput.disabled = placesButton.disabled = false;
    exampleChoice.disabled = false;
  }).catch(error => { placesStatus.textContent = localizedError(error.message); });

  document.querySelector("#places-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!savedGroups) return;
    placesButton.disabled = true;
    placesStatus.textContent = t("正在保存…");
    try {
      explore.parsePlaceGroups(placesInput.value, globalThis.QGInatHigherTaxa);
      const library = await libraryRequest("replace-places", {text:placesInput.value, expectedGroups:savedGroups});
      savedGroups = library.groups;
      placesInput.value = explore.formatPlaceGroups(savedGroups);
      placesStatus.textContent = savedGroups.length ? t("已保存 {0} 个常用地区组合。", savedGroups.length) : t("已清空自订地区组合。");
    } catch (error) { placesStatus.textContent = localizedError(error.message); }
    finally { placesButton.disabled = false; }
  });

  chrome.storage.sync.get([...users.storageKeys, ...taxa.storageKeys]).then(data => {
    usernameInput.value = users.read(data).join("\n");
    taxaInput.value = taxa.format(taxa.read(data));
    usernameInput.disabled = userButton.disabled = false;
    taxaInput.disabled = taxaButton.disabled = false;
  }).catch(() => {
    userStatus.textContent = taxaStatus.textContent = t("读取设置失败，请重新打开此页面。");
  });

  document.querySelector("#users-form").addEventListener("submit", async event => {
    event.preventDefault();
    userButton.disabled = true;
    try {
      const usernames = users.normalize(usernameInput.value.split(/\r?\n/));
      await chrome.storage.sync.set({ savedUsernames: usernames });
      usernameInput.value = usernames.join("\n");
      userStatus.textContent = usernames.length ? t("已保存 {0} 个用户名。返回观察搜索页即可选择。", usernames.length) : t("已清空常用用户名列表。");
    } catch { userStatus.textContent = t("保存失败，请重试。"); }
    finally { userButton.disabled = false; }
  });

  async function resolveTaxa(items) {
    const missing = items.filter(item => !item.name);
    if (!missing.length) return items;
    const missingIDs = [...new Set(missing.flatMap(item => taxa.ids(item)))];
    const names = new Map();
    for (let index = 0; index < missingIDs.length; index += 30) {
      const batch = missingIDs.slice(index, index + 30);
      try {
        const url = new URL(`https://api.inaturalist.org/v1/taxa/${batch.join(",")}`);
        url.searchParams.set("locale", globalThis.LeafwiseI18n?.locale() || "zh-CN");
        url.searchParams.set("per_page", "30");
        const response = await fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
        if (!response.ok) continue;
        const data = await response.json();
        if (!Array.isArray(data.results)) continue;
        data.results.forEach(item => {
          const name = typeof item.preferred_common_name === "string" && item.preferred_common_name.trim()
            ? item.preferred_common_name.trim() : typeof item.name === "string" ? item.name.trim() : "";
          if (name) names.set(item.id, name);
        });
      } catch { /* Keep the ID when a name lookup is unavailable. */ }
    }
    return items.map(item => ({ ...item, name: item.name || taxa.ids(item).map(id => names.get(id) || t("类群 {0}", id)).join(" / ") }));
  }

  document.querySelector("#taxa-form").addEventListener("submit", async event => {
    event.preventDefault();
    taxaButton.disabled = true;
    taxaStatus.textContent = t("正在保存…");
    try {
      const parsed = taxa.parse(taxaInput.value);
      const resolved = await resolveTaxa(parsed);
      await chrome.storage.sync.set({ savedTaxa: resolved });
      taxaInput.value = taxa.format(resolved);
      taxaStatus.textContent = resolved.length ? t("已保存 {0} 个常用类群。", resolved.length) : t("已清空常用类群列表。");
    } catch (error) {
      taxaStatus.textContent = localizedError(error?.message || t("保存失败，请重试。"));
    } finally { taxaButton.disabled = false; }
  });
})();
