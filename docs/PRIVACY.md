# 資料及權限

兩個瀏覽器版本均使用 `storage`、`https://api.inaturalist.org/*`，及 iNaturalist 指定觀察／分類頁的 content scripts。沒有分析、廣告、遙測、外部代理或第三方 AI 服務。

使用者主動套用、檢查或開啟自動模式時，插件觸發 iNaturalist 原有的 AI 建議元件。網站自行把辨識縮圖及元件使用的位置／日期送到官方辨識服務，沿用網站登入驗證。插件不另行取得 Token、Cookie、密碼，也不另行保存或向第三方傳送照片。

頁面卡片、图片來源標記及候選分數用於查詢、防止結果套用到已變動草稿，及顯示明細；只在本頁記憶體保留。離開頁面後不保留處理明細，也不跨頁啟用自動模式。使用原生選取事件填草稿，不發布觀察。

高階分類及個人計數功能會把公開使用者名稱／ID、分類 ID、地點與查詢條件送到官方統計 API。背景程式的統計請求使用 `credentials: "omit"`；這不包含由網站自行驗證的 AI 請求。

常用使用者與類群存於瀏覽器 `storage.sync`，可依 Chrome／Firefox 同步設定經 Google／Mozilla 同步。個人觀察計數使用 `storage.local` 快取，高階分類服務使用 `storage.session` 快取。設定不會透過 GitHub 倉庫同步。

Chrome 上傳助手在 MAIN 環境存取網站 jQuery；該部分不使用擴充 API。Firefox 透過 `wrappedJSObject` 讀取原生建議資料，不向頁面暴露帶擴充權限的回呼。Firefox manifest 保留 `websiteContent` 及 `personallyIdentifyingInfo` 的必要資料宣告。
