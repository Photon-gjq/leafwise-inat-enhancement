# 維護流程

此倉庫是從 0.10.1 起唯一的原始碼來源。使用 `main`、功能分支、Issues 和 Releases 管理即可；小型專案不另設長期 develop 分支，也不建立第二個瀏覽器倉庫。

## 開發一項修改

```sh
git switch main
git pull --ff-only
git switch -c fix/short-description
npm ci
# 修改 src/，必要時修改 platforms/；補有意義的回歸測試
npm run check
npx playwright install chromium firefox
npm run test:layout
npm run package
git add src platforms scripts tests docs CHANGELOG.md
git commit -m "Fix the concrete problem"
git push -u origin HEAD
```

在 GitHub 開 PR，說明觸發條件、改後行為及驗證結果。CI 會在 Windows 和 Linux 上建置與測試 Chrome、Edge 和 Firefox。三個瀏覽器產物均通過才合併；目前這是維護流程約定，沒有另外開啟付費功能或強制分支保護。

需求與錯誤使用 Issue 範本記錄。每項 Issue 可附預期版本 milestone；不必把每個微小修改拆成 Issue。一次修改盡量只處理一個問題，方便回退。

## 版本規則

- `patch`：修正或內部整理，例如 0.10.1 → 0.10.2。
- `minor`：新增功能，例如 0.10.1 → 0.11.0。
- `major`：不相容的設定、行為或資料變更。

版本唯一來源是 `package.json`；`npm version` 同步更新 lockfile。manifest 版本由建置生成，不能手動維護多份。Firefox 的既有 gecko ID 不可任意更換。

## 發佈三個瀏覽器版本

先在修改分支執行以下步驟，再經 PR 合併：

```sh
npm version patch --no-git-tag-version
# 將 CHANGELOG.md 的 Unreleased 內容移到新的 x.y.z 標題，填日期
npm run check
npm run package
```

Chrome／Edge／Firefox 都以少量照片完成 [人工驗收](docs/TESTING.md) 後，於已合併的 `main` 發佈標籤：

```sh
git switch main
git pull --ff-only
# X.Y.Z 必須等於 package.json，不可直接照抄
git tag -a vX.Y.Z -m "Leafwise X.Y.Z"
git push origin vX.Y.Z
```

GitHub Actions 先測試與建置，再發布同一標籤的 Chrome ZIP、Edge ZIP、Firefox ZIP、未簽章 XPI 及 SHA256。若標籤、版本或更新紀錄不一致，發佈會失敗。Firefox AMO 自動提交啟用後，同一工作流程會把 `build/firefox` 以 `listed` 渠道提交至既有公開頁面；Chrome Web Store 與 Microsoft Edge Add-ons 仍未設定商店發布。

Firefox 提交使用 Mozilla 的 `web-ext sign`。在倉庫 Actions secrets 設定 `AMO_JWT_ISSUER`、`AMO_JWT_SECRET`，再把 Actions variable `AMO_AUTO_PUBLISH` 設為 `true`。憑證從 AMO Developer Hub 的 API key 頁面建立，只能保存於 GitHub Secrets，不能寫進檔案、Issue、Actions variable 或日誌。manifest 的 Gecko ID 會讓 AMO 把套件識別為既有 Leafwise 更新。首次啟用時可在 Actions 手動執行 `Build, test and release` 並勾選 `publish_firefox`，提交目前版本；往後推送版本標籤會在三瀏覽器測試與 GitHub Release 成功後自動送交 AMO。工作流會先查詢 AMO 公開版本 API，已存在的版本會安全跳過。

AMO 收到 `listed` 更新後仍可能進入 Mozilla 的自動檢查或人工審核；GitHub 的成功狀態表示已提交，不表示新版已立即公開。Firefox 會在 AMO 核准並發布後向已安裝使用者提供更新。

失敗時先查看 Actions 記錄，不手動修改 Release 附件。程式碼需修正時使用下一個 patch 版本；不要覆寫已發佈的 Git 標籤或把舊檔冒充新版本。只因網路中斷的失敗，可在 GitHub 重跑同一工作流程；發佈步驟能重用既有 Release 並補上附件，AMO 步驟也會跳過已存在的同版本。

## 原始碼分工

- `src/`：所有共同功能，使用 `chrome.*` 命名空間。
- `platforms/*.json`：瀏覽器差異；`platforms/*-page-data.js`：最小化的頁面資料存取適配。
- Firefox 建置把 `chrome.*` 轉為 `browser.*`；Chrome／Edge 背景前置加入 `importScripts`。這些是集中且受測試的建置轉換；Edge 共用 Chrome 的 manifest 與 page-data 適配器。
- `build/`、`dist/`、測試瀏覽器 profile、登入資訊、照片與網路回應均不提交。新增依賴需鎖定版本，不把使用者真實資料當 fixture。

詳見 [架構](docs/ARCHITECTURE.md) 及 [資料與權限](docs/PRIVACY.md)。
