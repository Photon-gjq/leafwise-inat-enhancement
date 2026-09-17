# 資料及權限

三個瀏覽器版本均使用 `storage`、`https://api.inaturalist.org/*`，及 iNaturalist 指定觀察／分類頁的 content scripts。沒有分析、廣告、遙測、外部代理或第三方 AI 服務。

使用者主動套用、檢查、開啟自動模式或使用觀察頁鑑定建議時，插件沿用 iNaturalist 原有的 AI 建議請求。網站自行把辨識圖片及可用的位置／日期送到官方辨識服務，沿用網站登入驗證。插件在 MAIN 環境被動旁讀符合白名單的原生 fetch／XHR JSON 回應，只在頁面記憶體中取出分類 ID 與 `combined_score`；不改動請求／回應、不另行呼叫辨識 API、不另行取得 Token、Cookie、密碼，也不另行保存或向第三方傳送照片、位置或日期。

頁面卡片、圖片來源標記、候選分類 ID 及綜合分數用於查詢、防止結果套用到已變動草稿，及顯示明細；只在本頁記憶體保留。離開頁面後不保留分數或處理明細，也不跨頁啟用自動模式。面板的展開／收合偏好以 `leafwise-upload-ai-panel-open` 保存於頁面 localStorage。使用原生選取事件填草稿，不發布觀察。

高階分類及個人計數功能會把公開使用者名稱／ID、分類 ID、地點與查詢條件送到官方統計 API。背景程式的統計請求使用 `credentials: "omit"`；這不包含由網站自行驗證的 AI 請求。

常用使用者與類群存於瀏覽器 `storage.sync`，可依 Chrome／Firefox 同步設定經 Google／Mozilla 同步。個人觀察計數使用 `storage.local` 快取，高階分類服務使用 `storage.session` 快取。設定不會透過 GitHub 倉庫同步。

查詢收藏與自訂地點組合保存在 `storage.local`，不跨瀏覽器同步；內容包含使用者主動保存的完整搜尋網址、對比條件與名稱，可在面板刪除。載入收藏的網址可帶 `leafwise_query` 本機收藏識別碼，以還原對比面板；其他瀏覽器沒有該收藏時只恢復網址中的原生搜尋條件。

個人紀錄小卡按需讀取官方公開 API，僅保存首次／最近觀察的 ID、日期、公開位置文字及筆數，放在記憶體／`storage.session` 快取 5 分鐘。背景请求不携带登入憑證，無法取得非公開座標。複製／CSV 匯出僅由使用者點擊觸發，資料寫入本機剪貼簿或下載檔，不上傳第三方；沒有新增瀏覽器權限。

Chrome／Edge 的建議介面在 MAIN 環境存取網站 jQuery；Firefox 介面透過 `wrappedJSObject` 讀取原生建議資料。三個版本另在 MAIN 環境包裝頁面原有的 fetch／XHR，只對 iNaturalist HTTPS 主機下 `/v1`／`/v2` 的 CV 評分端點旁讀 JSON；相容舊頁面的 `window.inaturalistjs` 包裝不是必要資料路徑。這些 MAIN 腳本不具有擴充 API 權限，也不向頁面暴露帶擴充權限的回呼。Firefox manifest 保留 `websiteContent` 及 `personallyIdentifyingInfo` 的必要資料宣告。
