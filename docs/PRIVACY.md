# 資料及權限

Leafwise 只為下述面向使用者的 iNaturalist 功能讀取、儲存及使用資料；不出售使用者資料，不用於廣告、信用評等或貸款，也不允許開發者讀取使用者的本機資料。使用 Google API 所取得的資料遵守 Chrome Web Store User Data Policy，包括 Limited Use 要求。使用者可以在選項頁移除收藏，或透過瀏覽器移除擴充功能及其本機資料。英文版本見 [Privacy Policy](PRIVACY.en.md)。

三個瀏覽器版本均使用 `storage`、`https://api.inaturalist.org/*`，及 iNaturalist 頁面的 content scripts；通知按鈕需要在網站各頁讀取右上角已載入的活動清單。沒有分析、廣告、遙測、外部代理或第三方 AI 服務。

「一鍵開啟這些觀察」只在使用者點擊時從目前通知下拉清單讀取觀察 ID，去重後交由擴充背景程序建立同站的背景分頁；不儲存通知內容、不查詢其他人的私訊、不向第三方傳送通知，也不新增 `tabs` 權限。非觀察頁連結不會處理。

啟用通知篩選時，背景以 `credentials: "omit"` 向官方公開 API 批次查詢目前清單中的觀察 ID。頁面只取得比對所需的鑑定／分類／使用者 ID、時間、有效狀態及是否有文字說明；不回傳照片、位置或說明文字，不持久保存鑑定歷史，不修改已讀狀態。`storage.local.leafwiseNotificationFilterV1` 只保存開關布林值，不同步。沒有新增權限或取得登入憑證。

使用者主動套用、檢查、開啟自動模式或使用觀察頁鑑定建議時，插件沿用 iNaturalist 原有的 AI 建議請求。網站自行把辨識圖片及可用的位置／日期送到官方辨識服務，沿用網站登入驗證。插件在 MAIN 環境處理符合白名單的原生 fetch／XHR JSON 回應，只在頁面記憶體中取出分類 ID、`combined_score` 與 `vision_score`。API v2 請求若已限制回傳欄位卻省略其中一個分數，插件只在同一請求的欄位投影補入缺少的布林欄位；不改照片、觀察、位置、日期、驗證或回應，不另行呼叫辨識 API、不另行取得 Token、Cookie、密碼，也不另行保存或向第三方傳送資料。

頁面卡片、圖片來源標記、候選分類 ID、綜合分數及視覺分數用於查詢、把原生回應綁定到正確卡片、防止結果套用到已變動草稿，及顯示明細；只在本頁記憶體保留。離開頁面後不保留分數或處理明細，也不跨頁啟用自動模式。面板的展開／收合偏好以 `leafwise-upload-ai-panel-open` 保存於頁面 localStorage。使用原生選取事件填草稿，不發布觀察。

高階分類及個人計數功能會把公開使用者名稱／ID、分類 ID、地點與查詢條件送到官方統計 API。分類頁的最低分類單元數及種級數分別來自官方 `/observations/species_counts` 與 `/observations/observers`，按使用者及類群查詢並快取 5 分鐘。背景程式的統計請求使用 `credentials: "omit"`；這不包含由網站自行驗證的 AI 請求。

常用使用者與類群存於瀏覽器 `storage.sync`，可依 Chrome／Firefox 同步設定經 Google／Mozilla 同步。個人觀察計數使用 `storage.local` 快取，高階分類服務使用 `storage.session` 快取。設定不會透過 GitHub 倉庫同步。

插件語言跟隨 iNaturalist 的網頁語言；最近一次語言碼保存在本機 `storage.local.leafwiseLastSiteLocale`，供設定頁使用，不保存帳戶資料、不跨瀏覽器同步。翻譯文案隨擴充附帶，不送第三方翻譯服務。公開分類名稱查詢會將選擇的語言碼傳給 iNaturalist，名稱快取按語言區分。

查詢收藏與自訂地點組合保存在 `storage.local`，不跨瀏覽器同步；內容包含使用者主動保存的完整搜尋網址、對比條件與名稱，可在面板刪除。載入收藏的網址可帶 `leafwise_query` 本機收藏識別碼，以還原對比面板；其他瀏覽器沒有該收藏時只恢復網址中的原生搜尋條件。

個人紀錄小卡按需讀取官方公開 API，僅保存首次／最近觀察的 ID、日期、公開位置文字及筆數，放在記憶體／`storage.session` 快取 5 分鐘。背景请求不携带登入憑證，無法取得非公開座標。複製／CSV 匯出僅由使用者點擊觸發，資料寫入本機剪貼簿或下載檔，不上傳第三方；沒有新增瀏覽器權限。

Chrome／Edge 的建議介面在 MAIN 環境存取網站 jQuery；Firefox 介面透過 `wrappedJSObject` 讀取原生建議資料。三個版本另在 MAIN 環境包裝頁面原有的 fetch／XHR，只對 iNaturalist HTTPS 主機下 `/v1`／`/v2` 的 CV 評分端點讀取 JSON，並只在上述 API v2 欄位投影缺漏時補入 `combined_score`／`vision_score`；相容舊頁面的 `window.inaturalistjs` 包裝不是必要資料路徑。這些 MAIN 腳本不具有擴充 API 權限，也不向頁面暴露帶擴充權限的回呼。Firefox manifest 保留 `websiteContent` 及 `personallyIdentifyingInfo` 的必要資料宣告。
