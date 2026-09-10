# Leafwise 維護約定

- 此倉庫是 Chrome、Edge 與 Firefox 的共同來源。除非使用者明確只要求單一瀏覽器，功能更新必須同時建置、驗證及打包三個版本。
- 修改 `src/` 的共用功能；僅瀏覽器差異放在 `platforms/`。不要維護第二份完整程式，也不要直接編輯生成的 `build/`、`dist/`。
- 版本只改 `package.json`，同步 `package-lock.json` 與 `CHANGELOG.md`。維持既有 Firefox gecko ID；不因重構更換儲存鍵。
- 執行 `npm run check` 和 `npm run package`。有介面或上傳流程變更時再執行 `npm run test:layout`，並依 `docs/TESTING.md` 做對應驗收，明確說明未驗證範圍。
- AI 分數不是校準後正確率。預設保留手動分類與文字，停止後不能套用遲到結果；插件只填草稿，不能新增自動發布觀察的行為。
- 不將登入憑證、瀏覽器 profile、私人照片、API 回應或本機絕對路徑提交至倉庫。不修改其他本機歷史成品。
- 發版以同一個 `vX.Y.Z` 標籤產出三個瀏覽器套件。詳細流程及來源授權狀態見 `CONTRIBUTING.md` 與 `NOTICE.md`。
