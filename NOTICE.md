# 來源與授權狀態

Leafwise 延續 QG-inat-enhancement 的本機版本，以及 Leafwise 0.9.8、0.10.0 Chrome／Firefox 版本。本倉庫從 0.10.1 開始整理統一的建置與版本管理；不是從其他 Git 倉庫匯入完整歷史，沒有虛構原始作者或舊版提交。

目前整理的來源檔未附可確認的 LICENSE 或原作者授權條款，因此本倉庫尚未宣告開源授權。`package.json` 的 `UNLICENSED` 表示未提供套件授權，`private: true` 用於避免誤發布到 npm，與 GitHub 倉庫的公開狀態無關。原有權利及來源仍保留；取得原作者資訊或授權後，再以獨立提交補齊。

iNaturalist 是獨立第三方服務，本插件不由 iNaturalist 官方提供或認可。執行時沿用網站現有 API、jQuery 與 React 元件，擴充包沒有內嵌官方 React／jQuery 原始碼或測試照片。

開發用壓縮函式庫 fflate 使用 MIT 授權，安裝時保留其自身授權檔；不會被打包進擴充的執行程式。GitHub 官方 Actions 的授權由各自倉庫提供。
