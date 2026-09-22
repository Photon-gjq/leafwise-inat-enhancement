# Leafwise：AI 專案上下文與維護手冊

本文件是交給後續 AI／維護者的持久上下文。它記錄「為什麼這樣做、各功能在哪裡、哪些約束不能破壞、怎樣驗證及發版」。它不是程式碼的替代品；每次開始工作都要先用目前倉庫狀態核對本文，不可只憑本文或對話記憶修改。

## 0. 開始工作的固定程序

1. 完整閱讀 AGENTS.md 與本文件。
2. 執行並查看：
   - git status --short --branch
   - git log -8 --oneline --decorate
   - git remote -v
   - node -p "require('./package.json').version"
3. 保留使用者已有的未提交變更；不覆蓋、不重設、不把不相關變更混入提交。
4. 先定位功能的共用來源。通常修改 src/；瀏覽器差異才修改 platforms/。禁止直接修改生成的 build/ 或 dist/。
5. 修改前先讀對應測試和文件；修改後按本文「驗證矩陣」執行檢查。
6. 如果目前程式、Git 歷史或官方 iNaturalist 行為與本文不同，以可驗證的現況為準，並在同一變更中更新本文。

## 1. 專案定位與已審閱基線

- 專案：Leafwise iNaturalist enhancement browser extension
- 遠端：https://github.com/Photon-gjq/leafwise-inat-enhancement
- 共用來源同時產生 Chrome、Edge、Firefox 套件。
- 本文初次完整審閱基線：2026-09-17，main 的 83631d3，版本／標籤 0.12.0／v0.12.0。
- 版本唯一來源是 package.json；package-lock.json、CHANGELOG.md、標籤與發版說明必須一致。
- package.json 為 private: true、license: UNLICENSED。來源授權背景見 NOTICE.md；不要自行聲稱為開源授權。
- Node.js 最低版本為 22；CI 使用 Node.js 24。

基線提交只用於辨認本文寫作時的狀態，不代表永遠鎖定該提交。後續 AI 應先看最新提交，不得為了匹配本文回退新功能。

## 2. 絕對不能破壞的產品約束

### 三瀏覽器與來源管理

- 除非使用者明確只要求單一瀏覽器，功能變更必須同時建置、測試、打包 Chrome、Edge、Firefox。
- 共用邏輯只維護一份。Chrome 與 Edge 共用平台設定；Firefox 差異在建置時處理。
- 保留 Firefox Gecko ID：{ae19f2b4-7bb2-4974-bbda-c0d14e09428a}。
- 不因重構更換既有 storage key、訊息名稱或公開行為；若真的需要遷移，必須提供向後相容／資料遷移與測試。

### 資料、隱私與安全

- 不提交帳號、憑證、瀏覽器 profile、私人照片、完整 API 回應或個人本機絕對路徑。
- 擴充目前沒有分析、廣告或遙測，也不把照片送到第三方 AI。
- AI 分數來自 iNaturalist 頁面原本已發出的辨識請求；Leafwise 不應另行呼叫 `/computervision/score_image` 或 `/computervision/score_observation`。若 API v2 觀察請求使用明確 `fields` 投影卻省略 `combined_score`，bridge 只可在同一請求的回傳欄位投影補入 `combined_score: true`，不得改動照片、觀察、位置、日期、驗證或其他請求語意。
- 公開 API 背景請求使用 credentials: omit。
- 上傳功能只修改草稿，不可自動發布觀察。使用者的手動分類或文字優先；停止／手動操作後，遲到結果不得覆蓋草稿。

### 分數語義

- 使用 combined_score（iNaturalist 原生請求已結合可用的照片、地點、時間上下文），不要退回 vision_score。
- 官方回應目前以 0–1 表示 combined_score；bridge 乘以 100 後交給介面。為相容既有／替代回應，>1–100 保留原值；其他型別、非有限數及範圍外值拒絕。
- 分數不是校準後的「正確率」。介面可顯示相對分數，但文件與文案不得把它描述為真實準確率。
- 候選和分數一律按 taxon ID 配對，不能按陣列位置或畫面順序配對。
- 只有原生候選 `isVisionResult === true`（或由同一欄位產生的官方 `.ac.vision` DOM 標記）且分數是 0–100 的有限數字時才顯示／使用分數。

