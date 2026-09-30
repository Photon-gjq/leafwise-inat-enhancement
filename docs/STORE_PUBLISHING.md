# Chrome／Edge 商店上架與自動更新

Chrome Web Store、Microsoft Edge Add-ons 與 GitHub Release 使用同一個 `package.json` 版本和同一份共用來源。`npm run package` 會產生兩種 ZIP：

| 用途 | 檔案 | ZIP 內 manifest 位置 |
| --- | --- | --- |
| GitHub 手動安裝 | `Leafwise-x.y.z-chrome.zip`、`-edge.zip` | `extension/manifest.json` |
| 商店上傳 | `Leafwise-x.y.z-chrome-store.zip`、`-edge-store.zip` | `manifest.json`（根目錄） |

不要把 GitHub 手動安裝 ZIP 上傳商店，也不要把 `dist/` 或登入憑證提交 Git。

## 首次上架：必須在開發者後台完成

1. Chrome：在 [Chrome Web Store 開發者後台](https://chrome.google.com/webstore/devconsole/) 註冊開發者、完成官方要求的一次性註冊費及兩步驗證。新增項目，上傳 `chrome-store.zip`，填寫商店資料、隱私聲明、發佈範圍和審核資料，再提交審核。首次項目建立後記下 extension ID 和 Publisher Settings 的 publisher ID。[Google 首次上架說明](https://developer.chrome.com/docs/webstore/publish/)。
2. Edge：在 [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) 建立開發者帳戶和擴充項目，上傳 `edge-store.zip`，填寫可用地區、說明、隱私及審核資料，再提交審核。記下 Extension overview 的 Product ID。[Microsoft 首次上架說明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)。
3. 商店資訊應如實說明：Leafwise 只在 iNaturalist 頁面上運行；AI 分數來自 iNaturalist 自己的辨識回應，不是正確率；批次功能只修改上傳草稿，不會自動發佈觀察。可把本倉庫 [隱私說明](PRIVACY.md)、[中文使用說明](USAGE.md)及[英語指南](GUIDE.en.md)作為申報依據。審核通過前，GitHub Actions 的「已提交」不代表商店已公開。

## 啟用版本標籤自動提交更新

先確定兩個商店項目都已首次發佈。Chrome Web Store API v2 和 Microsoft Edge Add-ons Update REST API 只用於更新既有項目；Edge API 不能建立新項目。請在各自官方後台建立以下憑證，**直接存入 GitHub 倉庫 Settings → Secrets and variables → Actions，不要貼進聊天、文件或 commit**：

| 商店 | GitHub Actions variables（非秘密） | GitHub Actions secrets |
| --- | --- | --- |
| Chrome | `CWS_PUBLISHER_ID`、`CWS_EXTENSION_ID` | `CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、`CWS_REFRESH_TOKEN` |
| Edge | `EDGE_PRODUCT_ID`、`EDGE_CLIENT_ID` | `EDGE_API_KEY` |

Chrome：依照 [Google API v2 指南](https://developer.chrome.com/docs/webstore/using-api/) 在 Google Cloud 啟用 Chrome Web Store API，建立 OAuth client，授權商店擁有者並取得 refresh token。不要使用已停止維護的 API v1.1。Edge：在 Partner Center 的 Publish API 啟用 [v1.1 API key](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api)，不要使用已淘汰的 v1 client secret 流程。

Google OAuth 品牌頁的公開首頁為 `https://photon-gjq.github.io/leafwise-inat-enhancement/`，隱私政策為 `https://photon-gjq.github.io/leafwise-inat-enhancement/privacy.html`，網站由獨立的 `pages.yml` 部署 `site/`。在取得長期自動更新用的 refresh token 前，先將 OAuth 發佈狀態改為正式環境；外部「測試」狀態下此 scope 的授權及 refresh token 會於 7 天後到期。[Google OAuth 發佈狀態說明](https://support.google.com/cloud/answer/15549945)。填寫網址不等於已通過品牌／網域驗證，如 Google 要求所有權證明，須依 Search Console 完成，不能聲稱擁有 `github.com`。

完成設定後，先以新於商店現有版本的 `vX.Y.Z` 標籤發佈。正式啟用自動提交時，再將 Actions variables `CWS_AUTO_PUBLISH`、`EDGE_AUTO_PUBLISH` 分別設為 `true`。一般 `main` push 或 PR 只測試、不提交商店；版本標籤會先完成三瀏覽器 Windows／Linux 測試、打包和 GitHub Release，然後分別提交 Chrome 與 Edge 更新。需要單次手動重試時，可在 `Build, test and release` 的 `workflow_dispatch` 勾選 `publish_chrome` 或 `publish_edge`；Edge 請勿在相同版本已送審時重複提交。

Chrome 工作流會先讀取現有項目狀態，同版本已公開或已提交則跳過；否則上傳商店專用 ZIP，等待上傳成功後提交審核。Edge 工作流會等候套件上傳成功，再提交審核，並檢查操作狀態。商店審核與最終公開仍由 Google／Microsoft 決定，不由 GitHub Actions 的成功狀態保證。
