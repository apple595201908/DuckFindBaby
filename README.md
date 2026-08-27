# 鴨鴨基因實驗室

《鴨鴨基因實驗室》是一款手機優先的快速顏色判讀網頁遊戲。玩家觀察兩隻親代鴨的顏色，在候選鴨從實驗艙底部跳起並落回以前，選出符合基因配色規則的寶寶。答得越快分數越高，答錯或超時則結束本次實驗。

[立即遊玩公開網頁版](https://duckling-family-match.yoyo50582.chatgpt.site)

## 主要特色

- 14 個鎖定色號與 12 組配色配方。
- 相似色兩兩互斥，避免近似粉紅、藍或紫色同時成為選項。
- 候選鴨的跳起與下降就是回合時鐘，不另外顯示秒數進度條。
- 下降位置分成十個計分區段，單題最高 10 分、最低 1 分。
- 分數增加時平滑加速，回合由 3.8 秒逐步縮短至最低 1.6 秒。
- 支援手機與平板直向／橫向、安全區、觸控、鍵盤和全螢幕。
- 內建 Web Audio BGM、答題音效、震動回饋及 PWA 離線快取。
- 背景不含愛心，只保留低對比淡色漸層與緩慢漂移的大型 DNA 雙螺旋。

## 技術架構

- React 19、TypeScript、Vinext／Vite：網站入口與建置。
- HTML5、CSS、Vanilla JavaScript：獨立遊戲執行環境。
- Service Worker、Web App Manifest：離線快取與 PWA。
- Node.js Test Runner、ESLint：規則與品質驗證。

核心規則與瀏覽器操作分離：

- `public/game/engine.js`：色票、配方、候選公平性、速度和計分。
- `public/game/game.js`：狀態機、DOM、輸入、音訊、暫停和回合流程。
- `public/game/game.css`：響應式排版、鴨子素材、跳躍和答題回饋。
- `public/game/sw.js`：離線資產和快取更新策略。

核心程式已補上維護註解，重點說明跨檔案時間契約、狀態轉移、候選公平性、輸入鎖定、音訊排程、動畫效能及快取失效原因。

## 快速開始

需要 Node.js 20 以上版本。

```bash
npm ci
npm run dev
```

依終端機顯示的本機網址開啟遊戲。

## 品質檢查

```bash
npm run lint
npm run test
git diff --check
```

重新產生鎖色鴨鴨圖集：

```bash
bash scripts/generate_gene_palette_sprites.sh
```

## GitHub 上傳方式

解壓縮專案後，在專案根目錄執行：

```bash
git init
git add .
git commit -m "Initial release: Duck Gene Lab Ver1.0"
git branch -M main
git remote add origin https://github.com/你的帳號/你的倉庫名稱.git
git push -u origin main
```

請先在 GitHub 建立空白倉庫，並把範例中的帳號與倉庫名稱換成自己的內容。專案包不包含 `.git`、登入資料、環境密鑰、`node_modules`、建置輸出、APK 或停止維護的 Android 封裝。

## 靜態網頁部署

完整遊戲位於 `public/game/`，可直接部署到支援靜態檔案的服務。若使用完整 React 專案，請依目前 Vinext 設定進行建置。

修改已發布的 JavaScript、CSS 或圖片後，必須同步更新：

1. `public/game/index.html` 與 `app/page.tsx` 的查詢版本。
2. `public/game/sw.js` 的資產網址。
3. `public/game/sw.js` 的 `CACHE_NAME`。

這能避免行動瀏覽器繼續使用舊程式或舊素材。

## 文件與開發 Skill

- [`docs/DEVELOPMENT_REPORT.md`](docs/DEVELOPMENT_REPORT.md)：完整開發報告、架構、公式、問題修正與交付規格。
- [`docs/GENE_COLOR_SPEC.md`](docs/GENE_COLOR_SPEC.md)：14 色色號、12 組配方及素材生成規格。
- [`docs/RESEARCH_AND_RULES.md`](docs/RESEARCH_AND_RULES.md)：玩法研究與版權界線。
- [`.codex/skills/duck-gene-lab-development/SKILL.md`](.codex/skills/duck-gene-lab-development/SKILL.md)：供 Codex 維護本遊戲時使用的開發 Skill。
- [`PROJECT_MANIFEST.md`](PROJECT_MANIFEST.md)：GitHub 專案包的包含與排除清單。

使用開發 Skill 時，可在 Codex 中指定：

```text
Use $duck-gene-lab-development to maintain the Duck Gene Lab web game.
```

## 操作

- 觸控／滑鼠：直接點選候選鴨。
- 鍵盤：數字鍵 `1`–`6`。
- `Esc`：暫停或繼續。
- 色彩輔助：顯示符號與顏色名稱。

## 素材與授權

鴨鴨造型、基因實驗室場景、介面、音效與程式均為本專案製作。參考圖片只用於理解抽象配色規則與遊戲節奏，沒有收錄原作圖像、角色、標誌、文字、音樂或程式素材。

本專案原創內容採保留所有權利方式提供，詳見 [`LICENSE.md`](LICENSE.md)。第三方套件仍依各自的授權條款使用。正式商用前應另外完成名稱／商標、隱私權、無障礙、多機型與營運地區規範檢查。
