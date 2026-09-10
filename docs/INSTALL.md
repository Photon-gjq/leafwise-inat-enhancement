# 安裝與更新

在 GitHub [Releases](https://github.com/Photon-gjq/leafwise-inat-enhancement/releases/latest) 下載所需版本。每次 Release 同時提供 Chrome、Firefox ZIP 與未簽章 XPI，版本號相同。

套件另附 `USAGE.md` 與 `REGIONS.md`。0.11.0 的搜尋頁入口是「類群對比」；日期、收藏等工具可展開使用，個人紀錄小卡從觀察／類群頁的個人次數開啟。

## Chrome

1. 解壓 `Leafwise-x.y.z-chrome.zip`，把資料夾放到長期保留的位置。
2. 開啟 `chrome://extensions`，啟用「開發人員模式」。
3. 按「載入未封裝項目」，選擇直接包含 `manifest.json` 的 `extension` 資料夾。
4. 停用其他處理相同頁面的舊 Leafwise／QG 插件，避免重複介面。

更新時，以新版本 `extension` 內的完整檔案替換原本已載入路徑的內容，在管理頁按「重新載入」。固定載入路徑有助於沿用擴充 ID 與設定；改載新路徑可能被視為另一個擴充套件。不要在管理頁先移除舊擴充，移除可能清掉其設定。[Chrome 官方說明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)

## Firefox

1. 開啟 `about:debugging#/runtime/this-firefox`。
2. 按「載入暫時附加元件」，選 `Leafwise-x.y.z-firefox-unsigned.xpi`。
3. 也可解壓 Firefox ZIP，選其中的 `extension/manifest.json`。

保留原先 Firefox 擴充 ID；更新時載入同 ID 的新版，並確認管理頁版本號。未簽章的暫時安裝會在 Firefox 關閉後移除，重新啟動需再次載入。一般正式 Firefox 的永久安裝需要 Mozilla 簽章，目前此專案沒有簽章或自動送審設定。[Firefox 暫時安裝](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)

## 使用與更新邊界

- 完成安裝／更新後開啟新的 iNaturalist 頁面。已有未提交照片或草稿時，先處理好再重新整理，以免網站清掉工作。
- GitHub 的同步發佈產生兩份下載包；Chrome 本機載入與 Firefox 暫時安裝不會自動跟隨 GitHub 升級。
- 常用條件由各瀏覽器擴充儲存管理，不自動跨 Chrome／Firefox 搬移。可點擴充工具列圖示管理常用使用者與分類單元。
- 開發者可直接載入 `build/chrome` 或 `build/firefox/manifest.json`，這兩個目錄由 `npm run build` 生成。

桌面最低需求為 Chrome 114、Firefox 140；本專案以桌面使用為驗收範圍，不宣稱已測試所有歷史版本或手機瀏覽器。
