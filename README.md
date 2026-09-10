# Leafwise · iNaturalist Enhancement

[![Build, test and release](https://github.com/Photon-gjq/leafwise-inat-enhancement/actions/workflows/build.yml/badge.svg)](https://github.com/Photon-gjq/leafwise-inat-enhancement/actions/workflows/build.yml)

iNaturalist 網頁增強插件。**一份核心原始碼，同時建置 Chrome 和 Firefox 兩個版本。**

提供類群對比、季節目標清單、查詢與地點組合收藏、個人紀錄小卡，以及上傳頁的批次 AI 建議助手。不是 iNaturalist 官方產品。

## 下載與安裝

到 [Releases](https://github.com/Photon-gjq/leafwise-inat-enhancement/releases/latest) 下載所需瀏覽器版本，兩者使用相同版本號。

| 瀏覽器 | 安裝包 | 安裝方法 |
| --- | --- | --- |
| Chrome 114+ | `Leafwise-x.y.z-chrome.zip` | 解壓；`chrome://extensions` → 開發人員模式 → 載入其中的 `extension` 資料夾。 |
| Firefox 140+ | `Leafwise-x.y.z-firefox-unsigned.xpi` | `about:debugging#/runtime/this-firefox` → 載入暫時附加元件 → 選 XPI。 |

Firefox 目前是未簽章測試包，重新啟動後需再次暫時載入；正式永久安裝需要 Mozilla 簽章。Chrome 請保留已載入的資料夾。GitHub 發佈會同時更新兩份下載包，**不等於瀏覽器內已安裝的本機版本會自動升級**。完整步驟見 [安裝及升級](docs/INSTALL.md)。

## 功能

- **類群對比**：生涯未見、已見但該年未見、已見但此地未見、該年首次記錄；彙總目／科／屬等整個分支，顯示當地後代觀察數與可核驗的 Leaf taxa。全部生物 ID 為 `48460`，鳥類為 `3`。
- **季節目標**：歷年月份、日期與項目條件只限制當地候選清單；一鍵設定本月，按記錄數排序。
- **地點組合及查詢收藏**：內建「中國大陸+港澳臺」（`6903,7613,7887,10301`）與華南（含港澳）等分區；`any` 表示全球。可保存自訂組合、完整搜尋網址與面板條件。[查看分區成員](docs/REGIONS.md)
- **個人紀錄小卡**：在觀察／類群頁點擊個人次數，按需查看首次、最近與全部觀察。沿用常用使用者、類群及中文名管理。
- **複製及 CSV**：匯出所有符合目前名稱篩選的對比結果，保留排序、核驗後 Leaf taxa 與範圍資訊。
- **批次 AI 草稿**：預設保留已填的分類／手動文字，依序套用第一個最佳建議；支援預覽、自動處理新增空白照片、停止與明細。

AI 預設要求第一項視覺分數嚴格大於 80；數字不可讀時，只有官方「非常確定它屬於這個……」提示出現，才選下方第一個最佳建議。也可選只看官方提示。視覺分數是 0–100 的模型分數，**不是實際正確率**。插件只填草稿，最後由使用者檢查並上傳。詳見 [使用說明](docs/USAGE.md) 與 [資料及權限](docs/PRIVACY.md)。

## 專案結構

```text
src/                 共用功能、介面、語系與基本 manifest
platforms/           Chrome / Firefox manifest 差異及小型頁面資料適配器
scripts/             同步建置、測試、打包及發佈說明產生器
tests/               同一套測試，分別對兩個建置結果執行
docs/                使用、安裝、架構與測試文件
.github/             自動測試／發佈、Issue 與 PR 範本
build/               本機載入用產物（自動產生、不提交）
dist/                ZIP / XPI / SHA256（自動產生、不提交）
```

## 本機開發

安裝 Node.js 22 或以上，克隆倉庫後執行：

```sh
npm ci
npm run check
npx playwright install chromium firefox
npm run test:layout
npm run package
```

`check` 會先建置，再對兩個瀏覽器產物執行語法和功能測試。`test:layout` 在獨立 Chromium／Firefox 中驗證上傳頁版面；Linux 安裝瀏覽器時可用 `--with-deps` 一併安裝系統依賴。`package` 會同步產出 Chrome ZIP、Firefox ZIP、未簽章 XPI 及校驗碼；壓縮檔會自動解壓比對每個檔案，確認未遺漏或改變內容。執行期間不登入 iNaturalist，也不發布觀察。

## 之後如何更新

1. 在 [Issues](https://github.com/Photon-gjq/leafwise-inat-enhancement/issues) 記錄需求或錯誤，註明瀏覽器、版本及重現步驟。
2. 每個修改使用一個分支；功能在 `src/` 修改，瀏覽器差異在 `platforms/` 修改。不要直接修改 `build/` 或 `dist/`。
3. 開 PR，通過 Chrome＋Firefox 測試，再合併到 `main`。`main` 是最新可建置版本；Release 標籤是已發佈版本。
4. 發版時統一調整 `package.json` 版本及 `CHANGELOG.md`，推送同名 `vX.Y.Z` 標籤。GitHub Actions 會測試兩個瀏覽器，全部成功後同時發布兩份套件。

完整分支、版本及發佈步驟見 [CONTRIBUTING.md](CONTRIBUTING.md)。歷史壓縮包與本機測試設定檔不納入此倉庫；從 `0.10.1` 起，以 Git 提交、標籤和 Releases 管理版本。

## 來源及授權

源自本機 QG-inat-enhancement／Leafwise 系列，沿用既有功能與 Firefox 擴充 ID。現有來源未附可確認的開源授權，所以沒有擅自套用 MIT 等授權；公开可見不等於取得任意再散布授權。見 [NOTICE.md](NOTICE.md)。
