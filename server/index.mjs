import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAnalyticsServer } from "./app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.analytics");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function ensureLocalConfig() {
  if (existsSync(envPath)) return;
  const password = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const contents = [
    "# 鴨鴨數據中心本機設定（已被 .gitignore 排除，請勿上傳）",
    "DUCK_SERVER_HOST=0.0.0.0",
    "DUCK_SERVER_PORT=8788",
    `DUCK_ADMIN_PASSWORD=${password}`,
    `DUCK_SESSION_SECRET=${secret}`,
    "DUCK_ANALYTICS_DB=./data/duck-analytics.sqlite",
    "DUCK_REPORT_TIMEZONE=Asia/Taipei",
    "DUCK_RETENTION_DAYS=730",
    "DUCK_ALLOWED_ORIGINS=",
    "DUCK_TRUST_PROXY=false",
    "",
  ].join("\n");
  writeFileSync(envPath, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log(`[duck-analytics] 已建立本機設定：${envPath}`);
  console.log(`[duck-analytics] 第一次登入密碼：${password}`);
  console.log("[duck-analytics] 請妥善保存；之後可直接在 .env.analytics 內修改。\n");
}

ensureLocalConfig();
loadEnvFile(envPath);

const host = process.env.DUCK_SERVER_HOST || "0.0.0.0";
const port = Number(process.env.DUCK_SERVER_PORT || 8788);
const databasePath = path.resolve(root, process.env.DUCK_ANALYTICS_DB || "./data/duck-analytics.sqlite");
const allowedOrigins = String(process.env.DUCK_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const app = createAnalyticsServer({
  databasePath,
  adminPassword: process.env.DUCK_ADMIN_PASSWORD,
  sessionSecret: process.env.DUCK_SESSION_SECRET,
  allowedOrigins,
  trustProxy: process.env.DUCK_TRUST_PROXY === "true",
  retentionDays: Number(process.env.DUCK_RETENTION_DAYS || 730),
  reportTimezone: process.env.DUCK_REPORT_TIMEZONE || "Asia/Taipei",
});

app.server.listen(port, host, () => {
  const address = app.server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log("[duck-analytics] 鴨鴨個人伺服器已啟動");
  console.log(`[duck-analytics] 遊戲：http://localhost:${actualPort}/game/`);
  console.log(`[duck-analytics] 後台：http://localhost:${actualPort}/admin/`);
  console.log(`[duck-analytics] 資料庫：${databasePath}`);
});

async function shutdown(signal) {
  console.log(`\n[duck-analytics] 收到 ${signal}，正在安全關閉…`);
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
