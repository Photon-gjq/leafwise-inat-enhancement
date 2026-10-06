# 測試與驗收

## 自動測試

1.2.1 發版前驗證（2026-10-07）：`npm ci --ignore-scripts`、`npm run check`（302 項）、啟用 Edge 的完整單 worker Playwright（252 項）、`npm run package`（六個套件）及 `v1.2.1` 發版說明校驗全部通過。檢視三瀏覽器 LTR／RTL、長地名及鑑定頁對齊截圖；未做登入正式帳號人工驗收。

1.2.1 版面回歸：`search-toolbar.spec.cjs` 的受控 fixture 補入官方統計列／地區欄，注入前後比較白色標頭、統計列與原生統計欄位置／高度；快捷選單完全留在 75px 地區塊內，LTR／RTL、長名稱、整欄重掛及離頁清理均覆蓋，原生地圖與清除按鈕仍可點擊。`identify-shortcuts.spec.cjs` 加入放大鏡偏移，驗證兩個選單各自與原生 input 的 x／寬度誤差小於 1px，欄位自行 resize 也對齊。50 語言測試在深灰掛載點驗證原有翻譯。這些是公開 DOM 形狀的受控測試，不是登入正式帳號人工驗收；官方來源未發現結構變更，修正的是插件掛載／排版。

1.2.0 發版前驗證（2026-10-07）：`npm run check` 的三瀏覽器功能測試及商店腳本測試共 302 項通過；啟用 Edge、單 worker 執行完整 Playwright 套件，249 項通過。`npm run package` 的六個套件均通過解壓逐檔及 manifest 版本校驗；發版說明與 `v1.2.0` 一致。檢視觀察搜尋／鑑定頁的受控截圖；未做登入正式帳號人工驗收。

