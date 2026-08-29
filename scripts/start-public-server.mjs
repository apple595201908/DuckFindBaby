import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.analytics");
const publicUrlPath = path.join(root, ".duck-public-url.txt");
const wranglerPath = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
let serverProcess = null;
let tunnelProcess = null;
let shuttingDown = false;
let publishedBaseUrl = "";

function readLocalSettings() {
  const values = {};
  if (!existsSync(envPath)) return values;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

async function isServerReady(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(1_000),
    });
    const data = await response.json();
    return response.ok && data.service === "duck-analytics";
  } catch {
    return false;
  }
}

async function waitForServer(port) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isServerReady(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function printTunnelOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match) return;
  const baseUrl = match[0].replace(/\/$/, "");
  if (baseUrl === publishedBaseUrl) return;
  publishedBaseUrl = baseUrl;
  const output = [
    "",
    "============================================================",
    "  鴨鴨遊戲已可從外部手機開啟",
    `  遊戲：${baseUrl}/game/`,
    `  後台：${baseUrl}/admin/`,
    "  請保持這個視窗與電腦開機；關閉後網址即失效。",
    "============================================================",
    "",
  ].join("\n");
  writeFileSync(publicUrlPath, `${baseUrl}/game/\n`, "utf8");
  process.stdout.write(output);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (tunnelProcess && !tunnelProcess.killed) tunnelProcess.kill("SIGTERM");
  if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGTERM");
  if (existsSync(publicUrlPath)) {
    writeFileSync(publicUrlPath, "公網通道已停止。請重新執行 start-public-duck-server.bat 取得新網址。\n", "utf8");
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  process.exit(exitCode);
}

if (!existsSync(wranglerPath)) {
  console.error("找不到 Wrangler。請先在專案目錄執行 npm ci，再重新啟動。");
  process.exit(1);
}

const settings = readLocalSettings();
const port = Number(process.env.DUCK_SERVER_PORT || settings.DUCK_SERVER_PORT || 8788);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(".env.analytics 的 DUCK_SERVER_PORT 不正確。");
  process.exit(1);
}

console.log("正在啟動鴨鴨伺服器與 HTTPS 公網通道…");
console.log("第一次建立通道可能需要十幾秒，請保持此視窗開啟。\n");

if (!(await isServerReady(port))) {
  serverProcess = spawn(process.execPath, [path.join(root, "server", "index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      DUCK_SERVER_PORT: String(port),
      DUCK_TRUST_PROXY: "true",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  serverProcess.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`本機伺服器意外停止（代碼 ${code}）。`);
      shutdown(code || 1);
    }
  });
}

if (!(await waitForServer(port))) {
  console.error(`無法連接本機伺服器 http://127.0.0.1:${port}`);
  await shutdown(1);
}

tunnelProcess = spawn(
  process.execPath,
  [wranglerPath, "tunnel", "quick-start", `http://127.0.0.1:${port}`],
  {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["inherit", "pipe", "pipe"],
    windowsHide: true,
  },
);
tunnelProcess.stdout.on("data", printTunnelOutput);
tunnelProcess.stderr.on("data", printTunnelOutput);
tunnelProcess.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(`公網通道已停止（代碼 ${code ?? 0}）。`);
    shutdown(code || 0);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
