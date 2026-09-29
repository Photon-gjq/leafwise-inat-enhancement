(() => {
  "use strict";

  const NAV_ID = "updatesnav";
  const MENU_ID = "updatessubnav";
  const ROW_CLASS = "leafwise-open-update-observations";
  const allowedHosts = new Set(["inaturalist.org", "www.inaturalist.org"]);

  function observationIds(menu) {
    const ids = new Set();
    // The official /users/new_updates response places each update in a direct
    // <li><a> child. The final dashboard link is deliberately excluded.
    for (const link of menu.querySelectorAll(":scope > ul > li > a[href]")) {
      let url;
      try { url = new URL(link.href, location.href); } catch { continue; }
      if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) continue;
      const match = /^\/observations\/([1-9]\d*)\/?$/.exec(url.pathname);
      if (match && Number.isSafeInteger(Number(match[1]))) ids.add(String(Number(match[1])));
    }
    return [...ids];
  }

  function start(nav) {
    const menu = nav.querySelector(`#${MENU_ID}`);
    if (!menu) return;
    let busy = false;
    let status = "";
    let clearStatusTimer;

    function refresh() {
      const list = menu.querySelector(":scope > ul");
      if (!list) return; // Wait for the site's asynchronous update response.
      let row = list.querySelector(`:scope > li.${ROW_CLASS}`);
      if (!row) {
        row = document.createElement("li");
        row.className = ROW_CLASS;
        row.style.cssText = "text-align:center;padding:8px 12px;border-top:1px solid #eee";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-default btn-sm";
        button.addEventListener("click", async event => {
          event.preventDefault();
          event.stopPropagation();
          if (busy) return;
          const ids = observationIds(menu);
          if (!ids.length) return;
          busy = true;
          status = "正在開啟觀察…";
          clearTimeout(clearStatusTimer);
          refresh();
          try {
            const reply = await chrome.runtime.sendMessage({
              type: "leafwise-open-update-observations", observationIds: ids
            });
            status = reply?.ok && reply.opened === ids.length
              ? `已開啟 ${reply.opened} 個觀察`
              : `已開啟 ${reply?.opened || 0} 個；其餘未能開啟`;
          } catch {
            status = "開啟失敗，請重試";
          } finally {
            busy = false;
            refresh();
            clearStatusTimer = setTimeout(() => { status = ""; refresh(); }, 4000);
          }
        });
        row.append(button);
        list.insertBefore(row, list.lastElementChild); // Above "View your dashboard".
      }
      const button = row.querySelector("button");
      const count = observationIds(menu).length;
      const label = status || `一鍵開啟這些觀察（${count}）`;
      if (button.textContent !== label) button.textContent = label;
      button.disabled = busy || count === 0;
    }

    const observer = new MutationObserver(refresh);
    observer.observe(menu, { childList: true, subtree: true });
    window.addEventListener("pagehide", () => {
      observer.disconnect();
      clearTimeout(clearStatusTimer);
    }, { once: true });
    refresh();
  }

  const nav = document.getElementById(NAV_ID);
  if (nav) start(nav);
})();
