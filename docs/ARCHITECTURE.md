# 架構

功能只有一份來源，瀏覽器差異在建置時處理，不維護多份完整的程式。

| 部分 | Chrome／Edge | Firefox |
| --- | --- | --- |
| 背景 | Manifest V3 service worker，前置 importScripts 載入依賴 | 非持續背景 scripts，manifest 定義依賴次序 |
| 擴充 API | 原始碼 chrome.* | 建置轉換為 browser.* |
| 建議介面腳本 | MAIN 執行環境，直接使用網站 jQuery | 隔離環境，以 wrappedJSObject 取得頁面 jQuery |
| 綜合分數橋接 | MAIN 環境包裝網站既有辨識函式 | MAIN 環境包裝網站既有辨識函式 |
| 其他 content scripts | 預設隔離環境 | 預設隔離環境 |
| 版本 | package.json | 同一個 package.json |

`src/manifest.json` 不保存版本或背景瀏覽器設定。`platforms/chrome.json` 與 `platforms/firefox.json` 覆加各自設定；頁面資料適配器是各自約十行的 `*-page-data.js`。Edge 建置目標直接共用 `platforms/chrome.json` 及 `chrome-page-data.js`，不另複製一份平台設定；Chrome／Edge 的擴充內容逐檔一致。其餘上傳判定、DOM 適配、介面、高階分類及快取均為共用程式。

頁面一開始先在 MAIN 環境載入 `vision-score-bridge`，包裝 iNaturalist 已有的 `score_image`／`score_observation`，從同一回應擷取 `combined_score`，不新增網路請求。介面端載入順序為：分數資料 → 共用分數樣式 → 規則 core（僅上傳）→ 平台 page-data → 頁面 adapter → panel（僅上傳）。bridge 以字串 CustomEvent 把分類 ID 與分數送到隔離環境；候選始終按 ID 配對，不按顯示順序。平台 helper 只取得現有元件資料，沒有擴充通訊權限。core 仍可在 Node 測試。

功能测试對 `build/chrome`、`build/edge` 和 `build/firefox` 各執行一次，包含背景事件及訊息處理。建置測試驗證相同權限、Firefox 既有 ID、manifest 引用、載入順序、版本一致及除平台差異外的功能程式一致性。

`scripts/package.mjs` 使用 fflate 打包，固定 ZIP 內部時間戳，輸出後解壓比對所有內容並產生 SHA256。擴充本身不包含 fflate、npm 或其他建置工具。`dist` 只作為成品，不回填到來源。

CI 在 Windows／Linux 執行同樣指令。標籤發佈還要求 `vX.Y.Z`、package 版本及 CHANGELOG 三者一致，測試全部成功才發布。一般分支建置產物在 Actions；正式安裝包在 Releases。倉庫啟用 AMO 憑證後，標籤流程會在 Release 成功後以 manifest 的既有 Gecko ID 提交同版本 Firefox 套件；提交前先用 AMO 公開 API 檢查版本，讓網路失敗後重跑保持冪等。
