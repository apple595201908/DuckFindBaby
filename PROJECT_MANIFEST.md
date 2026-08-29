# GitHub 專案包清單

## 包含內容

- React／TypeScript 網站入口與設定檔。
- `public/game/` 完整網頁遊戲、PWA、圖片與離線資產。
- `public/game/analytics.js` 匿名工作階段、裝置、活躍時間、遊玩與離線事件收集。
- `server/` Node.js HTTP API、密碼登入、SQLite schema、事件投影與 KPI 查詢。
- `public/admin/` 手機／桌機響應式管理儀表板與 CSV 匯出介面。
- 深色 2.5D 基因實驗室背景、糖果色立體 UI 與完整美術生成規格。
- `scripts/` 可重建鴨鴨圖集的素材腳本及 Cloudflare Quick Tunnel 啟動器。
- `tests/` 遊戲規則、響應式介面、離線契約與真實 HTTP＋SQLite 後台整合測試。
- `docs/` 配色規格、研究說明、操作手冊、遊戲開發報告與後台技術報告。
- `.codex/skills/duck-gene-lab-development/` 專案維護 Skill。
- `.codex/skills/duck-analytics-backend/` 分析後台維護 Skill 與事件／schema 參考。
- `start-duck-server.bat`、`start-public-duck-server.bat` Windows 一鍵啟動器。
- `analytics.env.example` 可安全提交的分析環境變數範例。
- `README.md`、`LICENSE.md`、`package.json` 與 `package-lock.json`。

## 排除內容

- `.git` 與既有遠端倉庫紀錄。
- `node_modules`、`dist`、`.next` 等可重建輸出。
- `.sites-runtime`、`.wrangler`、快取與記錄檔。
- `.env`、私密金鑰、登入資料與本機設定。
- `.env.analytics`、`data/`、SQLite／WAL／SHM 資料檔。
- `.duck-public-url.txt`、Tunnel PID、網址、記錄檔及 Cloudflare 憑證。
- `.openai/hosting.json` 與原網站專案識別資料。
- `android/`、`release/`、APK 與已停止維護的 Android 封裝測試。
- 已停用或未被最新版引用的舊背景素材。

## 完整性檢查

解壓縮後執行：

```bash
npm ci
npm run lint
npm run test
npm run test:analytics
```

所有命令通過後，確認敏感檔與數據庫仍被 Git 忽略，即可上傳 GitHub。