1.2.0 的排除組合與 Identify 快捷選單：`saved-taxa.test.cjs` 驗證舊儲存形狀／清空、`ID !排除ID = 名稱` 往返、同根不同排除組合去重及非法 ID；URL 測試確保只替換兩個類群參數、普通／不限清除舊排除、地區選取保留排除及 Identify 的 reviewed 等條件。`explore.spec.cjs` 用設定頁驗證保存／重開／非法草稿不覆蓋、觀察頁選取及對比排除不支援組合。`identify-shortcuts.spec.cjs` 依官方 [SearchBar](https://github.com/inaturalist/inaturalist/blob/b1274a0b6cbf757600ff435135867b7b4021f33c/app/webpack/observations/identify/components/search_bar.jsx)／[PlaceAutocomplete](https://github.com/inaturalist/inaturalist/blob/b1274a0b6cbf757600ff435135867b7b4021f33c/app/webpack/observations/identify/components/place_autocomplete.jsx) 的公開 DOM 建立受控 fixture，覆蓋同根選項、共享設定、原生 URL／預設地區、延遲掛載／重掛、禁用／blind、LTR／RTL 與窄視窗不新增溢出，確認快捷操作不觸發原生提交／批次已檢視。50 語言測試追加排除標籤及 Identify 重掛。這不是登入正式帳號人工驗收。

1.2.0 的常用類群／緊湊工具列：純函數驗證 ID 與 URL 安全、只改類群並保留其他篩選。`explore.spec.cjs` 驗證實際設定頁保存／清空／重開、兩處共用、顯式選取、storage 競態、BFcache 及失敗恢復；`user-filters.spec.cjs` 覆蓋移入面板後的套用、互換、Escape／重開草稿、與對比表單事件隔離。`search-toolbar.spec.cjs` 依官方固定提交的 [搜尋頁模板](https://github.com/inaturalist/inaturalist/blob/b1274a0b6cbf757600ff435135867b7b4021f33c/app/views/observations/index.html.haml)／[CSS](https://github.com/inaturalist/inaturalist/blob/b1274a0b6cbf757600ff435135867b7b4021f33c/app/assets/stylesheets/observations/search.scss) 建立受控 native float fixture，對比注入前後原生標題、類群／地點欄、前往及過濾器位置／大小，覆蓋 LTR／RTL、窄視窗、長名稱、整欄重掛載及重複注入。官方頁有 980px 最小寬度，窄視窗測試要求不新增溢出；另有 375px 自適應容器壓力測試，不宣稱已改好網站行動版。`i18n.spec.cjs` 逐一驗證全部 50 語言的類群／地區快捷及移入的用戶摘要。均為受控頁面，不是登入正式帳號人工驗收。

1.1.5 的地區快捷選擇：`explore-tools.test.cjs` 驗證 URL 地區聯集、全球、範圍替換、非地理／排除條件保留、分頁重設及非法輸入；可選範例只編輯草稿、聯集去重且保留原名稱。三瀏覽器 `explore.spec.cjs` 驗證空清單不播種、手動加入後保存、舊自訂清單／queries 保留、原生移除／路由／heading 重掛載、防重注入、storage 更新不自動套用、舊回應隔離、BFcache 返回重讀及讀取失敗後恢復。`i18n.spec.cjs` 驗證 50 個語言／地區版本的快捷選單和自訂名稱保留。均為受控頁面／API，非正式帳號人工驗收。

1.1.4 的提及通知修復：`notification-filter.test.cjs` 驗證評論／鑑定 show 路徑、數字／UUID、無效主機／端口／ID 及 query 去除；背景測試驗證未解析通知的安全後備與整批拒絕非法目的地。`notification-tabs.spec.cjs` 在三瀏覽器用受控最終 fetch URL 驗證提及、收藏、評論、鑑定混合去重、篩選保留提及、非觀察目的地、HTTP 錯誤頁、登入轉址、失敗後備、最多兩個並發、整批逾時、清單替換及 BFcache 舊回應隔離。這不是正式帳號人工驗收；轉址不可解析時只能按原連結去重。

1.1.3 的通知篩選回歸包含 `notification-filter.test.cjs` 的精確 taxon ID、上下級變化、數字／UUID 消息錨點、時間基準與缺失／撤回保留；背景測試驗證批次限額、來源／frame、重複請求合併及去除照片／位置／文字的最小回傳。三瀏覽器 `notification-tabs.spec.cjs` 覆蓋預設關閉、保存偏好、可見消息去重開啟、原生 CSS 下的隱藏／復原、API 失敗、中途停用、清單重畫、同清單新增錨點、重複注入、帳戶變更及 pagehide。`i18n.spec.cjs` 逐一驗證 50 個版本的新開關與篩選後按鈕；這仍是受控頁面，並非登入正式帳號人工驗收。

1.1.2 的 `vision-score.test.cjs` 驗證原始分數從 bridge、原生候選資料、指紋、快取綁定到門檻判定均不作比例換算。`tests/layout/score-values.spec.cjs` 在三瀏覽器中覆蓋上傳／觀察頁、v1／v2、零分及跨 1 分邊界，包含 `0.316(0.382)`、完整原值提示與快取重開；原回應、請求次數及候選順序維持不變。這些是受控 API／DOM 回歸，不代表已用使用者的登入帳號、私人照片或所有真實網站頁面人工驗收。

1.1.1 的 `tests/layout/user-filters.spec.cjs` 依官方 Angular 篩選器的可見 `user_name`／隱藏 `user_id[ng-model]` 結構，驗證原生清除、無 input/change 的值變化、殘留顯示名稱、URL 移除、重設與來源／排除獨立套用。`explore.spec.cjs` 另驗證未修改的對比表單同步已移除地點，手動草稿仍保留。三個瀏覽器執行同一組受控案例；不代表登入正式帳號人工驗收。官方來源：[搜尋控制器](https://github.com/inaturalist/inaturalist/blob/main/app/assets/javascripts/ang/controllers/observation_search.js.erb)、[篩選器模板](https://github.com/inaturalist/inaturalist/blob/main/app/assets/javascripts/ang/templates/observation_search/filter_menu.html.haml)。

1.1.0 新增離線三瀏覽器回歸：右上角地區與 URL 不同時以原生選擇器為準；觀察／最低分類單元／種級數、分類樹連結、首次最近紀錄同範圍；清除地區恢復全球、零紀錄、未就緒不回退全球、晚到舊回應不覆蓋。背景及 records 測試驗證 region cache 隔離與無效 ID 拒絕。設定頁測試覆蓋自訂聯集正規化、清空、既有 ID／查詢保留、並行修改拒絕及面板共用清單。此處為受控 API／DOM 測試，不代表所有真實語言及帳號頁面已人工驗收。

```sh
npm ci
npm run check
npx playwright install chromium firefox
npm run test:layout
npm run package
```

同一套自動測試對 Chrome、Edge 和 Firefox 產物各執行一次；另檢查三個產物的 JavaScript 語法、所有 manifest 及 options script 引用、平台讀取機制與版本一致性。

高階分類涵蓋分支排除、直接高階鑑定、Leaf taxa 歸併、多地點聯集、全部生物、全球範圍、重複請求合併、快取失效、逾時及錯誤輸入。上傳規則涵蓋 0／0.9／80／80.01／100、缺失分數、確定／不確定提示、首選順序與無效設定。分數橋接另驗證沒有 `window.inaturalistjs` 時的 fetch／XHR、iNaturalist URL 白名單（含 observation UUID）、API v2 Rison URL／JSON body／multipart 欄位投影補入 `combined_score` 與 `vision_score`、非 CV 不解析、原請求只發一次、原 Response／XHR 不變、重複安裝不多重包裝、兩種原始 0–100 分數不換算（包括小於／等於 1 的邊界）、低分原生指紋不重複換算及低分不誤過門檻、純 `vision_score` 不冒充綜合分數、taxon ID 配對、卡片明確作用域、頁面預取依 taxon ID＋視覺分數指紋一次性綁定、明確作用域仍須通過同一指紋驗證、快取選單不發請求時卡片標記自動失效、舊回應晚到不覆蓋、上傳選單遲到事件重掃及 `pagehide` 清理；同一套功能測試對三個建置執行。另驗證上傳與觀察頁即使 paired combined values 不符合畫面排序仍預設顯示 `combined(vision)`，分數是無框彩色數字，沒有百分號或候選列色條、在單行／多行候選列上下居中、觀察頁在讀不到 jQuery 資料時仍以官方 `.ac.vision` 標記顯示配對分數、手動搜尋列不補分、MutationObserver／低頻掃描／清理保留，以及個人次數強制刷新。分數模式下，首選仍只用 combined score，嚴格高於門檻才選首選；等於或低於門檻時必須回退到可選的官方確定類群，兩者都不符合則保留原值。

瀏覽器版面測試同時驗證面板預設在「全選」右側收合、收合時不撐高固定工具列且首排卡片叉號仍可命中並刪除、快捷執行不會展開、展開後回到照片欄、網站替換照片欄後重新掛載，以及上傳／具體觀察頁的 `combined(vision)` 只顯示彩色數字，不產生背景框、邊框、列色條或百分號。

通知按鈕的受控 DOM 測試採用官方 `#updatesnav #updatessubnav` 結構及 `/users/new_updates` 的直接 `ul > li > a` 通知列：異步載入後才顯示按鈕，按觀察 ID 去重並略過站外、搜尋及儀表板連結；背景單元測試確認只接受 iNaturalist 頂層頁面、在同一視窗開不啟用的新分頁，且三個建置共用相同行為。它不會登入真實帳號或標記真實通知。

提及 fixture 依官方 `b1274a0b6cbf757600ff435135867b7b4021f33c` 的 [new_updates 模板](https://github.com/inaturalist/inaturalist/blob/b1274a0b6cbf757600ff435135867b7b4021f33c/app/views/users/new_updates.html.erb)、[評論控制器](https://github.com/inaturalist/inaturalist/blob/b1274a0b6cbf757600ff435135867b7b4021f33c/app/controllers/comments_controller.rb) 及 [鑑定控制器](https://github.com/inaturalist/inaturalist/blob/b1274a0b6cbf757600ff435135867b7b4021f33c/app/controllers/identifications_controller.rb)。mention 的連結以 notifier 為目標，show 再轉址到 parent；不可只匹配 observations，也不可把提及的鑑定錨點誤當純確認通知。

觀察詳情 fixture 依據 iNaturalist `0d8074c09ee177b50603c0ed1fcb5405a4f6835b` 的 [ActivityCreatePanel](https://github.com/inaturalist/inaturalist/blob/0d8074c09ee177b50603c0ed1fcb5405a4f6835b/app/webpack/observations/show/components/activity_create_panel.jsx) 與 [TaxonAutocomplete](https://github.com/inaturalist/inaturalist/blob/0d8074c09ee177b50603c0ed1fcb5405a4f6835b/app/webpack/observations/uploader/components/taxon_autocomplete.jsx)：詳情頁傳入 observation ID，視覺候選由 `isVisionResult` 產生 `.ac.vision[data-taxon-id]`。測試覆蓋 jQuery 資料不可讀時仍顯示、手動搜尋列不補分；這是受控 DOM 回歸，不等同登入正式頁面的人工驗收。

打包程序解壓比對每個檔案，確認 manifest 版本與內容一致。CI 也在 Windows 和 Linux 上執行，離線功能測試不向 iNaturalist 發送請求。

## Edge 驗證（0.11.1 起）

Edge 是獨立建置／打包目標，測試會逐檔確認它與 Chrome 擴充內容一致，包含 MAIN 注入、service worker、權限與語系。Windows CI 另外用已安裝的 Microsoft Edge 執行 20 項介面案例；加上 Chromium、Firefox 共 60 項，涵蓋上傳側欄、收合工具列與首排卡片刪除、停止後修改設定、分數請求與選單指紋綁定、具體觀察頁分數，以及對比、收藏、匯出和個人紀錄。Windows runner 以單一 Playwright worker 依序執行三個瀏覽器，避免 Firefox 與 Edge 同時啟動時的資源競爭造成假性逾時；其他環境保留兩個 worker。Linux CI 驗證三個產物的功能與建置，介面測試使用 Chromium、Firefox。

本機已安裝 Edge 時，在 PowerShell 可單獨執行：

```powershell
$env:LEAFWISE_EDGE_TESTS='1'
npm run test:layout -- --project=edge-layout
```

其他 shell 可先設定同名環境變數。省略 `--project=edge-layout` 會同時跑三個瀏覽器。此設定只選擇測試瀏覽器，不會修改個人瀏覽器設定檔。

0.11.1 已在 Microsoft Edge 152.0.4191.66 的獨立設定檔實際載入擴充，使用既有官方 React／jQuery AI 元件受控頁驗證：背景啟動、設定保存、預覽、原生建議選取與視覺辨識標記、手動值保留、分數與提示規則、自動新增卡片、停止及面板外手動操作中斷均通過。沒有使用正式帳號草稿或發布觀察；這也不代表已在每個歷史 Edge 版本驗收。

0.11.2 已把 Chrome 153、Edge 153 和 Firefox 155 的當次建置載入同一套官方 React／jQuery 元件受控頁。測試以「官方確定葉甲科、下方首選黃帶芫菁屬、首選分數缺失」重現回報；三個瀏覽器的預覽及套用均指向葉甲科。分數門檻、手動值保留、自動新增卡片、停止與外部操作中斷同時通過，測試頁的上傳按鈕全程未觸發。

## 0.10.2 上傳頁版面回歸

新增 10 項瀏覽器版面案例（每個引擎 5 項）。以官方上傳頁的 DOM 結構、固定工具列、沒有指定 top 的固定左欄，以及右側 `#imageGrid` 建立受控頁面，載入實際建置的共用 AI 面板。

舊版在 1280×720 的重現結果：左側欄 y 座標由 100 變成 367，下移 267 像素。修正後，1536×864、1280×720、1024×576 的左欄位置均與未注入面板時相同；410 張觀察、展開長明細、捲動及重新掛載照片欄也不推低左欄。可操作日期最後一列、小時、分鐘及地點輸入，AI 控制項不取消全選。

版面 fixture 的日曆是用於邊界與點擊檢查的測試控制項，不是官方 React 日期選擇器；測試驗證原有側欄的定位不受干擾，不冒充正式帳號的人工驗收。AI 模型及原生選取流程使用下節另外的受控官方元件測試。

0.10.2 也在加入照片欄結構的官方 AI 元件測試頁重跑 Chrome 與 Firefox：原生選取、手動值保留、提示備援、新增卡片、停止及手動操作中斷均通過；Firefox 直接載入當次產出的 XPI。

版面來源：[官方 uploader.scss](https://github.com/inaturalist/inaturalist/blob/d65e6756e8c249d9e56798138cd55a90649a2409/app/assets/stylesheets/observations/uploader.scss)、[上傳頁 DOM 與選取事件](https://github.com/inaturalist/inaturalist/blob/d65e6756e8c249d9e56798138cd55a90649a2409/app/webpack/observations/uploader/components/drag_drop_zone.jsx)。

## 停止後修改規則與門檻回歸

0.10.2 發布後補驗舊版的第二項回報：按停止後，規則與門檻的 disabled 已解除，但官方 jQuery UI selectable 在父層阻止 mousedown 預設行為，Shadow DOM 內的控制項因事件重定向而無法取得焦點。0.10.2 原有的面板事件隔離已同時修好這個問題，無需另一個功能版本。

在受控官方 React 建議元件中加入真正的 jQuery UI selectable 與官方 cancel／distance 設定，分別比較 0.10.1 和 0.10.2：Chrome、Firefox 舊版均重現兩個欄位無法用滑鼠取得焦點；0.10.2 均可停止、用滑鼠及鍵盤修改規則與門檻，並按新門檻重新執行。85 分的建議在 90 門檻保留，在 80 門檻可選取；沒有發布觀察。

倉庫額外加入 4 項可重跑案例（每個引擎分別測手動／自動處理後停止），使版面及互動測試合計 14 項。CI fixture 重現父層阻止 mousedown 的行為，以滑鼠點擊、焦點斷言、鍵盤輸入及重新執行驗證；不使用會跳過滑鼠焦點問題的 fill／selectOption。這仍屬受控頁面驗證，未操作回報者的真實草稿。

## 瀏覽器驗證的範圍

0.11.0 新增 12 項瀏覽器案例，連同上傳回歸共 26 項。受控頁面載入實際建置的背景服務、訊息處理、收藏邏輯及內容腳本，替換公開 API 回應及擴充儲存外殼：驗證分區成員、自訂分組跨頁保存、完整 URL 和面板收藏還原、年份／地方／首次模式、月份與個人基準分離、跨頁 CSV、剪貼簿失敗備援、按需首次／最近紀錄、快取、SPA 清理及錯誤重試。這些測試不登入正式帳號，不發布觀察。

另以官方 API 小範圍核驗：澳門鳥類 2025 年 9 月的 taxonomy 根計數與 observations 總數相符（核驗時 80 筆）；公開個人觀察查詢接受 `d1=0001-01-01`、`order_by=observed_on` 與 `per_page=1`。省級地點 ID 逐一核對，見 [分區表](REGIONS.md)。真實照片、API 完整回應及登入資訊沒有納入倉庫。

0.11.0 另實際載入 Chrome 建置及 Firefox 當次 XPI，在既有的官方 React／jQuery AI 元件受控頁驗證：背景啟動、設定保存、原生選取、手動值保留、提示備援、停止、手動操作中斷及自動新增卡片均通過。沒有以回報者的正式帳號草稿作測試。

0.10.0 的原始瀏覽器適配曾在 Firefox 155.0.1 及 Google Chrome for Testing 153.0.8010.36 驗證。使用固定提交 `d65e6756e8c249d9e56798138cd55a90649a2409` 的官方 React `TaxonAutocomplete` 與 jQuery `genericAutocomplete` 元件，搭配受控 AI 回應。原生選取確實更新 React 草稿並保留 `isVisionResult`；預覽、手動值保留、快取、自動新增卡片、停止及使用者操作中斷均通過。

0.10.1 已在同樣的受控官方元件中重跑 Chrome 與 Firefox 整合測試並通過；Firefox 測試直接載入當次產出的 XPI。過程找出並修正 Firefox 隔離環境的 window／全域物件差異，加入對應初始化回歸覆蓋。

該測試沒有使用真實使用者照片或發布觀察，也不能驗證 AI 模型的準確率。原始元件、瀏覽器 profile、登入狀態及 API 回應不納入公開倉庫。可重跑的倉庫測試著重建置與規則回歸，CI 不宣稱每次登入正式上傳頁實測。

## 每次發版的人工驗收

多語言變更還需在三瀏覽器切換網站的簡中、繁中、香港繁中、英文和至少一種 RTL 語言，重新載入後核對按鈕、分數說明與設定頁；確認自訂名稱／草稿未被翻譯、收合工具列仍可刪除首排觀察。`tests/layout/i18n.spec.cjs` 是受控頁測試：包含 50 種通知按鈕、7 種代表語言上傳版面與設定資料保存，不是登入正式網站或母語校對。

在三個瀏覽器都載入當次建置：

1. 設定頁保存常用使用者、鳥類及全部生物，重新開啟確認仍保留。
2. 高階分類比較使用一個地點、多地點及全球；切換目／科／屬，核驗一列 Leaf taxa。
3. 上傳頁加入少量照片：高分、低分、已手動選好及已輸入文字者。先預覽，確認草稿不變；再套用，確認只有符合規則者填入。
4. 提示模式中，有確定上階提示時選下方首選，沒有提示時保留原值。預設模式的低分不被提示放行。
5. 開啟自動模式後加入一张照片，再測停止及面板外手動操作；確認遲到回應不覆蓋草稿。
6. 檢查原有欄位及手動分類保持正確。發布觀察始終由使用者自行決定。

PR／Release 說明應分清「離線測試」「受控官方元件測試」和「正式頁面人工驗收」，不要把其中一種寫成另一種。
