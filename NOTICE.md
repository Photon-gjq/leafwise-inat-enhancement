# 來源與授權狀態

原始 QG-inat-enhancement 插件由 **Wang.QG** 開發；Leafwise 在其基礎上持續改進，並延續 Leafwise 0.9.8、0.10.0 Chrome／Firefox 版本。本倉庫從 0.10.1 開始整理統一的建置與版本管理；不是從其他 Git 倉庫匯入完整歷史，也不將後續 Git 提交冒充原作者的舊版提交。

專案維護者已取得 Wang.QG 對上傳、修改及散布此插件的同意。現有來源仍未附一份允許公眾自由再散布的開源 LICENSE，因此本倉庫尚未宣告開源授權。`package.json` 的 `UNLICENSED` 表示未提供套件授權，`private: true` 用於避免誤發布到 npm，與 GitHub 倉庫的公開狀態無關。原有權利及署名均予保留。

iNaturalist 是獨立第三方服務，本插件不由 iNaturalist 官方提供或認可。執行時沿用網站現有 API、jQuery 與 React 元件，擴充包沒有內嵌官方 React／jQuery 原始碼或測試照片。

開發用壓縮函式庫 fflate 使用 MIT 授權，安裝時保留其自身授權檔；不會被打包進擴充的執行程式。GitHub 官方 Actions 的授權由各自倉庫提供。
