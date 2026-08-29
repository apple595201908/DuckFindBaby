# 鴨鴨基因實驗室 Duck Gene Lab

一款手機優先的顏色基因判讀網頁遊戲，以及可自行架設在個人電腦的匿名遊玩數據後台。

玩家要在候選鴨跳起並落回以前，依兩隻親代鴨的顏色選出符合配色規則的寶寶；答得越快分數越高，答錯或超時就結束。本倉庫同時提供 Node.js＋SQLite 分析伺服器、密碼保護的響應式管理後台、CSV 匯出，以及讓外部手機連線的 HTTPS Tunnel 啟動工具。

[立即遊玩公開網頁版](https://duckling-family-match.yoyo50582.chatgpt.site) · [遊戲開發報告](docs/DEVELOPMENT_REPORT.md) · [後台技術報告](docs/ANALYTICS_DEVELOPMENT_REPORT.md) · [後台操作手冊](docs/ANALYTICS_SERVER.md)

> 公開網頁版是遊戲展示。若要查看你自己電腦收集的後台資料，請啟動本倉庫的個人伺服器，再開啟該服務的 `/admin/`；後台不是公開展示網站的一部分。

## 目錄

- [專案功能](#專案功能)
- [數據後台可以回答什麼](#數據後台可以回答什麼)
- [系統架構](#系統架構)
- [環境需求](#環境需求)
- [最快啟動方式](#最快啟動方式)
- [從外面的手機查看後台](#從外面的手機查看後台)
- [後台登入與設定](#後台登入與設定)
- [事件與指標定義](#事件與指標定義)
- [專案結構](#專案結構)
- [開發與測試](#開發與測試)
- [資料、隱私與安全](#資料隱私與安全)
- [備份、還原與長期部署](#備份還原與長期部署)
- [技術文件與 Codex Skills](#技術文件與-codex-skills)

## 專案功能

### 遊戲

- 14 個高辨識鎖定色號與 12 組固定基因配方。
- 正確答案唯一，且排除容易混淆的相似色組合。
- 候選鴨跳躍本身就是回合倒數，不另放進度條干擾視線。
- 單題依下降位置給 10 至 1 分，累積分數後由 3.8 秒平滑加速至最低 1.6 秒。
- 支援手機、平板、桌機、直／橫向、安全區、觸控、鍵盤與全螢幕。
- Web Audio 背景音樂、答題音效、震動回饋及靜音設定。
- PWA manifest、Service Worker 與完整離線資產。
- 深色 2.5D 基因實驗室、糖果色立體 UI、慢速 DNA 動畫及鎖色鴨鴨素材。

### 個人分析後台

- 匿名玩家、工作階段、遊玩局數與正常結束局數。
- 平均分、最高分、平均通過題數、分數區間與結束原因。
- 頁面停留時間與真正前景活躍時間。
- 手機／平板／桌機、作業系統、瀏覽器、語言、時區和畫面尺寸。
- 回訪玩家率、造訪頻率分層、每個工作階段的重玩率與流量來源。
- 7／30／90 日或全部期間、每日趨勢、最近 50 個工作階段。
- UTF-8 CSV 明細匯出，可在 Excel 或試算表繼續分析。
- 手機版、桌面版皆可使用的密碼登入儀表板。
- 資料保存於自己的 SQLite，不依賴 Google Analytics 或其他第三方分析帳號。

## 數據後台可以回答什麼

| 想知道的問題 | 後台資料／指標 |
| --- | --- |
| 有多少人點進遊戲？ | 匿名玩家數、工作階段數、每日趨勢 |
| 他們用什麼玩？ | 裝置類型、OS、瀏覽器、螢幕和語言 |
| 在線多久、真的看了多久？ | 頁面停留 `pageMs`、前景活躍 `activeMs` |
| 每人玩幾局？ | 遊玩局數、play number、每工作階段重玩率 |
| 有沒有再次回來？ | visit number、回訪玩家率、頻率分層 |
| 玩得如何？ | 分數、題數、combo、答題速度、結束原因 |
| 從哪裡來？ | referrer 來源網站 |

匿名玩家是以瀏覽器 localStorage 中的隨機 ID 計算，不等於真實自然人。換裝置、換瀏覽器、無痕模式或清除網站資料都會被視為新玩家。

## 系統架構

```mermaid
flowchart TB
    U[玩家瀏覽器] -->|GET /game/| N[Node.js 22 HTTP Server]
    U -->|匿名事件批次| API[/api/analytics/events]
    API --> DB[(SQLite WAL)]
    M[管理者手機／電腦] -->|GET /admin/| N
    M -->|密碼 + HMAC Cookie| ADMIN[/api/admin/*]
    ADMIN --> DB
    CF[Cloudflare Tunnel HTTPS] <--> N
```

技術棧：

- 遊戲：HTML5、CSS、Vanilla JavaScript、Web Audio、Service Worker、PWA。
- 網站入口：React 19、TypeScript、Vinext／Vite。
- 分析伺服器：Node.js 22 內建 `node:http`。
- 資料庫：Node.js 內建 `node:sqlite`、SQLite WAL。
- 管理後台：原生 HTML／CSS／JavaScript，mobile-first。
- 登入：HMAC-SHA256 簽章、12 小時 HttpOnly Cookie。
- 外部連線：Cloudflare Quick Tunnel；固定網址可換 Named Tunnel。
- 品質：Node.js Test Runner、ESLint、真實 HTTP＋SQLite 整合測試。

## 環境需求

- Node.js `22.13.0` 以上（必須包含穩定的 `node:sqlite`）。
- npm。
- Windows 10／11、macOS 或 Linux。
- 若要由外面的手機連線：電腦需持續開機並可連上網際網路。

確認版本：

```powershell
node --version
npm --version
```

首次取得專案後安裝依賴：

```powershell
git clone https://github.com/apple595201908/DuckFindBaby.git
cd DuckFindBaby
npm ci
```

## 最快啟動方式

### Windows 一鍵啟動個人伺服器

雙擊：

```text
start-duck-server.bat
```

或在 PowerShell 執行：

```powershell
npm run analytics:start
```

第一次啟動會：

1. 建立不會上傳 Git 的 `.env.analytics`。
2. 安全隨機產生管理員密碼與 Cookie session secret。
3. 在終端機顯示第一次登入密碼。
4. 建立 `data/duck-analytics.sqlite`。
5. 同時供應遊戲、後台與 API。

開啟：

- 遊戲：`http://localhost:8788/game/`
- 後台：`http://localhost:8788/admin/`
- 健康檢查：`http://localhost:8788/healthz`

同一個家中 Wi-Fi 的手機可開啟：

```text
http://你的電腦區網IP:8788/admin/
```

Windows 防火牆第一次詢問時，個人環境通常只需允許「私人網路」。

### 只開發遊戲／網站入口

```powershell
npm run dev
```

依終端機顯示的本機網址開啟開發預覽。這個模式不是分析後台；後台請使用 `npm run analytics:start`。

## 從外面的手機查看後台

Windows 雙擊：

```text
start-public-duck-server.bat
```

或執行：

```powershell
npm run public:start
```

腳本會啟動個人伺服器與 Cloudflare Quick Tunnel，終端機會顯示類似：

```text
https://隨機名稱.trycloudflare.com/game/
https://隨機名稱.trycloudflare.com/admin/
```

把 `/admin/` 的 HTTPS 網址存到手機即可從外面查看後台，登入密碼仍取自你電腦上的 `.env.analytics`。實際臨時網址會另寫入被 Git 忽略的 `.duck-public-url.txt`，不會提交到公開倉庫。

注意事項：

- 電腦、Node.js 伺服器與 Tunnel 進程必須保持運行；睡眠、關機或斷網後無法連線。
- Quick Tunnel 網址每次啟動可能改變，且沒有正式 SLA，適合個人或小量測試。
- 知道網址的人可以開啟遊戲與登入頁，但沒有密碼不能讀取後台 API。
- 不要直接將路由器 8788 port 裸露至公網。
- 需要固定網址時，請使用自有網域＋Cloudflare Named Tunnel，並建議再加 Cloudflare Access。

## 後台登入與設定

### 查找或修改密碼

後台密碼位於專案根目錄的本機檔案：

```text
.env.analytics
```

修改 `DUCK_ADMIN_PASSWORD` 後重新啟動服務。密碼至少 10 個字元，建議使用 16 字元以上、不可重用的隨機密碼。不要把真實密碼寫入 README、Issue、聊天截圖或 Git commit。

可從範例建立設定：

```powershell
Copy-Item analytics.env.example .env.analytics
```

### 環境變數

| 變數 | 預設值 | 說明 |
| --- | --- | --- |
| `DUCK_SERVER_HOST` | `0.0.0.0` | 接受本機與區網連線 |
| `DUCK_SERVER_PORT` | `8788` | HTTP 連接埠 |
| `DUCK_ADMIN_PASSWORD` | 首次啟動隨機產生 | 後台密碼，至少 10 字元 |
| `DUCK_SESSION_SECRET` | 首次啟動隨機產生 | Cookie HMAC secret，至少 32 字元 |
| `DUCK_ANALYTICS_DB` | `./data/duck-analytics.sqlite` | SQLite 資料庫路徑 |
| `DUCK_REPORT_TIMEZONE` | `Asia/Taipei` | 每日趨勢使用的時區 |
| `DUCK_RETENTION_DAYS` | `730` | 自動保留天數；`0` 或負數表示不清理 |
| `DUCK_ALLOWED_ORIGINS` | 空白 | 額外遊戲來源，多個以逗號分隔 |
| `DUCK_TRUST_PROXY` | `false` | 只有位於可信任反向代理後才設 `true` |

### 遊戲與後台分開網域

預設同一服務的 `/game/` 直接送到同源 API，不需額外設定。若遊戲部署在其他靜態網站，可在遊戲 HTML 的 `<head>` 指定：

```html
<meta
  name="duck-analytics-endpoint"
  content="https://你的後台網域/api/analytics/events"
/>
```

同時在 `.env.analytics` 設定：

```dotenv
DUCK_ALLOWED_ORIGINS=https://你的遊戲網域
```

重新啟動服務後生效。不要使用 `*` 放寬所有來源。

## 事件與指標定義

### 匿名事件

| Event | 觸發時機 | 用途 |
| --- | --- | --- |
| `session_start` | 頁面分析工作階段開始 | 裝置、畫面、語言、來源、造訪次數 |
| `heartbeat` | 可見頁面每 15 秒 | 活躍與停留時間 |
| `session_end` | pagehide／離開頁面 | 最後時間與工作階段結束 |
| `game_start` | 開始一局 | 遊玩次數、設定 |
| `round_answer` | 每次作答 | 正誤、反應時間、分數、題目顏色 |
| `game_end` | 結束一局 | 分數、題數、combo、時長、原因 |
| `settings_change` | 支援的設定被修改 | 設定使用情形 |

瀏覽器最多暫存 250 個離線事件，每批最多上送 50 個。網路恢復後會重送；SQLite 使用 event ID 主鍵去重，因此重複傳送不會增加數字。加入 `?analytics=off` 可停用該次載入的分析。

### 核心 KPI

- 匿名玩家：選擇期間內開始工作階段的不同 visitor ID。
- 回訪率：生命週期工作階段大於 1 的活躍 visitor ÷ 活躍 visitor。
- 重玩率：遊玩超過一局的 session ÷ 至少玩一局的 session。
- 平均活躍：所有範圍內 session 的最大已知 `activeMs` 平均。
- 正常結束局：`completed = 1` 的 gameplay。
- 報表時間：資料庫保存 UTC，趨勢依 `DUCK_REPORT_TIMEZONE` 分日。

精確公式、資料表與 API 契約見[後台技術報告](docs/ANALYTICS_DEVELOPMENT_REPORT.md)及 [Schema／Events Reference](.codex/skills/duck-analytics-backend/references/schema-and-events.md)。

## 專案結構

```text
DuckFindBaby/
├─ app/                              # React／TypeScript 網站入口
├─ public/
│  ├─ admin/
│  │  ├─ index.html                  # 後台登入與儀表板骨架
│  │  ├─ admin.css                   # 手機／桌機響應式樣式
│  │  └─ admin.js                    # 登入、KPI、圖表、CSV 操作
│  └─ game/
│     ├─ index.html                  # 遊戲入口
│     ├─ engine.js                   # 配色、題目、速度、計分規則
│     ├─ game.js                     # 遊戲狀態、輸入、音訊、追蹤串接
│     ├─ analytics.js                # 匿名事件、裝置、時間、離線佇列
│     ├─ game.css                    # 響應式遊戲與動畫
│     └─ sw.js                       # PWA 離線快取
├─ server/
│  ├─ index.mjs                      # 設定、啟動、安全關閉
│  ├─ app.mjs                        # HTTP、API、登入、CORS、CSV
│  └─ analytics-store.mjs            # SQLite schema、交易與報表查詢
├─ scripts/
│  └─ start-public-server.mjs        # 本機服務＋Quick Tunnel
├─ tests/
│  └─ analytics-server.test.mjs      # 真實 HTTP＋SQLite 整合測試
├─ docs/
│  ├─ ANALYTICS_SERVER.md            # 安裝、公開、備份操作手冊
│  ├─ ANALYTICS_DEVELOPMENT_REPORT.md# 本次後台技術報告
│  └─ DEVELOPMENT_REPORT.md          # 遊戲開發報告
├─ .codex/skills/
│  ├─ duck-gene-lab-development/     # 遊戲維護 Skill
│  └─ duck-analytics-backend/        # 後台維護 Skill
├─ analytics.env.example             # 可安全提交的環境變數範例
├─ start-duck-server.bat              # Windows 本機／區網啟動
└─ start-public-duck-server.bat       # Windows 公網 HTTPS 啟動
```

## 開發與測試

### npm scripts

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動網站開發預覽 |
| `npm run build` | 正式建置 |
| `npm run lint` | ESLint 靜態檢查 |
| `npm test` | 正式建置＋全部自動測試 |
| `npm run test:analytics` | 只跑後台 HTTP／SQLite 整合測試 |
| `npm run analytics:start` | 啟動遊戲＋分析 API＋後台 |
| `npm run public:start` | 啟動伺服器＋外網 Quick Tunnel |

完整驗證：

```powershell
npm ci
npm run lint
npm test
npm run test:analytics
git diff --check
```

目前測試套件共 15 項，涵蓋：

- 12 組基因配方、14 個鎖定色、相似色互斥與長時間題目公平性。
- 依分數加速、鴨子下降計分區段、手機跳躍時鐘與離線資產。
- React UI 元件與渲染 HTML。
- 事件接收、重複去除、未登入阻擋、密碼登入、KPI、CSV 與靜態路由。

重新產生鎖色鴨鴨圖集：

```bash
bash scripts/generate_gene_palette_sprites.sh
```

修改 `analytics.js`、`game.js` 或其他被 PWA 快取的資產後，必須同步更新 `public/game/sw.js` 的 cache name 與 `public/game/index.html` 的版本 query，確保既有玩家拿到新版。

## 資料、隱私與安全

### 收集內容

系統收集隨機匿名 ID、工作階段與遊玩事件、分數／題數／反應時間、裝置分類、user agent、螢幕、語言、時區、來源網址及活躍時間。

### 不收集內容

預設不收集姓名、Email、電話、登入帳號、廣告 ID、精準 GPS 或原始 IP，也不將資料送到第三方分析服務。

### 安全控制

- 後台資料 API 全部需要有效的 HMAC 簽章 Cookie。
- Cookie 為 HttpOnly、SameSite=Strict、12 小時有效；HTTPS 時加入 Secure。
- 密碼與簽章採 timing-safe 比對。
- JSON 最大 128 KiB，每批 1–50 件，只接受事件白名單及合法 ID。
- 收集／登入具每來源每分鐘速率限制。
- SQLite 使用 prepared statements、foreign keys、交易及事件 ID 去重。
- 靜態路徑限制在 `public/`，回應含 CSP、nosniff 與 referrer policy。
- `.env.analytics`、`data/`、SQLite、log、PID、Tunnel URL、`node_modules/` 和建置輸出全部被 Git 忽略。

公開營運前，請依所在地規範加入隱私說明，告知資料用途、保存期限與 `?analytics=off` 停用方式。更完整的威脅與限制分析見[後台技術報告](docs/ANALYTICS_DEVELOPMENT_REPORT.md)。

## 備份、還原與長期部署

### 備份

最安全方式是先停止伺服器，再備份整個 `data/`：

```text
data/
├─ duck-analytics.sqlite
├─ duck-analytics.sqlite-wal   # 運行中可能存在
└─ duck-analytics.sqlite-shm   # 運行中可能存在
```

若必須在服務運行時複製，三個 SQLite／WAL／SHM 檔案要一起保存。不要只備份主 `.sqlite` 後假設最新交易都已包含。

### 還原

1. 停止 Node.js 服務。
2. 備份目前 `data/` 以便回退。
3. 將備份檔放回 `DUCK_ANALYTICS_DB` 指定的位置。
4. 重新啟動並檢查 `/healthz`、後台登入及最近資料。

### 固定公網網址

Quick Tunnel 適合臨時使用。長期部署建議：

1. 準備由 Cloudflare 管理 DNS 的自有網域。
2. 建立 Named Tunnel，將固定 hostname 指向 `http://localhost:8788`。
3. 確認 HTTPS 與 forwarded protocol 設定。
4. 視需要加 Cloudflare Access、IP／地區政策或另一層驗證。
5. 設定作業系統開機啟動、程序監控與定期備份。
6. 不要把 Tunnel token、密碼或 secret 提交到 GitHub。

## 技術文件與 Codex Skills

| 文件／Skill | 用途 |
| --- | --- |
| [後台技術報告](docs/ANALYTICS_DEVELOPMENT_REPORT.md) | 架構、資料流、schema、KPI、安全、測試與限制 |
| [後台操作手冊](docs/ANALYTICS_SERVER.md) | 啟動、外網、設定、固定網址與備份 |
| [遊戲開發報告](docs/DEVELOPMENT_REPORT.md) | 遊戲規則、美術、動畫與驗證 |
| [研究與規則](docs/RESEARCH_AND_RULES.md) | 遊戲來源研究與規則依據 |
| [duck-analytics-backend Skill](.codex/skills/duck-analytics-backend/SKILL.md) | 維護後台時的事件、隱私、安全與驗證規範 |
| [duck-gene-lab-development Skill](.codex/skills/duck-gene-lab-development/SKILL.md) | 維護遊戲時的配色、計分、公平性、響應式與離線規範 |

## 操作方式

- 點擊／觸控：選擇候選鴨或介面按鈕。
- 鍵盤：`1`–`4` 選擇答案，`Enter` 開始／再玩一次，`Space` 或 `Esc` 暫停／繼續。
- 手機：支援安全區與直／橫向；需要時可安裝為 PWA。

## License

本專案授權內容見 [LICENSE.md](LICENSE.md)。公開部署、素材再利用或二次發佈前，請確認授權條款及第三方來源說明。
