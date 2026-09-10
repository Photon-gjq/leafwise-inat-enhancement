# 測試與驗收

## 自動測試

```sh
npm ci
npm run check
npx playwright install chromium firefox
npm run test:layout
npm run package
```

同一套 32 項測試對 Chrome 和 Firefox 產物各執行一次，共 64 個測試案例執行；另檢查兩個產物的 JavaScript 語法、所有 manifest 及 options script 引用、平台讀取機制與版本一致性。

高階分類涵蓋分支排除、直接高階鑑定、Leaf taxa 歸併、多地點聯集、全部生物、全球範圍、重複請求合併、快取失效、逾時及錯誤輸入。上傳規則涵蓋 0／0.9／80／80.01／100、缺失分數、確定／不確定提示、首選順序、無效設定與不選共同祖先。

打包程序解壓比對每個檔案，確認 manifest 版本與內容一致。CI 也在 Windows 和 Linux 上執行，離線功能測試不向 iNaturalist 發送請求。

## 0.10.2 上傳頁版面回歸

新增 10 項瀏覽器版面案例（每個引擎 5 項）。以官方上傳頁的 DOM 結構、固定工具列、沒有指定 top 的固定左欄，以及右側 `#imageGrid` 建立受控頁面，載入實際建置的共用 AI 面板。

舊版在 1280×720 的重現結果：左側欄 y 座標由 100 變成 367，下移 267 像素。修正後，1536×864、1280×720、1024×576 的左欄位置均與未注入面板時相同；410 張觀察、展開長明細、捲動及重新掛載照片欄也不推低左欄。可操作日期最後一列、小時、分鐘及地點輸入，AI 控制項不取消全選。

版面 fixture 的日曆是用於邊界與點擊檢查的測試控制項，不是官方 React 日期選擇器；測試驗證原有側欄的定位不受干擾，不冒充正式帳號的人工驗收。AI 模型及原生選取流程使用下節另外的受控官方元件測試。

0.10.2 也在加入照片欄結構的官方 AI 元件測試頁重跑 Chrome 與 Firefox：原生選取、手動值保留、提示備援、新增卡片、停止及手動操作中斷均通過；Firefox 直接載入當次產出的 XPI。

版面來源：[官方 uploader.scss](https://github.com/inaturalist/inaturalist/blob/d65e6756e8c249d9e56798138cd55a90649a2409/app/assets/stylesheets/observations/uploader.scss)、[上傳頁 DOM 與選取事件](https://github.com/inaturalist/inaturalist/blob/d65e6756e8c249d9e56798138cd55a90649a2409/app/webpack/observations/uploader/components/drag_drop_zone.jsx)。

## 瀏覽器驗證的範圍

0.10.0 的原始瀏覽器適配曾在 Firefox 155.0.1 及 Google Chrome for Testing 153.0.8010.36 驗證。使用固定提交 `d65e6756e8c249d9e56798138cd55a90649a2409` 的官方 React `TaxonAutocomplete` 與 jQuery `genericAutocomplete` 元件，搭配受控 AI 回應。原生選取確實更新 React 草稿並保留 `isVisionResult`；預覽、手動值保留、快取、自動新增卡片、停止及使用者操作中斷均通過。

0.10.1 已在同樣的受控官方元件中重跑 Chrome 與 Firefox 整合測試並通過；Firefox 測試直接載入當次產出的 XPI。過程找出並修正 Firefox 隔離環境的 window／全域物件差異，加入對應初始化回歸覆蓋。

該測試沒有使用真實使用者照片或發布觀察，也不能驗證 AI 模型的準確率。原始元件、瀏覽器 profile、登入狀態及 API 回應不納入公開倉庫。可重跑的倉庫測試著重建置與規則回歸，CI 不宣稱每次登入正式上傳頁實測。

## 每次發版的人工驗收

在兩個瀏覽器都載入當次建置：

1. 設定頁保存常用使用者、鳥類及全部生物，重新開啟確認仍保留。
2. 高階分類比較使用一個地點、多地點及全球；切換目／科／屬，核驗一列 Leaf taxa。
3. 上傳頁加入少量照片：高分、低分、已手動選好及已輸入文字者。先預覽，確認草稿不變；再套用，確認只有符合規則者填入。
4. 提示模式中，有確定上階提示時選下方首選，沒有提示時保留原值。預設模式的低分不被提示放行。
5. 開啟自動模式後加入一张照片，再測停止及面板外手動操作；確認遲到回應不覆蓋草稿。
6. 檢查原有欄位及手動分類保持正確。發布觀察始終由使用者自行決定。

PR／Release 說明應分清「離線測試」「受控官方元件測試」和「正式頁面人工驗收」，不要把其中一種寫成另一種。
