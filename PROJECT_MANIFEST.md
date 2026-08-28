# GitHub 專案包清單

## 包含內容

- React／TypeScript 網站入口與設定檔。
- `public/game/` 完整網頁遊戲、PWA、圖片與離線資產。
- 深色 2.5D 基因實驗室背景、糖果色立體 UI 與完整美術生成規格。
- `scripts/` 可重建鴨鴨圖集的素材腳本。
- `tests/` 遊戲規則、響應式介面與離線契約測試。
- `docs/` 配色規格、研究說明與開發報告。
- `.codex/skills/duck-gene-lab-development/` 專案維護 Skill。
- `README.md`、`LICENSE.md`、`package.json` 與 `package-lock.json`。

## 排除內容

- `.git` 與既有遠端倉庫紀錄。
- `node_modules`、`dist`、`.next` 等可重建輸出。
- `.sites-runtime`、`.wrangler`、快取與記錄檔。
- `.env`、私密金鑰、登入資料與本機設定。
- `.openai/hosting.json` 與原網站專案識別資料。
- `android/`、`release/`、APK 與已停止維護的 Android 封裝測試。
- 已停用或未被最新版引用的舊背景素材。

## 完整性檢查

解壓縮後執行：

```bash
npm ci
npm run lint
npm run test
```

所有命令通過後，即可建立新的 GitHub 個人倉庫並上傳。
