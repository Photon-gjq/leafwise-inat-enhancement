# 架構

功能只有一份來源，瀏覽器差異在建置時處理，不維護多份完整的程式。

觀察搜尋工具列由 `quick-places.js` 掛在 `#stats-container .row > .col-xs-4`，以兩列放進原生 75px 深灰地區區塊，不增高白色標頭；對比入口在第一列末端，類群／地區選單等分第二列。僅標記的地區欄套用 scoped `.geo` 行高／省略及清除圖示位置，不移動 Angular 元素；離頁或換欄移除標記。缺失統計區塊時沿用舊獨立後備列。鑑定頁沿用同一 host，掛作 `#Identify .SearchBar` 的下一個兄弟，避免嵌入 React form；依公開 input 的 bounding rect 對齊位置及寬度，ResizeObserver／resize／字體就緒與重掛重新量測。禁用／blind 表單不啟用，URL 省略預設地區時僅讀公開原生 hidden input 判斷選項。`quickSearchPage` 僅放行兩個 HTTPS 正式搜尋路徑，原有 `searchURL`／`isSearchPage` 限制不放寬，故不把用戶／對比表單帶入鑑定頁。

地區共用 local 組合庫，類群共用既有 `storage.sync.savedTaxa`。多根條目可選 `taxonIds: number[]`，`id` 為排序後的第一個 ID；可選 `withoutTaxonIds: number[]`，兩份清單各最多 20 個，排序去重，舊單根條目形狀不變。設定格式 `ID,ID !排除ID,ID = 名稱`，包含及排除清單組成完整 identity；`saved-taxa.ids()` 是所有包含 ID 的共用讀取邊界，URL 比對及名稱補全必須使用整組，不可只取 `id`。對比僅讀無排除且單根條目，核心統計不變。明確選取才用 `taxonSearchURL` 取代 `taxon_id`／`without_taxon_id` 並清除分頁及查詢還原指標，普通條目及不限清除舊類群排除，其餘條件保留。兩份異步讀取各自以 storage revision／讀取 token 拒絕舊回應，BFcache 返回重讀。

對比觸發器以具名 slot 掛在快捷工具列；對比面板不再包含來源／排除入口、用戶摘要／表單或其 slots。`content.js` 只保留原生過濾器中的來源／排除／互換及設定入口，錯誤在該組控制項內顯示；沿用原生更新搜尋與 pending 篩選補全。三個 UI 模組都有注入前 singleton guard，重掛載只移動既有 host。原生過濾器與對比仍有各自 Shadow DOM／事件；「對比使用者」仍為獨立統計基準，不把用戶篩選草稿當成對比變動，也不清空任何已保存設定。

分類頁地區取自網站原生選擇器狀態及 `.NumObservations` 連結，而非僅依 URL。計數／多樣性／首次最近紀錄與觀察連結共享可選 `placeId`，快取按地區分隔；controller generation 和即時地區 identity 阻止跨地區舊回應回寫。選中但 ID 尚未取得時不冒充全球。設定頁、觀察搜尋頁的 `quick-places.js` 快捷選單與對比面板共用 local 地區組合庫，bulk 更新用舊 groups 快照作衝突檢查，保留查詢收藏。原有中國分組僅為設定頁可選範例，不播種至儲存；快捷選取透過 `explore-tools.placeSearchURL` 明確導航，保存設定則只更新選項、不改搜尋。