## 3. 倉庫結構與真實來源

| 路徑 | 職責 |
| --- | --- |
| src/manifest.json | 共用 manifest、權限、頁面匹配與腳本順序；不含版本與瀏覽器背景差異 |
| src/background.js | 擴充背景入口、快取、公開 API、runtime message 路由 |
| src/options/ | 設定頁；常用使用者與分類單元管理 |
| src/scripts/ | 所有頁面功能、AI 適配、高階分類、個人紀錄與共用純邏輯 |
| src/_locales/ | 擴充名稱與文案翻譯 |
| platforms/chrome.json | Chrome／Edge 的 MV3 service worker 與最低版本設定 |
| platforms/firefox.json | Firefox 背景 scripts、Gecko ID 與最低版本設定 |
| platforms/*-page-data.js | 取得 iNaturalist 頁面 jQuery 資料的最小平台橋接 |
| scripts/build.mjs | 由共同來源產生三個瀏覽器建置 |
| scripts/package.mjs | 可重現打包、解壓比對、SHA256 產生 |
| scripts/release-notes.mjs | 驗證標籤、版本、CHANGELOG 並產生發版說明 |
| scripts/amo-version-status.mjs | 發佈前檢查 AMO 是否已有相同版本 |
| tests/ | 建置、功能、回歸和瀏覽器版面測試 |
| .github/workflows/build.yml | Windows／Linux CI、GitHub Release、Firefox AMO 提交 |
| build/、dist/ | 生成物；不要手改或把它們當來源 |

更多原則見 docs/ARCHITECTURE.md；使用方式、隱私、測試、分區和發版分別見 docs/USAGE.md、docs/PRIVACY.md、docs/TESTING.md、docs/REGIONS.md、CONTRIBUTING.md。

## 4. 建置時的瀏覽器差異

scripts/build.mjs 會複製 src/，把 package.json 版本和平台 manifest 合併，再產生：

- Chrome：Manifest V3 service worker；背景入口以 importScripts 載入依賴；AI 頁面 adapter 在 MAIN world。
- Edge：直接共用 Chrome 平台設定與 chrome-page-data.js；擴充內容應逐檔與 Chrome 一致。
- Firefox：manifest 宣告背景 scripts 的依賴順序；將共用來源中的 chrome.* 轉為 browser.*；頁面資料透過 wrappedJSObject 讀取。

不能在來源中複製整套 Firefox／Chrome 實作。平台 helper 應保持極小，規則與 DOM 邏輯仍在共用檔案中。

## 5. 頁面腳本載入圖

### 上傳頁 /observations/upload

1. vision-score-bridge.js（MAIN world，document_start）
2. vision-score-data.js
3. vision-score-style.js
4. uploader-ai-core.js
5. 平台生成的 uploader-page-data.js
6. uploader-ai-adapter.js
7. uploader-ai-panel.js

### 觀察詳情 /observations/<numeric-id>

1. vision-score-bridge.js（MAIN world，document_start）
2. vision-score-data.js
3. vision-score-style.js
4. 平台生成的 uploader-page-data.js
5. observation-ai-adapter.js
6. taxon-status.js（個人觀察次數／紀錄）

### 觀察搜尋／探索頁

url-filters.js → saved-users.js → saved-taxa.js → content.js → higher-taxa-core.js → explore-tools.js → higher-taxa-panel.js

### 分類單元詳情 /taxa/<id>

taxon-status.js

腳本順序是功能的一部分。調整順序時要同步改 manifest/build 測試，並重新驗證三個瀏覽器。

## 6. 三條核心資料流

### 6.1 iNaturalist 綜合 AI 分數

vision-score-bridge.js 在 document_start 的 MAIN world 包裝頁面原有的 fetch 與 XMLHttpRequest，不依賴 `window.inaturalistjs`（官方 uploader 已把 inaturalistjs 作為 ES module 區域變數使用）。它只匹配 iNaturalist HTTPS 主機下 `/v1`／`/v2` 的 `computervision/score_image`、`score_observation`，端點可帶數字 ID 或嚴格的 observation UUID：

- fetch 只用 `Response.clone().json()` 旁讀；XHR 只在 `responseType=json` 或 JSON Content-Type 時讀取；
- 原方法只呼叫一次，Promise、Response／XHR 與回傳值不改動，不新增辨識請求；API v2 `score_observation` 已有欄位投影但欠缺 `combined_score` 時，只把該布林回傳欄位補入 Rison URL 或 JSON body，其他參數及資料不改；
- 重複注入不會多重包裝；舊頁面若仍暴露 `window.inaturalistjs`，保留不依賴的相容 fallback；
- 只取明確的 combined_score，將 0–1 乘以 100，>1–100 保留，拒絕 vision_score、字串、非有限與範圍外值；
- 發出 leafwise:cv-combined-scores CustomEvent，payload 為只含 sequence、capturedAt、taxon ID 及正規化分數的 JSON 字串。

vision-score-data.js 以 taxon ID 儲存／合併分數；最多保留 24 份回應，最長 2 分鐘，並以可見選單重疊範圍避免舊結果污染新選單。上傳 adapter 監聽分數事件，即使選單 DOM 先出現也會立即重掃裝飾；listener 在 pagehide 清理。觀察 adapter 在每個數字 ID 詳情頁保留事件重掃、MutationObserver、1.2 秒低頻掃描及 pagehide 清理；若隔離環境無法讀 jQuery 候選資料，改以官方由 `isVisionResult` 產生的 `.ac.vision` DOM class 判定視覺候選，仍按 `data-taxon-id` 配對，不能替手動搜尋列補分。

vision-score-style.js 是上傳頁和觀察頁唯一共用樣式來源：只顯示一位小數的彩色文字，無百分號、背景、邊框、圓角膠囊或候選列色條，使用紅／棕／綠連續色階，並在多行候選列中上下居中。沒有有效分數時要移除 Leafwise 標記，不顯示佔位。

兩個 adapter 都從原生 DOM 上的 `data-taxon-id` 取得 ID；上傳頁再與 jQuery data 的 `ui-autocomplete-item` 或 `item.autocomplete` 物件 ID 交叉驗證，觀察詳情頁在可讀時也交叉驗證，否則只接受官方 `.ac.vision` 候選。不能用候選下標推算分數。

### 6.2 上傳頁批次 AI

uploader-ai-core.js 是可在 Node 測試的純規則：

- 分數範圍 0–100；預設門檻 80，判定是嚴格大於，所以 80 不通過、80.01 通過。
- 首選是第一個非 ancestor 的原生視覺候選。
- 分數缺失／過低時，只能回退到「可選」且原生 confident === true 的官方確定分類；不得拿 vision_score 補分。
- 首選與官方確定分類都不符合時，保留原值。

uploader-ai-adapter.js 只透過真實原生建議列完成選取，不直接偽造 React 狀態；手動分類／文字在合格點擊發生前不可被清空。

uploader-ai-panel.js：

- 預設收合在原生「全選」右側；收合 host 直接掛在 `.nav_add_obs` 並以絕對定位脫離排版流，不能插入內層窄版 navbar form 而撐高高層級工具列、遮住首排卡片控制項；快捷按鈕直接執行，不同時展開。
- 展開後移回 .uploader #imageGrid；狀態存在頁面 localStorage 的 leafwise-upload-ai-panel-open。
- 順序處理，項目間隔約 1.2 秒，單項建議等候上限 30 秒。
- 支援預覽、停止、自動處理、明細；執行中完整按鈕與快捷按鈕都禁用。
- 每次套用前驗證 observation/signature；停止、頁面離開或面板外手動操作必須中止，遲到結果不能寫回。
- 只處理草稿，日誌最多 500 筆；DOM 異步替換時由 MutationObserver 重新定位／掛載。

### 6.3 個人觀察次數與紀錄

taxon-status.js 只信任目前 iNaturalist 頁面右上使用者選單：

- username：.navtab.user a.observations_link 的 /observations/<username>；
- numeric user ID：.navtab.user a.profile_link 的 /people/<id>。

兩者缺一、未登入或解析失敗就退出；不能回退到設定頁的常用使用者，也不能顯示個人狀態。成功時：有紀錄顯示半角 (n) 並可開啟紀錄卡；沒有紀錄顯示 🆕；API 失敗不應當成 0。

分類頁的多個「查看您的」連結必須各自解析 user_id、taxon_id、place_id、verifiable、view、rank 等參數並分別統計。分類列表由下級先於上級處理，最多 3 個並發；頂部已取得的次數可重用。

觀察詳情的 URL 可能在鑑定後不變，但目前 taxon 會變。程式用 DOM 監聽與低頻輪詢發現變更，清除舊 marker，對新 taxon 強制繞過 5 分鐘快取，並以 generation／目前 taxon 檢查阻止舊請求寫回。

## 7. 高階分類與探索工具

higher-taxa-core.js 處理驗證、分類樹與比較純邏輯：

- 階級範圍 kingdom 到 subgenus；模式為 lifetime／year／local／first。
- 地點 ID 最多 20 個，也允許 any；本地條件包含月份、d1、d2、project、quality。
- 個人基準與公開比較條件分離，不能意外繼承月份等局部條件。
- 分類樹採 fail-closed 驗證：祖先、循環、計數聚合不確定時不猜。
- leafCounts 把種下分類歸併到 species terminal observed taxa。

higher-taxa-service.js（由背景載入）負責 API、快取和節流：

- taxonomy TTL 10 分鐘；名稱 TTL 30 天；records TTL 5 分鐘。
- 合併相同 pending request；記憶體最多 32 筆；storage 達 64 筆、約 7 MB 或過期時清理。
- 傳輸最多 2 個並發，啟動間隔 1.1 秒，回應 timeout 25 秒、body timeout 120 秒。
- 明確處理 429、404、422、5xx，避免重試風暴。
- 中文名稱按 30 個一批；species_counts 結果仍需驗證使用者／地點／根 taxon。

explore-tools.js 管理分區預設、自訂分組、已存查詢和 CSV。查詢 URL 只允許 HTTPS 的 iNaturalist observations URL；收藏各最多 50 筆；CSV 必須正確引用並中和公式注入。

higher-taxa-panel.js 使用 Shadow DOM，負責表單、收藏、匯出、結果、逐列 Leaf taxa 驗證、兩個名稱 worker、leafwise_query 還原，以及 DOM 異步重掛載。

## 8. 背景訊息與儲存契約

### Runtime message 名稱

- qg-open-options
- qg-observation-taxon
- qg-taxon-observation-count（支援 force）
- qg-cached-taxon-observation-counts
- qg-scoped-observation-count
- qg-taxon-ancestors
- qg-higher-taxa-compare
- qg-higher-taxa-leaf
- qg-higher-taxa-refresh-names
- qg-higher-taxa-names
- leafwise-explore-library
- leafwise-personal-records

更名或改 payload 形狀前，先搜尋所有 sender、listener 和測試；通常要保持向後相容。

### 主要儲存位置

- storage.sync：savedUsernames、savedTaxa；舊 unobservedByUserId 只供相容，空的新清單不能使舊值復活。
- storage.local：個人次數快取、探索查詢／分組資料庫 leafwiseExploreLibraryV1。
- storage.session：高階分類快取。
- 頁面 localStorage：leafwise-upload-ai-panel-open。
- 頁面 sessionStorage：搜尋 UI／待套用篩選狀態，例如 qgInatPendingUnobservedUser、qgInatUserFiltersCollapsed。

### 個人計數快取 key（TTL 5 分鐘）

- qgObservationTaxon:<observation-id>
- qgTaxonCount:<user-id>:<taxon-id>
- qgScopedCount:<endpoint>:<sorted-query>
- qgTaxonAncestors:<taxon-id>

## 9. 權限與網路邊界

共用 manifest 目前只有：

- extension permission：storage
- host permission：https://api.inaturalist.org/*

新增權限是高風險變更，必須有明確功能理由、同步隱私文件、三平台 manifest 測試和發版說明。不要為方便存取頁面狀態而增加寬泛權限；優先沿用頁面既有資料與小型平台橋接。

## 10. 驗證矩陣

### 每次程式變更至少執行

~~~sh
npm ci --ignore-scripts
npm run check
npm run package
~~~

npm run check 會先建置再跑功能測試；同一套測試會針對 Chrome、Edge、Firefox 產物執行。npm run package 再建置，固定 ZIP 內時間戳、解壓逐檔比對並輸出 SHA256。

### 介面、DOM、上傳或觀察 AI 變更另執行

~~~sh
npx playwright install chromium firefox
npm run test:layout
~~~

Windows 有 Edge 時可用：

~~~powershell
$env:LEAFWISE_EDGE_TESTS='1'
npm run test:layout -- --project=edge-layout
~~~

### 依變更範圍的最低人工驗收

- 設定／儲存：三瀏覽器保存、重開、舊資料相容。
- 高階分類：單地、多地、全球；目／科／屬；至少逐列核對一個 Leaf taxa。
- 上傳 AI：高分、低分、手動 taxon、自由文字；預覽不修改；停止及外部操作中斷；新增照片的自動模式。
- 個人次數：未登入不顯示；分類頁多個 scoped link；觀察頁原地換 taxon；慢舊請求不得污染新 taxon。
- 觀察建議：原生選單異步出現／重畫／離開頁面後清理；jQuery 資料可讀與不可讀兩條路徑；手動搜尋列與無效分數不留標記。

報告必須區分：

1. 離線單元／功能測試；
2. 受控官方 React／jQuery 元件測試；
3. 登入正式 iNaturalist 頁面的人工驗收。

不能把其中一類說成另一類，也不能把受控 fixture 說成真實帳號驗證。

## 11. 發版工作流

1. 更新 package.json 版本，使用 npm 正常同步 package-lock.json。
2. 更新 CHANGELOG.md；必要時同步 README／docs／本文件。
3. 跑完整驗證矩陣和相應人工驗收。
4. 提交並推送 main，確認 Windows／Linux CI 都成功。
5. 建立並推送唯一的 vX.Y.Z 標籤。
6. 標籤 workflow 重新驗證版本與 CHANGELOG，產出並發布 Chrome ZIP、Edge ZIP、Firefox ZIP、未簽名 XPI、SHA256SUMS.txt。
7. 倉庫變數 AMO_AUTO_PUBLISH=true 且 secrets 存在時，CI 會先查 AMO 是否已有該版本，再用既有 Gecko ID 提交 listed Firefox 更新；相同版本重跑應安全跳過。

不要為三個瀏覽器建立不同版本號或不同標籤。不要手工編輯 Release 中的套件來製造與標籤不同的內容。

## 12. 高風險修改檢查表

### iNaturalist DOM／原生物件結構

下列皆是上游私有介面，可能無預警改動：

- .navtab.user、a.observations_link、a.profile_link
- 上傳頁 .uploader #imageGrid、原生「全選」區域、觀察卡片與 taxon autocomplete
- jQuery data key：ui-autocomplete-item、item.autocomplete；觀察詳情的官方 TaxonAutocomplete 也會把 `isVisionResult` 映射為 `.ac.vision`
- 候選欄位：id、isVisionResult、visionScore／vision_score、confident、ancestor
- fetch／XHR 的 `/v1`、`/v2` computervision score_image／score_observation URL、JSON 回應形狀與 combined_score

碰到「突然全部沒顯示」「選錯 taxon」「分數對不上」時，先在正式頁面只讀檢查上述介面，再修改 adapter。不能以候選順序、ancestor 或舊 screenshot 推測新結構。

### 非同步與競態

- MutationObserver 回呼、輪詢、fetch、原生 autocomplete 都可能交錯。
- 寫 DOM 前再次確認頁面、observation/taxon ID、generation/signature 和停止狀態。
- 清理 timer、observer、event listener；在 pagehide／離開頁面停止背景活動。
- API 失敗保持原生頁面和既有值，不把錯誤轉成 0、🆕 或空分類。

### 快取

- force 只用於明確需要繞過舊值的狀況（例如觀察頁原地換 taxon）。
- 改 cache key／TTL 時同時檢查記憶體、storage、pending request 合併、清理和測試。
- 多條原生「查看您的」連結不能因相同 taxon 而錯誤共用不同 scope 的計數。

## 13. 典型修改路徑

- 改分數外觀：只改 src/scripts/vision-score-style.js 和相應測試，確保上傳／觀察頁共用。
- 改分數抓取：先讀 bridge + data store + 兩個 adapter；保持原生請求單次、taxon ID 配對、combined score、跨 world 相容。
- 改批次規則：優先改 uploader-ai-core.js，先補純邏輯測試，再改 adapter／panel。
- 改上傳版面：只在 uploader-ai-panel.js 掛載 Shadow DOM；重跑 layout 測試，確認沒有推動官方固定側欄。
- 改個人次數：同時檢查 taxon-status.js、background.js、cache 測試與觀察頁競態測試。
- 改高階分類：同時檢查 core、service、panel、背景 message、CSV 與快取回歸。
- 改平台相容：把差異限制在 platforms/ 或 build 轉換，驗證 Chrome/Edge 逐檔一致與 Firefox ID。

## 14. 已知驗證邊界與歷史決策

- 倉庫測試大量使用受控頁面／替代公開 API 回應，能穩定驗證規則與競態，但不能證明 iNaturalist 正式 DOM 永遠不變。
- 歷史上的「官方 React／jQuery 元件測試」不是登入真實帳號、不是發布觀察、也不是模型準確率測試。
- Firefox 隔離環境曾暴露 window／全域與 Chromium 不同；不要用只在 Chrome 成功作為跨瀏覽器完成標準。
- 上傳頁官方固定批次欄曾被面板推低；目前收合面板與 Shadow DOM 定位有專門 layout 回歸，修改掛載點時務必重跑。
- jQuery UI selectable 會在父層阻止 mousedown；Shadow DOM 控制項的焦點與事件隔離有專門回歸，不要簡化掉。
- combined_score 的設計選擇是「重用 iNaturalist 自己的 fetch／XHR 請求與回應」；API v2 欄位投影欠缺此欄位時只擴充同一請求的回傳投影。它不依賴頁面全域變數，不自行重算，也不發第二次請求。
- iNaturalist uploader 已把 inaturalistjs 作為 ES module 區域變數使用；只查 `window.inaturalistjs` 會完全漏掉分數。修改橋接時必須保留無該全域的 fetch／XHR 回歸。

## 15. 完成一項工作的交付格式

最後報告至少包括：

- 實際修改的檔案及行為；
- 三個瀏覽器是否都覆蓋；
- 跑過的指令、結果與未跑項目；
- 是否做正式頁人工驗收；
- 是否觀察到 iNaturalist DOM／原生資料結構變化；
- 是否需要版本、CHANGELOG、Release 或 AMO 後續操作。

## 16. 維護本文件

以下情況必須在同一提交更新本文件：

- 新增／移除主要模組、頁面入口、runtime message 或 storage key；
- 調整 AI 分數來源、批次規則、快取、並發、超時或競態防護；
- 改建置、測試、打包、GitHub Release、AMO 工作流；
- 發現新的 iNaturalist DOM／資料結構或瀏覽器相容風險；
- 文件內容已不再符合程式碼。

只做小型文案或樣式微調時，不必改基線提交；但若改變使用者可見規則或驗證方式，仍應更新相應段落。本文要保持可掃讀、可核對、無個資，不要把整段聊天紀錄或臨時除錯輸出貼進來。
