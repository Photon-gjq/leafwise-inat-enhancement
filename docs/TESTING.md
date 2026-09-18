# 測試與驗收

## 自動測試

```sh
npm ci
npm run check
npx playwright install chromium firefox
npm run test:layout
npm run package
```

同一套自動測試對 Chrome、Edge 和 Firefox 產物各執行一次；另檢查三個產物的 JavaScript 語法、所有 manifest 及 options script 引用、平台讀取機制與版本一致性。

高階分類涵蓋分支排除、直接高階鑑定、Leaf taxa 歸併、多地點聯集、全部生物、全球範圍、重複請求合併、快取失效、逾時及錯誤輸入。上傳規則涵蓋 0／0.9／80／80.01／100、缺失分數、確定／不確定提示、首選順序與無效設定。分數橋接另驗證沒有 `window.inaturalistjs` 時的 fetch／XHR、iNaturalist URL 白名單、非 CV 不解析、原請求只發一次、原 Response／XHR 不變、重複安裝不多重包裝、原始 0–1 `combined_score` 正規化、>1–100 相容、拒絕 `vision_score`、taxon ID 配對、上傳選單遲到事件重掃及 `pagehide` 清理；同一套功能測試對三個建置執行。另驗證分數是無框彩色數字且沒有百分號或候選列色條、觀察頁在讀不到 jQuery 資料時仍以官方 `.ac.vision` 標記顯示視覺候選分數、手動搜尋列不補分、MutationObserver／低頻掃描／清理保留，以及個人次數強制刷新。分數模式下，首選嚴格高於門檻才選首選；等於或低於門檻時必須回退到可選的官方確定類群，兩者都不符合則保留原值。

瀏覽器版面測試同時驗證面板預設在「全選」右側收合、快捷執行不會展開、展開後回到照片欄、網站替換照片欄後重新掛載，以及上傳／具體觀察頁的綜合分數只顯示彩色數字，不產生背景框、邊框、列色條或百分號。

觀察詳情 fixture 依據 iNaturalist `0d8074c09ee177b50603c0ed1fcb5405a4f6835b` 的 [ActivityCreatePanel](https://github.com/inaturalist/inaturalist/blob/0d8074c09ee177b50603c0ed1fcb5405a4f6835b/app/webpack/observations/show/components/activity_create_panel.jsx) 與 [TaxonAutocomplete](https://github.com/inaturalist/inaturalist/blob/0d8074c09ee177b50603c0ed1fcb5405a4f6835b/app/webpack/observations/uploader/components/taxon_autocomplete.jsx)：詳情頁傳入 observation ID，視覺候選由 `isVisionResult` 產生 `.ac.vision[data-taxon-id]`。測試覆蓋 jQuery 資料不可讀時仍顯示、手動搜尋列不補分；這是受控 DOM 回歸，不等同登入正式頁面的人工驗收。

打包程序解壓比對每個檔案，確認 manifest 版本與內容一致。CI 也在 Windows 和 Linux 上執行，離線功能測試不向 iNaturalist 發送請求。

## Edge 驗證（0.11.1 起）

Edge 是獨立建置／打包目標，測試會逐檔確認它與 Chrome 擴充內容一致，包含 MAIN 注入、service worker、權限與語系。Windows CI 另外用已安裝的 Microsoft Edge 執行 17 項介面案例；加上 Chromium、Firefox 共 51 項，涵蓋上傳側欄、停止後修改設定、具體觀察頁分數，以及對比、收藏、匯出和個人紀錄。Linux CI 驗證三個產物的功能與建置，介面測試使用 Chromium、Firefox。

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

在三個瀏覽器都載入當次建置：

1. 設定頁保存常用使用者、鳥類及全部生物，重新開啟確認仍保留。
2. 高階分類比較使用一個地點、多地點及全球；切換目／科／屬，核驗一列 Leaf taxa。
3. 上傳頁加入少量照片：高分、低分、已手動選好及已輸入文字者。先預覽，確認草稿不變；再套用，確認只有符合規則者填入。
4. 提示模式中，有確定上階提示時選下方首選，沒有提示時保留原值。預設模式的低分不被提示放行。
5. 開啟自動模式後加入一张照片，再測停止及面板外手動操作；確認遲到回應不覆蓋草稿。
6. 檢查原有欄位及手動分類保持正確。發布觀察始終由使用者自行決定。

PR／Release 說明應分清「離線測試」「受控官方元件測試」和「正式頁面人工驗收」，不要把其中一種寫成另一種。
