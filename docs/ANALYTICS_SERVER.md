# 鴨鴨個人數據伺服器

這套後台與遊戲放在同一個 Node.js 服務中，適合在個人電腦、家用小主機或 NAS 長期運行。

## 技術架構

- 遊戲：維持原本 HTML/CSS/JavaScript，新增約 15 秒一次的匿名事件批次。
- API：Node.js 22 內建 HTTP Server，不需要再維護額外 Web 框架。
- 資料庫：Node.js 內建 SQLite，使用 WAL 模式，資料預設保存在 `data/duck-analytics.sqlite`。
- 後台：手機與桌機皆可使用的原生 HTML/CSS/JavaScript 儀表板。
- 登入：管理員密碼換取 12 小時、HttpOnly、SameSite=Strict 的簽章 Cookie。

伺服器不保存玩家姓名、Email 或 IP。匿名玩家 ID 保存在玩家自己的瀏覽器；清除瀏覽器網站資料後會被視為新玩家。

## 一鍵啟動（Windows）

雙擊專案根目錄的 `start-duck-server.bat`，或在 PowerShell 執行：

```powershell
npm run analytics:start
```

第一次啟動會建立被 Git 忽略的 `.env.analytics`，並在終端機顯示一次隨機管理員密碼。之後可直接在該檔案修改密碼。

- 遊戲：`http://localhost:8788/game/`
- 後台：`http://localhost:8788/admin/`
- 健康檢查：`http://localhost:8788/healthz`

同一個家中 Wi-Fi 的裝置可用 `http://你的電腦區網IP:8788/game/`。Windows 防火牆第一次詢問時，只建議允許「私人網路」。

## 從外面的手機開啟（免網域）

雙擊 `start-public-duck-server.bat`，或執行：

```powershell
npm run public:start
```

終端機會顯示一組 `https://隨機名稱.trycloudflare.com/game/`。把這個 HTTPS 網址傳到手機，即使手機不在同一個 Wi-Fi 也能開啟。網址亦會寫入 `.duck-public-url.txt`，方便複製。

請注意：

- 電腦、Node.js 伺服器與這個終端機視窗必須保持運行。
- 免費 Quick Tunnel 的網址每次重新啟動都會改變，官方不保證服務可用性，適合個人測試及小量分享。
- 知道網址的人都能打開遊戲；後台仍需要 `.env.analytics` 內的管理員密碼。
- 若需要固定、可加入書籤的網址，應在 Cloudflare 建立 Named Tunnel，並使用自己的網域。

## 後台提供的資料

- 不重複匿名玩家、工作階段、遊玩局數、正常結束局數。
- 平均分數、最高分、平均通過題數、分數分布。
- 玩家活躍時間與頁面停留時間。
- 手機／平板／桌機、作業系統、瀏覽器、螢幕與語言環境。
- 玩家回訪層級、每個工作階段的重玩率、來源網站。
- 每日趨勢、最近 50 個工作階段、CSV 明細匯出。

遊戲在斷線時會把最多 250 個事件暫存在瀏覽器，恢復連線後重送；伺服器以事件 ID 去重。

## 設定說明

`.env.analytics` 支援：

| 設定 | 預設 | 說明 |
| --- | --- | --- |
| `DUCK_SERVER_HOST` | `0.0.0.0` | 接受本機與區網連線 |
| `DUCK_SERVER_PORT` | `8788` | HTTP 連接埠 |
| `DUCK_ADMIN_PASSWORD` | 首次啟動隨機產生 | 後台登入密碼，至少 10 字元 |
| `DUCK_ANALYTICS_DB` | `./data/duck-analytics.sqlite` | SQLite 路徑 |
| `DUCK_REPORT_TIMEZONE` | `Asia/Taipei` | 每日趨勢的報表時區 |
| `DUCK_RETENTION_DAYS` | `730` | 自動保留天數；小於等於 0 表示不清理 |
| `DUCK_ALLOWED_ORIGINS` | 空白 | 跨網域遊戲網址，多個以逗號分隔 |
| `DUCK_TRUST_PROXY` | `false` | 只有放在可信任反向代理後方才設為 `true` |

## 使用固定網址公開給網際網路玩家

個人電腦必須持續開機。不要直接把 8788 連接埠裸露到公網；建議使用 Cloudflare Named Tunnel 或其他具 HTTPS 與存取控制的反向代理。Named Tunnel 需要 Cloudflare 帳號、放在 Cloudflare DNS 的網域，以及自訂子網域。完成固定公開網址後：

1. 玩家最好直接使用該伺服器的 `/game/`，事件會同網域上報。
2. 若遊戲仍放在另一個靜態網站，在 `public/game/index.html` 的 `<head>` 加入：

   ```html
   <meta name="duck-analytics-endpoint" content="https://你的後台網域/api/analytics/events" />
   ```

3. 在 `.env.analytics` 的 `DUCK_ALLOWED_ORIGINS` 填入遊戲來源，例如 `https://game.example.com`，再重新啟動。
4. 公開前請依營運地區補上隱私權說明；玩家可用遊戲網址參數 `?analytics=off` 停用此裝置的統計。

## 備份與維護

停止伺服器後，備份整個 `data` 資料夾即可。SQLite 使用 WAL，若在運行中備份，必須同時保存 `.sqlite`、`.sqlite-wal`、`.sqlite-shm` 三個檔案。

驗證後端：

```powershell
npm run test:analytics
```
