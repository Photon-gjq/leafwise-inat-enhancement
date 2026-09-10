(() => {
  "use strict";
  const core = globalThis.QGInatHigherTaxa;
  const tools = globalThis.LeafwiseExploreTools;
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
    <button type="button">類群對比</button>`;
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
      .extra-fields { margin-top:12px; grid-template-columns:repeat(3,minmax(0,1fr)); } .library { border-top:1px solid #ccd9c0;padding-top:10px; }
      .library .actions input,.library .actions select {width:auto;flex:1 1 180px;margin:0} textarea {width:100%;min-height:90px;font:12px/1.5 monospace}
      @media (max-width: 900px) { .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 520px) { .panel { margin-inline: 8px; padding: 12px; } .fields { grid-template-columns: 1fr; } .heading { align-items: start; } th, td { padding: 8px; } }
    </style>
    <div class="qg">
      <section id="panel" class="panel" aria-label="類群對比" hidden>
        <div class="heading"><h2>類群對比</h2><button type="button" class="close" aria-label="收起面板">×</button></div>
        <p class="muted">比較當地已記錄的目、科、屬等。使用者在該單元或任一後代有記錄，即視為見過；年份以觀察日期計算，無日期記錄不參與年份對比。</p>
        <form>
          <div class="fields">
            <label>对比用户<select id="user-choice" aria-label="选择对比用户" disabled></select><input id="user" aria-label="指定其他对比用户" placeholder="用户名或用户 ID" required autocomplete="off" spellcheck="false" hidden><span class="hint">個人基準包含 Casual</span></label>
            <label>地點組合<select id="place-choice" aria-label="地點組合"></select><input id="place" aria-label="地點 ID" placeholder="6903,7613,7887,10301" maxlength="400" autocomplete="off" spellcheck="false"><span id="place-members" class="hint"></span><span class="hint">多個 ID 用逗號分隔；any＝全球</span></label>
            <label>类群 ID<select id="taxon-choice" aria-label="选择常用类群" disabled></select><input id="taxon" aria-label="指定其他类群 ID" placeholder="输入类群 ID" inputmode="numeric" pattern="[0-9]+" required hidden><span class="hint">可选择常用类群或输入其他 ID</span></label>
            <label>统计层级<select id="rank"></select><span class="hint">包含该层级下所有后代</span></label>
            <label>当地观察范围<select id="quality"><option value="any">全部（含 Casual）</option><option value="verifiable">可验证观察</option><option value="research">仅 Research Grade</option></select><span class="hint">全部可能包含圈养／栽培记录</span></label>
          </div>
          <div class="fields extra-fields">
            <label>對比範圍<select id="comparison"></select></label>
            <label id="year-label">對比年份<input id="year" type="number" min="1700" max="9999" aria-label="對比年份"></label>
            <label>當地月份<input id="months" placeholder="全部；例如 3,4,5" aria-label="當地月份"><span class="hint">歷年同月份；不限制個人基準</span></label>
          </div>
          <details><summary>當地日期與項目篩選</summary><div class="fields extra-fields">
            <label>開始日期<input id="d1" type="date"></label><label>結束日期<input id="d2" type="date"></label><label>項目 ID<input id="project" inputmode="numeric" placeholder="不限"></label>
          </div></details>
          <div class="actions"><button type="submit" class="primary">开始对比</button><button type="button" id="this-month">這個月份可以找什麼</button><button type="button" id="read-page">读取当前页面</button><button type="button" id="example">示例：中國大陸+港澳臺鳥類各目</button></div>
        </form>
        <details class="library"><summary>查詢收藏與自訂地點組合</summary>
          <p class="muted">收藏會保存完整搜尋網址及本面板條件。載入後請按「開始對比」。資料保存在此瀏覽器。</p>
          <div class="actions"><select id="query-choice" aria-label="查詢收藏"></select><input id="query-name" aria-label="查詢收藏名稱" placeholder="收藏名稱" maxlength="80"><button id="save-query" type="button">保存／更新查詢</button><button id="load-query" type="button">載入查詢</button><button id="remove-query" type="button">刪除查詢</button></div>
          <div class="actions"><input id="place-name" aria-label="自訂地點組合名稱" placeholder="自訂地點組合名稱" maxlength="80"><button id="save-place" type="button">保存／更新地點組合</button><button id="remove-place" type="button">刪除自訂組合</button></div>
          <p class="muted">先在上方選擇組合並修改 ID，再保存；內建組合會另存為自訂組合。</p>
        </details>
        <div id="status" class="status" role="status" aria-live="polite"></div>
        <div id="results" hidden>
          <div id="stats" class="stats"></div><div id="scope" class="muted"></div>
          <div class="result-tools"><input id="search" aria-label="筛选结果的中文名或学名" placeholder="查找中文名或学名…"><select id="sort" aria-label="结果排序"><option value="count">当地观察数：多到少</option><option value="name">学名：A–Z</option><option value="leaves">Leaf taxa：多到少</option></select><button id="copy-results" type="button">複製結果</button><button id="export-results" type="button">匯出 CSV</button></div>
          <p class="muted">複製與匯出包含所有符合名稱篩選的結果，依目前排序；不限於本頁。月份觀察數不代表遇見機率。</p>
          <textarea id="copy-fallback" aria-label="手動複製結果" readonly hidden></textarea>
          <div class="table-wrap"><table><thead><tr><th><span class="taxon-heading">分类单元<button id="refresh-names" class="refresh-names" type="button" aria-label="强制刷新当前分类单元的中文名" title="强制刷新当前分类单元的中文名">↻</button></span></th><th>Rank</th><th class="num">当地观察数</th><th class="num">Leaf taxa</th></tr></thead><tbody></tbody></table></div>
          <div class="pager"><button id="prev" type="button">上一页</button><span id="page-info"></span><button id="next" type="button">下一页</button></div>
          <div id="sources" class="sources muted"></div>
        </div>
        <details><summary class="muted">統計口徑與請求說明</summary><p class="muted">對比只使用面板顯示的條件；「讀取目前頁面」帶入月份、日期、數字項目 ID，地圖框及排除條件等不參與對比，完整網址仍可收藏。月份、日期、項目與品質只篩選當地候選清單。「已見但該年／此地未見」只列出生涯已見的類群，再排除該年／該地記錄；首次記錄模式比較該年與該年以前的全球記錄，並只列出當地候選清單中的類群。若日後補上更早的記錄或分類變更，首次記錄結果也會改變。</p><p class="muted">Rank 只用於彙總，不作為鑑定等級篩選。多地點取聯集，不直接相加。每個分組成員明列於地點欄；最多 20 個不同 ID，any＝全球。有記錄不等於當地原生或野生分布，個人基準僅指公開可讀的記錄。Leaf taxa 把亞種等歸併到種；每行核驗另請求一次 species_counts。生涯未見使用兩棵分類樹，其他模式最多三棵；分類樹快取 10 分鐘、中文名 30 天，換 rank 共用快取。錯誤不當作零筆，匯出不增加 API 請求。</p></details>
      </section>
    </div>`;
  const $ = selector => shadow.querySelector(selector);
  const fieldIDs = ["user", "place", "taxon", "rank", "quality", "comparison", "year", "months", "d1", "d2", "project"];
  for (const [rank, label] of Object.entries(core.rankNames)) $("#rank").add(new Option(`${label} · ${rank}`, rank));
  for (const [value,label] of Object.entries(core.comparisonNames)) $("#comparison").add(new Option(label,value));
  let library = {queries:[],groups:[]};
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
    values = {comparison:"lifetime",year:new Date().getFullYear(),...values};
    fieldIDs.forEach(key => {
      if (key === "user") populateUser(values[key]);
      else if (key === "taxon") populateTaxon(values[key]);
      else $(`#${key}`).value = values[key] ?? "";
    });
    updateScope(); populatePlaces();
  }
  function updateScope() { $("#year-label").hidden = !["year","first"].includes($("#comparison").value); }
  function values() {
    const data = Object.fromEntries(fieldIDs.map(key=>[key,$(`#${key}`).value]));
    if (!data.place.trim()) data.place = $("#place").placeholder;
    return core.normalize(data);
  }
  function populatePlaces(selected) {
    const select=$("#place-choice"); select.replaceChildren(new Option("自訂 ID…",""),new Option("全球","any"));
    for(const group of [...tools.groups,...library.groups]) select.add(new Option(group.name,group.id));
    let canonical;try{canonical=core.placeIDs($("#place").value).join(",");}catch{}
    const group=[...tools.groups,...library.groups].find(group=>group.place===canonical);
    select.value=selected??($("#place").value==="any"?"any":group?.id||"");
    $("#place-members").textContent=canonical?String(canonical).split(",").map(id=>`${tools.places[id]||"地點"}（${id}）`).join("、"):"";
  }
  function populateQueries(selected="") {
    $("#query-choice").replaceChildren(new Option("新增查詢收藏…",""));
    for(const item of library.queries) $("#query-choice").add(new Option(item.name,item.id));
    $("#query-choice").value=selected;
  }
  async function libraryAction(action,entry) {
    const reply=await chrome.runtime.sendMessage({type:"leafwise-explore-library",action,entry});
    if(!reply?.ok)throw new Error(reply?.error||"無法讀取收藏。");
    library=reply.library; return library;
  }
  function handleLibrary(id, callback) { $(id).addEventListener("click",async()=>{
    if(busy)return;
    const button=$(id);button.disabled=true;
    try{await callback();}catch(error){status(error.message,true);}finally{button.disabled=false;}
  }); }
  $("#place-choice").addEventListener("change",()=>{
    const group=[...tools.groups,...library.groups].find(group=>group.id===$("#place-choice").value);
    if(group){$("#place").value=group.place;$("#place-name").value=group.name;}
    else $("#place").value=$("#place-choice").value==="any"?"any":"";
    populatePlaces(group?.id);dirty=true;invalidate();status("地點已修改，請開始對比。");
  });
  $("#query-choice").addEventListener("change",()=>{$("#query-name").value=library.queries.find(item=>item.id===$("#query-choice").value)?.name||"";});
  handleLibrary("#save-query",async()=>{
    const entry={id:$("#query-choice").value||undefined,name:$("#query-name").value,url:location.href,options:values()};
    await libraryAction("save-query",entry);populateQueries(entry.id||library.queries.at(-1).id);status("已保存完整搜尋網址與對比條件。");
  });
  handleLibrary("#load-query",async()=>{
    const entry=library.queries.find(item=>item.id===$("#query-choice").value);if(!entry)throw new Error("請先選擇查詢收藏。");
    const url=new URL(tools.searchURL(entry.url));
    if(url.href!==tools.searchURL(location.href)){url.searchParams.set("leafwise_query",entry.id);location.assign(url.href);return;}
    invalidate();setFields(entry.options);dirty=true;status("已還原收藏，請開始對比。");
  });
  handleLibrary("#remove-query",async()=>{await libraryAction("remove-query",{id:$("#query-choice").value});populateQueries();$("#query-name").value="";status("已刪除查詢收藏。");});
  handleLibrary("#save-place",async()=>{
    const entry={id:library.groups.find(group=>group.id===$("#place-choice").value)?.id,name:$("#place-name").value,place:$("#place").value};
    await libraryAction("save-place",entry);populatePlaces(entry.id||library.groups.at(-1).id);status("已保存自訂地點組合。");
  });
  handleLibrary("#remove-place",async()=>{await libraryAction("remove-place",{id:$("#place-choice").value});populatePlaces();status("已刪除自訂地點組合，當前 ID 保留。");});
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
    $("#copy-fallback").hidden = true;
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
    setFields({ user: $("#user").value.trim(), place: "6903,7613,7887,10301", taxon: 3, rank: "order", quality: "any" });
    dirty = true;
    status("已填入中國大陸+港澳臺鳥類示例；全部觀察包含 Casual，可能有圈養記錄。");
  });
  $("#comparison").addEventListener("change", updateScope);
  $("#this-month").addEventListener("click",()=>{
    $("#months").value=String(new Date().getMonth()+1);$("#d1").value="";$("#d2").value="";$("#comparison").value="lifetime";$("#sort").value="count";
    updateScope();dirty=true;invalidate();status("已設定歷年本月與生涯未見。請檢查地點及類群，再開始對比。");
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
    if(event.target===$("#place"))populatePlaces(library.groups.some(group=>group.id===$("#place-choice").value)?$("#place-choice").value:undefined);
    dirty = true; invalidate(); status("条件已修改，请开始对比。");
  });
  function setBusy(value) {
    busy = value;
    $("form").querySelectorAll("input, select, button").forEach(el => { el.disabled = value; });
    $(".library").querySelectorAll("input, select, button").forEach(el => { el.disabled = value; });
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
  function filteredRows() {
    if(!result)return [];
    const term = $("#search").value.trim().toLowerCase();
    const rows = result.rows.filter(r => `${r.commonName || ""} ${r.name}`.toLowerCase().includes(term));
    const leafValue = row => verified.get(row.id)?.count ?? row.leaves;
    rows.sort($("#sort").value === "name" ? (a, b) => a.name.localeCompare(b.name) : $("#sort").value === "leaves" ? (a, b) => leafValue(b) - leafValue(a) || b.count - a.count : (a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return rows;
  }
  function renderRows() {
    if (!result) return;
    const rows=filteredRows(), term=$("#search").value.trim();
    const leafValue = row => verified.get(row.id)?.count ?? row.leaves;
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
      td.textContent = term ? "没有符合名称筛选的结果。" : result.total === 0 ? "当地在此范围下没有该层级的已记录分类单元。" : "此範圍內沒有符合所選對比模式的分類單元。";
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
      const options = values();
      setBusy(true);
      status("正在核實輸入並讀取當地與個人分類樹…首次查詢可能需要數十秒；大型分類樹可能需要約 2 分鐘。");
      const reply = await chrome.runtime.sendMessage({ type: "qg-higher-taxa-compare", options });
      if (current !== generation) return;
      if (!reply?.ok) throw new Error(reply?.error || "扩展连接中断，请刷新页面后重试。");
      result = reply.result; page = 0; $("#search").value = "";
      $("#stats").replaceChildren(stat("當地候選", result.total), stat(options.comparison?"其他":"生涯已見", result.seen), stat("符合條件", result.rows.length));
      const quality = { any: "全部（含 Casual）", verifiable: "可验证", research: "Research Grade" }[options.quality];
      const mode=core.comparisonNames[options.comparison||"lifetime"];
      const placeName=library.groups.find(group=>group.place===String(options.place))?.name||tools.placeLabel(options.place,result.place.items);
      $("#scope").textContent = `${placeName}（${options.place}） · ${result.taxon.name}（${options.taxon}） · ${core.rankNames[options.rank]} · ${mode}${options.year?` ${options.year}`:""} · 當地月份 ${options.months||"全部"}，日期 ${options.d1||"不限"} 至 ${options.d2||"不限"}，項目 ${options.project||"不限"} · 當地 ${quality} / ${fmt(result.regionObservations)} 筆；${result.user.name} 個人基準 / ${fmt(result.personalObservations)} 筆。當地資料 ${new Date(result.regionAt).toLocaleString()}，個人資料 ${new Date(result.personalAt).toLocaleString()}。`;
      $("#sources").replaceChildren(link("當地分類樹 API", result.regionURL), link("個人基準分類樹 API", result.personalURL));
      if(result.previousURL)$("#sources").append(link("該年以前分類樹 API",result.previousURL));
      if(result.knownURL)$("#sources").append(link("個人生涯分類樹 API",result.knownURL));
      $("#results").hidden = false;
      status(`對比完成：${result.rows.length} 個${core.rankNames[options.rank]}符合「${mode}」；正在逐步載入中文名。`);
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
  function exportText(delimiter) {
    return tools.exportTable(filteredRows().map(row=>({...row,leaves:verified.get(row.id)?.count??row.leaves})),result.options,core,delimiter);
  }
  $("#copy-results").addEventListener("click",async()=>{
    if(!result)return;
    const text=exportText("\t");
    try{await navigator.clipboard.writeText(text);status(`已複製 ${filteredRows().length} 項結果。`);}
    catch{$("#copy-fallback").value=text;$("#copy-fallback").hidden=false;$("#copy-fallback").focus();$("#copy-fallback").select();status("瀏覽器未允許直接複製；結果已選取，請按 Ctrl/Cmd+C。");}
  });
  $("#export-results").addEventListener("click",()=>{
    if(!result)return;
    const url=URL.createObjectURL(new Blob(["\uFEFF",exportText(",")],{type:"text/csv;charset=utf-8"}));
    const download=document.createElement("a");download.href=url;download.download=`Leafwise-${result.options.rank}-${new Date().toISOString().slice(0,10)}.csv`;shadow.append(download);download.click();download.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    status(`已匯出 ${filteredRows().length} 項結果。`);
  });
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
  libraryAction("list").then(()=>{
    populatePlaces();populateQueries();
    const id=new URL(location.href).searchParams.get("leafwise_query");
    const entry=library.queries.find(item=>item.id===id);
    if(entry && !dirty && !busy){setFields(entry.options);dirty=true;populateQueries(entry.id);$("#query-name").value=entry.name;expand(true);status("已還原查詢收藏，請開始對比。");}
    else if(id&&!entry)status("此查詢收藏不在本瀏覽器中，已保留目前頁面条件。",true);
  }).catch(error=>status(error.message,true));
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
