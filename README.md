# Leafwise · iNaturalist Enhancement

[![Build, test and release](https://github.com/Photon-gjq/leafwise-inat-enhancement/actions/workflows/build.yml/badge.svg)](https://github.com/Photon-gjq/leafwise-inat-enhancement/actions/workflows/build.yml)

[English README](README.en.md) · [English guide](docs/GUIDE.en.md)

[專案首頁](https://photon-gjq.github.io/leafwise-inat-enhancement/) · [隱私政策](https://photon-gjq.github.io/leafwise-inat-enhancement/privacy.html)

iNaturalist 網頁增強插件。**一份核心原始碼，同時建置 Chrome、Edge 和 Firefox 三個版本。**

提供類群對比、季節目標清單、查詢與地點組合收藏、個人紀錄小卡，以及上傳頁的批次 AI 建議助手。不是 iNaturalist 官方產品。

1.1.4 修正「一鍵開啟這些觀察」漏掉 @ 提及通知的問題，支援解析評論與鑑定的原生連結並按觀察去重。無法確認目的觀察時保留原連結，不靜默略過；此時只能按相同連結去重。

保留 1.1.3 在右上「新動態」下拉清單加入的、預設關閉且可記住的「僅顯示非完全贊同的鑑定」開關：只隱藏與消息之前自己的鑑定完全相同、且沒有文字說明的確認；上下級變化、其他類群、評論及不確定消息保留。一鍵開啟跟隨篩選後清單。新控制項支援全部 50 個既有語言／地區版本。

保留 1.1.2 的原始 AI 分數顯示及 1.1.1 的搜尋條件同步修正；已保存設定及手動對比草稿維持不變。

1.1.0 新增跟隨 iNaturalist 網頁語言的 50 個語言／地區界面、按所選地區統計的個人分類紀錄，以及設定頁的常用地區組合。主要控制項已有翻譯；長篇說明與部分少見錯誤先以英文後備，尚未全面母語校對。變更網站語言後重新載入頁面即可；設定頁使用最近一次網站語言。[語言範圍與維護說明](docs/I18N.md)

## 下載與安裝

到 [Releases](https://github.com/Photon-gjq/leafwise-inat-enhancement/releases/latest) 下載所需瀏覽器版本，三者使用相同版本號。Firefox 正式版也可從 [Mozilla Add-ons](https://addons.mozilla.org/zh-TW/firefox/addon/leafwise-inat-enhancement/) 安裝並由 Firefox 自動更新。

正式商店版：[Chrome Web Store](https://chromewebstore.google.com/detail/pgdlmdoolphapnmpfeppffpendhoiono) · [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/minfbphcdmnoanekokhnneafkjccpffp) · [Firefox AMO](https://addons.mozilla.org/firefox/addon/leafwise-inat-enhancement/)。商店版在各自審核通過後更新，時間可能不同；以下開發安裝包不會自動升級。

| 瀏覽器 | 安裝包 | 安裝方法 |
| --- | --- | --- |
| Chrome 114+ | `Leafwise-x.y.z-chrome.zip` | 解壓；`chrome://extensions` → 開發人員模式 → 載入其中的 `extension` 資料夾。 |
| Edge（桌面現行版） | `Leafwise-x.y.z-edge.zip` | 解壓；`edge://extensions` → 開發人員模式 → 載入其中的 `extension` 資料夾。 |
| Firefox 140+ | `Leafwise-x.y.z-firefox-unsigned.xpi` | `about:debugging#/runtime/this-firefox` → 載入暫時附加元件 → 選 XPI。 |

Firefox 目前是未簽章測試包，重新啟動後需再次暫時載入；正式永久安裝需要 Mozilla 簽章。Chrome／Edge 請保留已載入的資料夾。GitHub 發佈會同時更新三份瀏覽器下載包，**不等於瀏覽器內已安裝的本機版本會自動升級**。完整步驟見 [安裝及升級](docs/INSTALL.md)。

## 功能

- **類群對比**：生涯未見、已見但該年未見、已見但此地未見、該年首次記錄；可從界彙總到種，顯示當地後代觀察數與可核驗的 Leaf taxa。全部生物 ID 為 `48460`，鳥類為 `3`。
- **季節目標**：歷年月份、日期與項目條件只限制當地候選清單；一鍵設定本月，按記錄數排序。
- **地點組合及查詢收藏**：觀察搜尋頁外層可直接選取已保存的地點組合，不用展開類群對比；選取後立即更新搜尋，保留使用者、類群和日期等條件。`any` 表示全球。也可保存完整搜尋網址與面板條件。[查看可選分區範例](docs/REGIONS.md)
- **個人紀錄小卡與分類頁統計**：在分類頁以 `(觀察數|最低分類單元數|種級數)` 顯示個人紀錄，跟隨右上角所選地區；未選地區使用全球。點擊數字可查看同一範圍的首次、最近與全部觀察。觀察詳情頁仍保留全球個人觀察次數。
- **常用地區設定**：設定頁每行填 `ID,ID = 名稱`，可自訂、刪除及排序，每組最多 20 個地區。外層快捷選單與類群對比共用清單。原有中國及各分區組合移至「可選地區範例」，手動加入並保存後才出現在選單，不預填或自動套用；既有自訂組合保留。
- **通知篩選與批次開啟**：右上「新動態」清單可選擇隱藏完全相同且無說明的確認鑑定，並一鍵在背景分頁打開可見消息的觀察；同一觀察的多則通知只開一頁。只處理網站目前載入的清單，不改已讀狀態、不讀私訊；無法可靠判斷的消息保留。
- **複製及 CSV**：匯出所有符合目前名稱篩選的對比結果，保留排序、核驗後 Leaf taxa 與範圍資訊。
- **AI 建議增強**：上傳頁及每個具體觀察詳情頁的原生 AI 建議選單，以無框彩色數字顯示 `綜合分數(視覺分數)`，例如 `86.0(75.2)`；上傳助手預設收合在「全選」旁，支援預覽、批次套用、自動處理、停止與明細。

AI 預設要求第一項綜合分數嚴格大於 80；未達門檻或數字不可讀時，只有官方「非常確定它屬於這個……」提示出現，才填入該提示中的上階類群。也可選擇只填官方確定類群。第一個數字是網站原生 `combined_score` 的 0–100 顯示值，結合照片、地點與日期並作為批次門檻；括號內是同一候選的純視覺 `vision_score`，只供參考。候選順序仍完全沿用 iNaturalist，插件不按任一數字重新排序。插件只被動讀取網站原有的同一次辨識回應，不另發辨識請求。兩個數字都**不是實際正確率，也不應跨觀察比較**。插件只填草稿，最後由使用者檢查並上傳。詳見 [使用說明](docs/USAGE.md) 與 [資料及權限](docs/PRIVACY.md)。

## 專案結構

```text
src/                 共用功能、介面、語系與基本 manifest
platforms/           Chrome（Edge 共用）/ Firefox manifest 差異及小型頁面資料適配器
scripts/             同步建置、測試、打包及發佈說明產生器
tests/               同一套測試，分別對三個建置結果執行
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

`check` 會先建置，再對三個瀏覽器產物執行語法和功能測試。`test:layout` 在獨立 Chromium／Firefox 中驗證上傳頁及對比功能；設定 `LEAFWISE_EDGE_TESTS=1` 時也會用本機 Microsoft Edge 測試 Edge 產物，Windows CI 已啟用。Linux 安裝瀏覽器時可用 `--with-deps` 一併安裝系統依賴。`package` 會同步產出三個瀏覽器安裝 ZIP、Chrome／Edge 商店專用 ZIP、未簽章 XPI 及校驗碼；壓縮檔會自動解壓比對每個檔案，確認未遺漏或改變內容。執行期間不登入 iNaturalist，也不發布觀察。商店首次上架及後續自動更新的設定見 [商店上架指南](docs/STORE_PUBLISHING.md)。

## 之後如何更新

1. 在 [Issues](https://github.com/Photon-gjq/leafwise-inat-enhancement/issues) 記錄需求或錯誤，註明瀏覽器、版本及重現步驟。
2. 每個修改使用一個分支；功能在 `src/` 修改，瀏覽器差異在 `platforms/` 修改。不要直接修改 `build/` 或 `dist/`。
3. 開 PR，通過 Chrome＋Edge＋Firefox 測試，再合併到 `main`。`main` 是最新可建置版本；Release 標籤是已發佈版本。
4. 發版時統一調整 `package.json` 版本及 `CHANGELOG.md`，推送同名 `vX.Y.Z` 標籤。GitHub Actions 會測試三個瀏覽器產物，全部成功後同時發布三個瀏覽器套件。

完整分支、版本及發佈步驟見 [CONTRIBUTING.md](CONTRIBUTING.md)。歷史壓縮包與本機測試設定檔不納入此倉庫；從 `0.10.1` 起，以 Git 提交、標籤和 Releases 管理版本。

## 來源及授權

原始 QG-inat-enhancement 插件由 **Wang.QG** 開發；Leafwise 在其基礎上持續改進，並沿用既有功能與 Firefox 擴充 ID。專案已取得原作者同意上傳與繼續開發，但沒有擅自套用 MIT 等開源授權；公開可見不等於取得任意再散布授權。見 [NOTICE.md](NOTICE.md)。
