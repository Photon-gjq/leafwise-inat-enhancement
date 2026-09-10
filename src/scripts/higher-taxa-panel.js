(() => {
  "use strict";
  const core = globalThis.QGInatHigherTaxa;
  const filters = globalThis.QGInatFilters;
  if (!core || !filters?.isSearchPage(location.href) || document.getElementById("qg-inat-higher-taxa")) return;
  const triggerHost = document.createElement("span");
  triggerHost.id = "qg-inat-higher-taxa-trigger";
  const triggerShadow = triggerHost.attachShadow({ mode: "open" });
  triggerShadow.innerHTML = `
    <style>
      :host { display: inline-flex; margin-left: 8px; vertical-align: middle; }
      :host([hidden]) { display: none; }
      button { padding: 3px 9px; border: 1px solid #a9b99d; border-radius: 999px; background: #f4f7f1; color: #49613d; font: 12px/1.4 system-ui, sans-serif; white-space: nowrap; cursor: pointer; }
      button:hover { border-color: #66834f; background: #eaf1e4; }
      button:focus-visible { outline: 3px solid #83af53; outline-offset: 2px; }
    </style>
    <button type="button">未观察的高阶</button>`;
  const trigger = triggerShadow.querySelector("button");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "qg-inat-higher-taxa");
  const host = document.createElement("div");
  host.id = "qg-inat-higher-taxa";
  const shadow = host.attachShadow({ mode: "open" });
  // Only this constant template uses innerHTML. API and user text use textContent.
  shadow.innerHTML = `
    <style>
      :host { display: block; clear: both; color-scheme: light; }
      :host([hidden]), [hidden] { display: none !important; }
      * { box-sizing: border-box; }
      .qg { color: #293524; font: 14px/1.5 system-ui, sans-serif; }
      button, input, select { min-height: 34px; padding: 6px 9px; border: 1px solid #95a58b; border-radius: 4px; background: white; color: #293524; font: inherit; }
      button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
      button:hover:not(:disabled) { background: #eaf1e4; } :focus-visible { outline: 3px solid #83af53; outline-offset: 2px; }
      .panel { margin: 10px 16px 12px; padding: 16px; border: 1px solid #ccd9c0; border-radius: 6px; background: #f5f8f0; }
      .heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
      h2 { margin: 0; font-size: 18px; font-weight: 650; } p { margin: 8px 0 12px; }
      .muted { color: #607056; font-size: 12px; } .close { min-height: 28px; border: 0; background: transparent; font-size: 20px; }
      form { margin: 0; } .fields { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr 1.2fr; gap: 12px; }
      label { display: block; font-weight: 600; } input, select { display: block; width: 100%; margin-top: 5px; }
      .hint { display: block; margin-top: 4px; font-size: 11px; color: #607056; font-weight: 400; }
      .actions, .result-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .primary { background: #496f29; border-color: #496f29; color: white; } .primary:hover:not(:disabled) { background: #3d5f21; }
      .status { margin-top: 12px; white-space: pre-wrap; } .error { color: #963d20; }
      .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 8px; }
      .stat { padding: 6px 12px; border: 1px solid #ccd9c0; border-radius: 4px; background: #fff; }
      .stat strong { margin-left: 8px; color: #496f29; font-size: 19px; }
      .result-tools input { flex: 1 1 180px; max-width: 320px; margin-top: 0; } .result-tools select { width: auto; margin-top: 0; }
      .table-wrap { overflow-x: auto; margin-top: 12px; border: 1px solid #d4decc; border-radius: 4px; background: #fff; }
      table { width: 100%; border-collapse: collapse; text-align: left; } th { background: #e8eee3; font-weight: 600; white-space: nowrap; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #e3e9df; } tr:last-child td { border-bottom: 0; }
      .taxon-heading { display: inline-flex; align-items: center; gap: 7px; }
      .refresh-names { min-height: 24px; padding: 1px 6px; border-color: #a9b99d; color: #49613d; font-size: 15px; line-height: 1; }
      td:first-child { min-width: 180px; } .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      a { color: #496f29; text-decoration: underline; text-underline-offset: 2px; }
      .taxon-name { white-space: nowrap; } .scientific { font-style: italic; }
      .taxon-name .scientific.secondary { margin-left: 7px; color: #6b7664; font-size: 12px; }
      .leaf-check { margin-left: 8px; min-height: 26px; padding: 2px 6px; font-size: 11px; }
      .pager { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 10px; }
      details { margin-top: 12px; } summary { cursor: pointer; } .sources { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
      @media (max-width: 900px) { .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 520px) { .panel { margin-inline: 8px; padding: 12px; } .fields { grid-template-columns: 1fr; } .heading { align-items: start; } th, td { padding: 8px; } }
    </style>
    <div class="qg">
      <section id="panel" class="panel" aria-label="未观察到的高阶分类单元" hidden>
        <div class="heading"><h2>未观察到的高阶分类单元</h2><button type="button" class="close" aria-label="收起面板">×</button></div>
        <p class="muted">列出当地有观察记录、但指定用户在全球尚无记录的目、科、属等。用户在该单元或其任一后代有记录，即视为见过。</p>
        <form>
          <div class="fields">
            <label>对比用户<select id="user-choice" aria-label="选择对比用户" disabled></select><input id="user" aria-label="指定其他对比用户" placeholder="用户名或用户 ID" required autocomplete="off" spellcheck="false" hidden><span class="hint">全球全部观察，含 Casual</span></label>
            <label>地点 ID<input id="place" placeholder="6903,7613,7887,10301" maxlength="400" autocomplete="off" spellcheck="false"><span class="hint">多个 ID 用逗号分隔；支持 any（全球）；留空使用提示值</span></label>
            <label>类群 ID<select id="taxon-choice" aria-label="选择常用类群" disabled></select><input id="taxon" aria-label="指定其他类群 ID" placeholder="输入类群 ID" inputmode="numeric" pattern="[0-9]+" required hidden><span class="hint">可选择常用类群或输入其他 ID</span></label>
            <label>统计层级<select id="rank"></select><span class="hint">包含该层级下所有后代</span></label>
            <label>当地观察范围<select id="quality"><option value="any">全部（含 Casual）</option><option value="verifiable">可验证观察</option><option value="research">仅 Research Grade</option></select><span class="hint">全部可能包含圈养／栽培记录</span></label>
          </div>
          <div class="actions"><button type="submit" class="primary">开始对比</button><button type="button" id="read-page">读取当前页面</button><button type="button" id="example">示例：中国鸟类的目</button></div>
        </form>
        <div id="status" class="status" role="status" aria-live="polite"></div>
        <div id="results" hidden>
          <div id="stats" class="stats"></div><div id="scope" class="muted"></div>
          <div class="result-tools"><input id="search" aria-label="筛选结果的中文名或学名" placeholder="查找中文名或学名…"><select id="sort" aria-label="结果排序"><option value="count">当地观察数：多到少</option><option value="name">学名：A–Z</option><option value="leaves">Leaf taxa：多到少</option></select></div>
          <div class="table-wrap"><table><thead><tr><th><span class="taxon-heading">分类单元<button id="refresh-names" class="refresh-names" type="button" aria-label="强制刷新当前分类单元的中文名" title="强制刷新当前分类单元的中文名">↻</button></span></th><th>Rank</th><th class="num">当地观察数</th><th class="num">Leaf taxa</th></tr></thead><tbody></tbody></table></div>
          <div class="pager"><button id="prev" type="button">上一页</button><span id="page-info"></span><button id="next" type="button">下一页</button></div>
          <div id="sources" class="sources muted"></div>
        </div>
        <details><summary class="muted">统计口径与请求说明</summary><p class="muted">只使用上方的用户、地点、类群、层级和当地观察范围；当前页面的日期、项目、地图框、排除物种等其他筛选不参与。Rank 只用于汇总，不作为观察鉴定等级筛选。多个地点取并集（满足任意一个地点），官方 API 对重叠范围的同一观察只计一次；不将各地数量直接相加。支持中英文逗号、逗号两侧空格和重复 ID，最多 20 个不同地点；any 表示全球。当地观察数包含直接鉴定到本单元及其全部后代的记录。“有记录”不代表当地原生或野生分布；“未观察到”仅指该用户在 iNaturalist 的公开记录。</p><p class="muted">Leaf taxa 默认由分类树计算：亚种等归并到种，再数末端分类单元（可含仅鉴定到属、科等的末端记录）。每行“核验”额外请求一次官方 species_counts；差异时显示官方值。首次对比先取得用户、地点、类群和两棵分类树并立即显示学名结果（指定地点通常 5 次请求，全球通常 4 次）；中文名随后每 30 项一批、最多两批并发逐步填入。分类树缓存 10 分钟，中文名缓存 30 天；刷新名称按钮会绕过名称缓存。请求失败不会当成零条观察。</p></details>
      </section>
    </div>`;
  const $ = selector => shadow.querySelector(selector);
  const fieldIDs = ["user", "place", "taxon", "rank", "quality"];
  for (const [rank, label] of Object.entries(core.rankNames)) $("#rank").add(new Option(`${label} · ${rank}`, rank));
  let usernames = [];
  let userSettings = {};
  let commonTaxa = [];
  let lastHref = location.href;
  let dirty = false;
  let busy = false;
  let refreshingNames = false;
  let nameLoadVersion = 0;
  let generation = 0;
  let result = null;
  let page = 0;
  const verified = new Map();
  const checking = new Set();
  const fmt = n => n.toLocaleString();
  function status(text, error = false) { $("#status").textContent = text; $("#status").classList.toggle("error", error); }
  function fallbackUser() {
    const href = document.querySelector(".navtab.user a.observations_link[href]")?.getAttribute("href");
    if (href) {
      try {
        const match = new URL(href, location.href).pathname.match(/^\/observations\/([^/]+)\/?$/);
        if (match) return decodeURIComponent(match[1]);
      } catch {}
    }
    return usernames[0] || "";
  }
  function populateUser(value) {
    const current = String(value ?? "").trim();
    const select = $("#user-choice");
    const input = $("#user");
    select.replaceChildren();
    usernames.forEach(username => select.add(new Option(username, `user:${username}`)));
    select.add(new Option("指定其他用户…", "custom"));
    select.add(new Option("管理常用用户…", "settings"));
    const saved = usernames.find(username => username.toLowerCase() === current.toLowerCase());
    select.value = saved ? `user:${saved}` : "custom";
    input.value = saved || current;
    input.hidden = select.value !== "custom";
    input.required = !input.hidden;
    select.disabled = busy;
  }
  function populateTaxon(value) {
    const current = String(value ?? "").trim();
    const select = $("#taxon-choice");
    const input = $("#taxon");
    select.replaceChildren();
    commonTaxa.forEach(taxon => select.add(new Option(`${taxon.name || `类群 ${taxon.id}`}（${taxon.id}）`, `taxon:${taxon.id}`)));
    select.add(new Option("指定其他类群…", "custom"));
    select.add(new Option("管理常用类群…", "settings"));
    const saved = commonTaxa.find(taxon => String(taxon.id) === current);
    const allLife = !current && commonTaxa.find(taxon => taxon.id === 48460);
    const selected = saved || allLife;
    select.value = selected ? `taxon:${selected.id}` : "custom";
    input.value = selected ? String(selected.id) : current;
    input.hidden = select.value !== "custom";
    input.required = !input.hidden;
    select.disabled = busy;
  }
  function setFields(values) {
    fieldIDs.forEach(key => {
      if (key === "user") populateUser(values[key]);
      else if (key === "taxon") populateTaxon(values[key]);
      else $(`#${key}`).value = values[key] ?? "";
    });
  }
  async function openSettings() {
    try {
      const reply = await chrome.runtime.sendMessage({ type: "qg-open-options" });
      if (!reply?.ok) throw new Error("options");
    } catch { status("无法打开设置，请点击浏览器工具栏中的扩展图标。", true); }
  }
  function invalidate() {
    generation++;
    nameLoadVersion++;
    refreshingNames = false;
    result = null;
    verified.clear();
    $("#results").hidden = true;
  }
  function readPage() {
    invalidate();
    setFields(core.pageDefaults(location.href, fallbackUser()));
    dirty = false;
    lastHref = location.href;
    status("已读取页面条件。请检查对比用户及地点／类群 ID，再开始对比。");
  }
  function expand(open) {
    if (open) mountPanel();
    host.hidden = false;
    $("#panel").hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      requestAnimationFrame(() => {
        host.scrollIntoView({ behavior: "smooth", block: "start" });
        $("#user").focus({ preventScroll: true });
      });
    } else trigger.focus();
  }
  trigger.addEventListener("click", event => {
    expand($("#panel").hidden);
  });
  $(".close").addEventListener("click", () => expand(false));
  $("#panel").addEventListener("keydown", event => { if (event.key === "Escape") expand(false); });
  $("#read-page").addEventListener("click", readPage);
  $("#example").addEventListener("click", () => {
    invalidate();
    setFields({ user: $("#user").value.trim(), place: 6903, taxon: 3, rank: "order", quality: "any" });
    dirty = true;
    status("已填入中国鸟类示例；全部观察包含 Casual，可能有圈养记录。");
  });
  $("#taxon-choice").addEventListener("change", () => {
    const select = $("#taxon-choice");
    const input = $("#taxon");
    const previous = input.value;
    if (select.value === "settings") {
      populateTaxon(previous);
      openSettings();
      return;
    }
    if (select.value === "custom") {
      input.hidden = false;
      input.required = true;
      input.focus();
    } else {
      input.value = select.value.slice(6);
      input.hidden = true;
      input.required = false;
    }
    dirty = true;
    invalidate();
    status("条件已修改，请开始对比。");
  });
  $("#user-choice").addEventListener("change", () => {
    const select = $("#user-choice");
    const input = $("#user");
    const previous = input.value;
    if (select.value === "settings") {
      populateUser(previous);
      openSettings();
      return;
    }
    if (select.value === "custom") {
      input.hidden = false;
      input.required = true;
      input.focus();
    } else {
      input.value = select.value.slice(5);
      input.hidden = true;
      input.required = false;
    }
    dirty = true;
    invalidate();
    status("条件已修改，请开始对比。");
  });
  $("form").addEventListener("input", event => {
    if (event.target === $("#user-choice") || event.target === $("#taxon-choice")) return;
    dirty = true; invalidate(); status("条件已修改，请开始对比。");
  });
  function setBusy(value) {
    busy = value;
    $("form").querySelectorAll("input, select, button").forEach(el => { el.disabled = value; });
    $("#panel").setAttribute("aria-busy", String(value));
    $("#refresh-names").disabled = value || refreshingNames;
  }
  function link(text, url, className) {
    const a = document.createElement("a");
    a.textContent = text; a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    if (className) a.className = className;
    return a;
  }
  function stat(label, count) {
    const el = document.createElement("span"); el.className = "stat"; el.textContent = label;
    const value = document.createElement("strong"); value.textContent = fmt(count); el.append(value); return el;
  }
  function renderRows() {
    if (!result) return;
    const term = $("#search").value.trim().toLowerCase();
    const rows = result.rows.filter(r => `${r.commonName || ""} ${r.name}`.toLowerCase().includes(term));
    const leafValue = row => verified.get(row.id)?.count ?? row.leaves;
    rows.sort($("#sort").value === "name" ? (a, b) => a.name.localeCompare(b.name) : $("#sort").value === "leaves" ? (a, b) => leafValue(b) - leafValue(a) || b.count - a.count : (a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const pageCount = Math.max(1, Math.ceil(rows.length / 50));
    page = Math.min(page, pageCount - 1);
    const body = $("tbody"); body.replaceChildren();
    for (const row of rows.slice(page * 50, (page + 1) * 50)) {
      const tr = document.createElement("tr");
      tr.dataset.taxonId = String(row.id);
      const name = document.createElement("td");
      const taxonLink = link("", `https://www.inaturalist.org/taxa/${row.id}`, "taxon-name");
      if (row.commonName) {
        const common = document.createElement("span"); common.className = "common"; common.textContent = row.commonName;
        const scientific = document.createElement("span"); scientific.className = "scientific secondary"; scientific.textContent = row.name;
        taxonLink.append(common, scientific);
      } else {
        const scientific = document.createElement("span"); scientific.className = "scientific"; scientific.textContent = row.name;
        taxonLink.append(scientific);
      }
      name.append(taxonLink);
      const rank = document.createElement("td"); rank.textContent = `${core.rankNames[row.rank]} · ${row.rank}`;
      const count = document.createElement("td"); count.className = "num"; count.append(link(fmt(row.count), core.observationsURL(result.options, row.id)));
      const leaves = document.createElement("td"); leaves.className = "num";
      const leaf = verified.get(row.id); const number = document.createElement("span");
      number.textContent = fmt(leafValue(row)); number.title = leaf ? `官方 species_counts；分类树计算值 ${row.leaves}` : "分类树计算值（亚种等归并到种）"; leaves.append(number);
      if (leaf) {
        const mark = link(leaf.count === row.leaves ? " ✓" : " 官方", leaf.url); mark.title = number.title; leaves.append(mark);
      } else {
        const check = document.createElement("button"); check.type = "button"; check.className = "leaf-check";
        check.textContent = checking.has(row.id) ? "核验中…" : "核验"; check.disabled = checking.has(row.id);
        check.setAttribute("aria-label", `核验 ${row.name} 的 leaf taxa 数`);
        check.addEventListener("click", () => verify(row)); leaves.append(check);
      }
      tr.append(name, rank, count, leaves); body.append(tr);
    }
    if (!rows.length) {
      const td = document.createElement("td"); td.colSpan = 4;
      td.textContent = term ? "没有符合名称筛选的结果。" : result.total === 0 ? "当地在此范围下没有该层级的已记录分类单元。" : "当地已记录的该层级分类单元，该用户都已有观察记录。";
      const tr = document.createElement("tr"); tr.append(td); body.append(tr);
    }
    $("#page-info").textContent = `${page + 1} / ${pageCount} 页 · ${fmt(rows.length)} 项`;
    $("#prev").disabled = page === 0; $("#next").disabled = page >= pageCount - 1;
  }
  async function verify(row) {
    if (!result || checking.has(row.id)) return;
    const current = generation; const options = result.options;
    checking.add(row.id); renderRows();
    try {
      const reply = await chrome.runtime.sendMessage({ type: "qg-higher-taxa-leaf", options, taxonId: row.id });
      if (current !== generation) return;
      if (!reply?.ok) throw new Error(reply?.error || "扩展连接中断，请刷新页面。");
      verified.set(row.id, reply.result);
      status(`${row.name}：官方 leaf taxa = ${fmt(reply.result.count)}${reply.result.count === row.leaves ? "，与分类树一致。" : `，与树计算值 ${fmt(row.leaves)} 有差异，已采用官方值（可能因缓存时间或分类变化）。`}`);
    } catch (error) { if (current === generation) status(error.message, true); }
    finally { checking.delete(row.id); if (current === generation) renderRows(); }
  }
  async function loadNames(force = false) {
    if (!result || busy || refreshingNames || !result.rows.length) return;
    const current = generation;
    const version = ++nameLoadVersion;
    refreshingNames = true;
    const button = $("#refresh-names");
    button.disabled = true;
    button.textContent = "…";
    const byID = new Map(result.rows.map(row => [row.id, row]));
    const visible = [...$("tbody").querySelectorAll("tr[data-taxon-id]")]
      .map(row => Number(row.dataset.taxonId)).filter(id => byID.has(id));
    const ordered = [...new Set([...visible, ...result.rows.map(row => row.id)])];
    const batches = [];
    for (let index = 0; index < ordered.length; index += 30) batches.push(ordered.slice(index, index + 30));
    let next = 0;
    let completed = 0;
    let failure = null;
    status(force ? "正在强制刷新中文名；当前页优先…" : "结果已显示，正在加载中文名；当前页优先…");
    try {
      async function worker() {
        while (!failure && current === generation && version === nameLoadVersion) {
          const index = next++;
          if (index >= batches.length) return;
          const ids = batches[index];
          const reply = await chrome.runtime.sendMessage({
            type: force ? "qg-higher-taxa-refresh-names" : "qg-higher-taxa-names",
            options: result.options,
            taxonIds: ids
          });
          if (current !== generation || version !== nameLoadVersion) return;
          if (!reply?.ok) {
            failure = new Error(reply?.error || "扩展连接中断，请刷新页面后重试。");
            return;
          }
          ids.forEach(id => { byID.get(id).commonName = reply.result.names[id] || ""; });
          completed += ids.length;
          renderRows();
          status(`${force ? "刷新" : "加载"}中文名：${completed} / ${ordered.length}`);
        }
      }
      await Promise.all([worker(), worker()]);
      if (current !== generation || version !== nameLoadVersion) return;
      if (failure) throw failure;
      status(`${force ? "已刷新" : "已加载"} ${completed} 个分类单元的中文名。`);
    } catch (error) {
      if (current === generation && version === nameLoadVersion) {
        status(`分类单元列表已保留；中文名只完成 ${completed} / ${ordered.length}。${error.message}`, true);
      }
    }
    finally {
      if (version === nameLoadVersion) {
        refreshingNames = false;
        button.disabled = busy;
        button.textContent = "↻";
      }
    }
  }
  $("form").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    invalidate();
    const current = generation;
    try {
      const values = Object.fromEntries(fieldIDs.map(key => [key, $(`#${key}`).value]));
      if (!values.place.trim()) values.place = $("#place").placeholder;
      const options = core.normalize(values);
      setBusy(true);
      status("正在核实输入并获取当地与用户全球分类树…首次查询可能需要数十秒；全部生物或多地点的大型分类树下载可能需要约 2 分钟。");
      const reply = await chrome.runtime.sendMessage({ type: "qg-higher-taxa-compare", options });
      if (current !== generation) return;
      if (!reply?.ok) throw new Error(reply?.error || "扩展连接中断，请刷新页面后重试。");
      result = reply.result; page = 0; $("#search").value = "";
      $("#stats").replaceChildren(stat("当地已记录", result.total), stat("用户已见", result.seen), stat("尚未观察", result.rows.length));
      const quality = { any: "全部（含 Casual）", verifiable: "可验证", research: "Research Grade" }[options.quality];
      $("#scope").textContent = `${result.place.name}（${options.place}） · ${result.taxon.name}（${options.taxon}） · ${core.rankNames[options.rank]} · 当地 ${quality} / ${fmt(result.regionObservations)} 条观察；${result.user.name} 全球全部 / ${fmt(result.personalObservations)} 条。当地数据读取于 ${new Date(result.regionAt).toLocaleString()}，个人数据读取于 ${new Date(result.personalAt).toLocaleString()}。`;
      $("#sources").replaceChildren(link("当地分类树 API", result.regionURL), link("用户全球分类树 API", result.personalURL));
      $("#results").hidden = false;
      status(`对比完成：${result.rows.length} 个${core.rankNames[options.rank]}尚无该用户的观察记录；正在逐步加载中文名。`);
      renderRows();
      queueMicrotask(() => loadNames(false));
    } catch (error) { if (current === generation) status(error.message, true); }
    finally { setBusy(false); }
  });
  $("#search").addEventListener("input", () => { page = 0; renderRows(); });
  $("#sort").addEventListener("change", () => { page = 0; renderRows(); });
  $("#prev").addEventListener("click", () => { page--; renderRows(); });
  $("#next").addEventListener("click", () => { page++; renderRows(); });
  $("#refresh-names").addEventListener("click", () => loadNames(true));
  function mountPanel() {
    const existing = document.getElementById("qg-inat-user-filters");
    if (existing?.parentElement) {
      if (existing.nextElementSibling !== host) existing.after(host);
    } else if (!host.isConnected) {
      const container = document.querySelector("#observations-search, #observations, main, #wrapper, #main") || document.body;
      container.prepend(host);
    }
  }
  function mount() {
    const searchPage = filters.isSearchPage(location.href);
    host.hidden = !searchPage;
    triggerHost.hidden = !searchPage;
    if (!searchPage) return;
    const heading = document.querySelector("#filters > h1, #filters h1");
    const summary = document.getElementById("qg-inat-user-filters-summary");
    if (heading) {
      if (summary?.parentElement === heading) {
        if (summary.nextElementSibling !== triggerHost) summary.after(triggerHost);
      } else if (triggerHost.parentElement !== heading) heading.append(triggerHost);
    }
    // Do not compete with content.js for SearchBar.nextElementSibling.
    mountPanel();
    if (lastHref !== location.href) {
      lastHref = location.href;
      invalidate();
      status("页面筛选已变化；面板保留当前填写内容，可点击“读取当前页面”同步后对比。");
    }
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(mount, 750);
  window.addEventListener("popstate", mount);
  readPage(); mount();
  const settingKeys = [...globalThis.QGInatUsers.storageKeys, ...globalThis.QGInatSavedTaxa.storageKeys];
  chrome.storage.sync.get(settingKeys).then(data => {
    userSettings = data;
    usernames = globalThis.QGInatUsers.read(userSettings);
    commonTaxa = globalThis.QGInatSavedTaxa.read(data);
    if (!dirty && !busy && !result) setFields(core.pageDefaults(location.href, fallbackUser()));
  }).catch(() => { /* Manual entry remains available without synced settings. */ });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.savedUsernames || changes.unobservedByUserId) {
      const current = $("#user").value;
      for (const key of globalThis.QGInatUsers.storageKeys) {
        if (changes[key]) userSettings[key] = changes[key].newValue;
      }
      usernames = globalThis.QGInatUsers.read(userSettings);
      populateUser(current);
    }
    if (changes.savedTaxa) {
      const current = $("#taxon").value;
      commonTaxa = globalThis.QGInatSavedTaxa.read({ savedTaxa: changes.savedTaxa.newValue });
      populateTaxon(current);
    }
  });
})();