原生 DOM 範圍依據：[地區 chooser](https://github.com/inaturalist/inaturalist/blob/main/app/webpack/taxa/shared/components/place_chooser_popover.jsx)、[觀察連結容器](https://github.com/inaturalist/inaturalist/blob/main/app/webpack/taxa/show/containers/num_observations_container.js) 及 [chosenPlace 參數](https://github.com/inaturalist/inaturalist/blob/main/app/webpack/taxa/shared/util.js)（2026-10-02 核對）。不讀取私有 React 元件內部或重新按地名搜尋。

界面語言以 iNaturalist 的 `html.lang`／Content-Language 為準，不以瀏覽器語言覆蓋网站。`src/i18n` 的獨立文案目錄由 `scripts/i18n.mjs` 建置為本地資料檔，`i18n.js` 只負責呈現；中文地區文案以建置用 OpenCC 轉換。翻譯不進入核心判定與統計計算，也不替換原生網站或使用者資料。名稱查詢新增可選 locale，名稱快取按完整 URL 隔離；設定頁只新增本機最近語言碼。涵蓋範圍、英文後備與維護規則見 [I18N.md](I18N.md)。

| 部分 | Chrome／Edge | Firefox |
| --- | --- | --- |
| 背景 | Manifest V3 service worker，前置 importScripts 載入依賴 | 非持續背景 scripts，manifest 定義依賴次序 |
| 擴充 API | 原始碼 chrome.* | 建置轉換為 browser.* |
| 建議介面腳本 | MAIN 執行環境，直接使用網站 jQuery | 隔離環境，以 wrappedJSObject 取得頁面 jQuery |
| 綜合分數橋接 | MAIN 環境重用網站既有 fetch／XHR 辨識請求與回應 | MAIN 環境重用網站既有 fetch／XHR 辨識請求與回應 |
| 其他 content scripts | 預設隔離環境 | 預設隔離環境 |
| 版本 | package.json | 同一個 package.json |

`src/manifest.json` 不保存版本或背景瀏覽器設定。`platforms/chrome.json` 與 `platforms/firefox.json` 覆加各自設定；頁面資料適配器是各自約十行的 `*-page-data.js`。Edge 建置目標直接共用 `platforms/chrome.json` 及 `chrome-page-data.js`，不另複製一份平台設定；Chrome／Edge 的擴充內容逐檔一致。其餘上傳判定、DOM 適配、介面、高階分類及快取均為共用程式。

頁面一開始先在 MAIN 環境載入 `vision-score-bridge`。它只包裝頁面原有的 `fetch` 與 `XMLHttpRequest`，並只處理 iNaturalist HTTPS 主機下 `/v1`／`/v2` 的 `computervision/score_image`、`score_observation`（可帶數字 ID 或嚴格 UUID）回應；fetch 使用 `Response.clone()`，XHR 只讀 JSON，原 Response／XHR 與回傳值不改動，也不新增網路請求。API v2 若用明確 `fields` 投影卻缺少 `combined_score` 或 `vision_score`，bridge 只在同一請求的 Rison URL、JSON body 或 multipart `fields` 回傳投影補入缺少的布林欄位，其餘照片、觀察、位置、日期、驗證及請求語意不變。舊頁面若仍暴露 `window.inaturalistjs` 可走相容包裝，但功能不依賴該全域。bridge 只接納有明確 `combined_score` 的候選，並同時保存可用的 `vision_score`；兩者保留原始 0–100 數值（包括小於或等於 1），不作比例換算，其他值拒絕，再以字串 CustomEvent 傳送分類 ID 與配對分數。介面端載入順序為：分數資料 → 共用分數樣式 → 規則 core（僅上傳）→ 平台 page-data → 頁面 adapter → panel（僅上傳）。候選始終按 ID 配對，不按顯示順序。上傳頁的每份回應（包括帶明確卡片作用域者）都必須與目前候選的 taxon ID／原生視覺分數指紋相符；早於選單發生的頁面級預取／快取回應以同一指紋一次性綁定到一張卡片，含糊匹配不顯示，已綁定回應不跨卡重用，遲到舊請求不能覆蓋較新請求。取得配對回應後預設顯示 `combined(vision)`，不再以畫面排序作拒絕條件。網站直接重用快取選單而不發請求時，卡片請求標記會自動失效。觀察詳情 adapter 使用相同的配對規則，並優先讀原生候選資料；讀不到跨 world 的 jQuery 快取時可使用官方由 `isVisionResult` 產生的 `.ac.vision` 標記，但仍須以 DOM taxon ID 配對分數。平台 helper 只取得現有元件資料，沒有擴充通訊權限。core 仍可在 Node 測試。

功能测试對 `build/chrome`、`build/edge` 和 `build/firefox` 各執行一次，包含背景事件及訊息處理。建置測試驗證相同權限、Firefox 既有 ID、manifest 引用、載入順序、版本一致及除平台差異外的功能程式一致性。

`scripts/package.mjs` 使用 fflate 打包，固定 ZIP 內部時間戳，輸出後解壓比對所有內容並產生 SHA256。擴充本身不包含 fflate、npm 或其他建置工具。`dist` 只作為成品，不回填到來源。

CI 在 Windows／Linux 執行同樣指令。標籤發佈還要求 `vX.Y.Z`、package 版本及 CHANGELOG 三者一致，測試全部成功才發布。一般分支建置產物在 Actions；正式安裝包在 Releases。倉庫啟用 AMO 憑證後，標籤流程會在 Release 成功後以 manifest 的既有 Gecko ID 提交同版本 Firefox 套件；提交前先用 AMO 公開 API 檢查版本，讓網路失敗後重跑保持冪等。
