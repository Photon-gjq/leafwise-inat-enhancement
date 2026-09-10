(() => {
  "use strict";
  if (!/^\/observations\/upload\/?$/.test(location.pathname) || document.getElementById("leafwise-upload-ai")) return;
  const core = globalThis.LeafwiseUploadCore, a = globalThis.LeafwiseUploadAdapter;
  const host = document.createElement("section"); host.id = "leafwise-upload-ai";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{display:block;margin:0 3px 16px;font:14px/1.5 Arial,sans-serif;color:#283521}
      *{box-sizing:border-box}section{background:#f5f8ef;border:1px solid #cad8bd;border-radius:5px;padding:13px 16px}
      h2{font-size:16px;margin:0 0 7px}p{margin:5px 0}.muted{font-size:12px;color:#55654d}
      .controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:10px 0}
      label{display:flex;align-items:center;gap:6px}select,input,button{font:inherit}
      select,input[type=number],button{border:1px solid #9dad90;background:white;border-radius:3px;min-height:32px;padding:4px 8px;color:inherit}
      input[type=number]{width:72px}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}
      button.primary{background:#50772d;color:white;border-color:#50772d}#stop{color:#8e351f}
      #status{margin-top:8px}#status.error{color:#9a301e}details{margin-top:8px}summary{cursor:pointer}
      .scroll{max-height:280px;overflow:auto;margin-top:7px}table{width:100%;border-collapse:collapse;font-size:12px;background:white}
      td,th{padding:6px 8px;border-bottom:1px solid #dde5d6;text-align:left;overflow-wrap:anywhere}th{position:sticky;top:0;background:#e8eedf}
      #count{font-size:12px;margin-left:10px;font-weight:normal}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #608d32;outline-offset:2px}
      @media(max-width:600px){.controls{align-items:flex-start}label{flex-wrap:wrap}section{padding:10px}}
    </style>
    <section aria-label="Leafwise 上傳 AI 助手">
      <h2>Leafwise · 批次套用 AI 首選<span id="count"></span></h2>
      <p class="muted">逐一讀取本頁觀察的原生 AI 建議，只填寫草稿；最後由你檢查並按網站的上傳按鈕。</p>
      <div class="controls">
        <label>選取規則 <select id="mode"><option value="score">分數優先；不可讀時看官方提示</option><option value="official">只看官方「非常確定」提示</option></select></label>
        <label id="threshold-label">視覺分數 &gt; <input id="threshold" type="number" value="80" min="0" max="100" step="0.1" aria-label="AI 視覺分數門檻"> / 100</label>
        <label><input id="only-empty" type="checkbox" checked>保留已填寫的分類／文字</label>
      </div>
      <div class="controls">
        <button id="apply" class="primary" type="button">一鍵套用 AI 首選</button>
        <button id="preview" type="button">僅檢查建議</button>
        <button id="stop" type="button" disabled>停止</button>
        <label><input id="auto" type="checkbox">自動處理空白觀察（目前及後續新增；本頁有效）</label>
      </div>
      <p class="muted">視覺分數不是實際正確率。「非常確定屬於某屬」僅針對上階類群；提示模式會依你的規則，選下方「最佳建議」第一項。未達條件時保留原值。</p>
      <div id="status" role="status" aria-live="polite">先加入照片，再按「一鍵套用」。已開啟的 AI 建議旁會顯示可讀取的視覺分數。</div>
      <details id="report"><summary>處理明細 <span id="summary"></span></summary><div class="scroll"><table><thead><tr><th>觀察卡片</th><th>第一個最佳建議</th><th>視覺分數</th><th>結果／原因</th></tr></thead><tbody></tbody></table></div></details>
    </section>`;
  const $ = selector => shadow.querySelector(selector);
  const attempted = new Map();
  let running = false, controller = null, currentCard = null, scanTimer = null;
  let total = 0, applied = 0, skipped = 0, errors = 0, logCount = 0;
  const status = (text, error = false) => { $("#status").textContent = text; $("#status").classList.toggle("error", error); };
  function options() { return core.settings({ mode: $("#mode").value, threshold: $("#threshold").value, onlyEmpty: $("#only-empty").checked }); }
  function controls() {
    for (const id of ["apply", "preview", "mode", "threshold"]) $("#" + id).disabled = running;
    $("#only-empty").disabled = running || $("#auto").checked;
    $("#stop").disabled = !running && !$("#auto").checked;
    $("#threshold-label").hidden = $("#mode").value !== "score";
  }
  function log(id, decision, outcome) {
    const tr = document.createElement("tr"); tr.dataset.cardId = id;
    const value = core.score(decision?.score);
    for (const text of [`#${id}`, decision?.candidate?.name || "—", value === null ? "不可讀／不適用" : `${value.toFixed(2)} / 100`, outcome]) {
      const td = document.createElement("td"); td.textContent = text; tr.append(td);
    }
    $("tbody").append(tr); logCount++;
    if ($("tbody").children.length > 500) $("tbody").firstElementChild.remove();
    $("#summary").textContent = `已填 ${applied} · 保留／略過 ${skipped} · 錯誤 ${errors}${logCount > 500 ? "（顯示最近 500 項）" : ""}`;
  }
  function cancel(reason) {
    $("#auto").checked = false;
    if (controller && !controller.signal.aborted) controller.abort(new Error(reason));
    if (currentCard) a.close(a.find(currentCard));
    status(reason); controls();
  }
  function check(signal) { if (signal.aborted) throw signal.reason; }
  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  async function waitForSuggestions(id, originalSignature, signal) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      check(signal);
      const card = a.find(id);
      if (!a.editable(card) || a.signature(card) !== originalSignature) throw new Error("卡片內容已改變，已略過以保留你的編輯");
      const snapshot = a.read(card, true);
      if (snapshot) return snapshot;
      await delay(100, signal);
    }
    throw new Error("30 秒內未取得建議；請檢查照片載入、登入或網路後重試");
  }
  async function run(preview = false, autoRun = false) {
    if (running) return;
    let opts;
    try { opts = options(); } catch (error) { status(error.message, true); $("#auto").checked = false; controls(); return; }
    if (autoRun) opts.onlyEmpty = true;
    const queue = a.cards().filter(card => !autoRun || (!a.filled(card) && a.hasPhoto(card) && !attempted.has(a.key(card)))).map(a.key);
    if (!queue.length) { status(autoRun ? "自動模式已開啟，等待新的空白照片觀察。" : "目前沒有可處理的上傳觀察卡片。"); return; }
    running = true; controller = new AbortController();
    const { signal } = controller;
    if (!autoRun) { total = applied = skipped = errors = logCount = 0; $("tbody").replaceChildren(); $("#summary").textContent = ""; }
    controls();
    let stopped = false;
    try {
      for (let index = 0; index < queue.length; index++) {
        check(signal);
        const id = queue[index]; let card = a.find(id); currentCard = id; total++;
        status(`${preview ? "檢查" : "處理"} ${index + 1} / ${queue.length}：觀察 #${id}；已填 ${applied}。可隨時停止。`);
        if (!a.editable(card)) { skipped++; log(id, null, "略過：卡片未就緒、已移除或上傳中"); continue; }
        if (opts.onlyEmpty && a.filled(card)) { skipped++; log(id, null, "保留：已有分類或手動文字"); continue; }
        const original = a.signature(card);
        attempted.set(id, original);
        if (!a.hasPhoto(card)) { skipped++; log(id, null, "略過：沒有已載入的照片（空白／音訊卡片）"); continue; }
        try {
          a.open(card);
          const snapshot = await waitForSuggestions(id, original, signal);
          const decision = core.decide(snapshot, opts);
          check(signal);
          if (!decision.apply || preview) {
            skipped++; log(id, decision, `${preview && decision.apply ? "可套用（僅檢查，未改動）" : "保留"}：${decision.reason}`);
          } else {
            card = a.find(id);
            if (!a.editable(card) || a.signature(card) !== original || (opts.onlyEmpty && a.filled(card))) throw new Error("選取前卡片已改變，保留原值");
            const fresh = core.decide(a.read(card) || { items: [] }, opts);
            if (!fresh.apply || fresh.candidate.id !== decision.candidate.id || fresh.score !== decision.score) throw new Error("建議已變更，請重新檢查");
            check(signal);
            a.click(card, decision.candidate.id);
            const deadline = Date.now() + 2500;
            while (Date.now() < deadline && a.taxonID(a.find(id)) !== String(decision.candidate.id)) await delay(50, signal);
            check(signal);
            if (a.taxonID(a.find(id)) !== String(decision.candidate.id)) {
              cancel("無法確認網站接受了選取，已停止。請檢查當前卡片。");
              throw signal.reason;
            }
            applied++; log(id, decision, `已填：${decision.reason}`);
          }
        } catch (error) {
          check(signal); errors++; log(id, null, `略過：${error.message}`);
        } finally {
          a.close(a.find(id)); currentCard = null;
        }
        // Sequential native requests; no additional photo upload or API client.
        if (index + 1 < queue.length) await delay(1200, signal);
      }
    } catch (error) { stopped = true; status(error.message, false); }
    finally {
      running = false; controller = null; currentCard = null; controls();
      if (!stopped) status(`${preview ? "檢查" : "本批處理"}完成：已填 ${applied}，保留／略過 ${skipped}，錯誤 ${errors}。${$("#auto").checked ? "繼續等待新增空白觀察。" : "請檢查結果，再手動上傳。"}`);
      if ($("#auto").checked) scheduleScan();
    }
  }
  function scheduleScan() {
    clearTimeout(scanTimer);
    if (!$("#auto").checked || running) return;
    scanTimer = setTimeout(() => {
      if (!$("#auto").checked || running) return;
      const pending = a.cards().some(card => a.editable(card) && a.hasPhoto(card) && !a.filled(card) && !attempted.has(a.key(card)));
      if (pending) run(false, true);
    }, 1200);
  }
  $("#apply").addEventListener("click", () => run());
  $("#preview").addEventListener("click", () => { $("#auto").checked = false; clearTimeout(scanTimer); run(true); });
  $("#stop").addEventListener("click", () => cancel("已停止；已填入的分類保留，其餘未改動。"));
  $("#auto").addEventListener("change", () => {
    if ($("#auto").checked) {
      attempted.clear();
      $("#only-empty").checked = true; controls();
      status("自動模式已開啟，準備處理目前及後續新增的空白照片觀察。"); scheduleScan();
    } else cancel("自動模式已關閉；已填入的分類保留。");
  });
  for (const id of ["mode", "threshold"]) $("#" + id).addEventListener("change", () => { attempted.clear(); controls(); scheduleScan(); });
  // Manual interaction wins immediately, including upload/remove/merge/edit.
  for (const type of ["pointerdown", "keydown", "input", "change", "dragstart"]) document.addEventListener(type, event => {
    if (event.isTrusted && running && !event.composedPath().includes(host)) cancel("偵測到你正在操作頁面，已停止自動套用並保留目前編輯。");
  }, true);
  // Shadow controls retarget to this host outside the shadow tree. Keep their
  // clicks/drags out of the site's background click and selectable handlers.
  for (const type of ["click", "mousedown"]) host.addEventListener(type, event => event.stopPropagation());
  function mount() {
    // The left column is position:fixed with an implicit static top. Inserting
    // before the entire row pushes it down permanently, clipping its calendar.
    // Only occupy the right-hand image column, and wait if it is not ready.
    const grid = document.querySelector(".uploader #imageGrid");
    if (grid && host.parentElement !== grid) grid.prepend(host);
    const text = `本頁 ${a.cards().length} 份觀察`;
    if ($("#count").textContent !== text) $("#count").textContent = text;
  }
  let scheduled = false;
  const observer = new MutationObserver(changes => {
    if (changes.every(change => change.target === host || change.target.closest?.(".leafwise-ai-score"))) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false; mount();
      for (const card of a.cards()) if (a.visible(a.menu(card))) a.read(card, true);
      scheduleScan();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("pagehide", () => { cancel("頁面已離開。"); observer.disconnect(); clearTimeout(scanTimer); }, { once: true });
  mount(); controls();
})();
