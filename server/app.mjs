import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openAnalyticsStore } from "./analytics-store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVENT_TYPES = new Set([
  "session_start",
  "heartbeat",
  "session_end",
  "game_start",
  "round_answer",
  "game_end",
  "settings_change",
]);
const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
});

function json(response, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}
function parseCookies(request) {
  const cookies = {};
  for (const part of String(request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows) {
  if (!rows.length) return "\uFEFFstarted_at\r\n";
  const headers = Object.keys(rows[0]);
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows
    .map((row) => headers.map((header) => csvCell(row[header])).join(","))
    .join("\r\n")}\r\n`;
}

async function readJson(request, maxBytes = 128 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("request_too_large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }
}

function validateEnvelope(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "請提供事件資料。";
  if (!ID_PATTERN.test(String(body.visitorId || ""))) return "visitorId 格式錯誤。";
  if (!ID_PATTERN.test(String(body.sessionId || ""))) return "sessionId 格式錯誤。";
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 50) {
    return "每批事件數必須介於 1 到 50。";
  }
  for (const event of body.events) {
    if (!event || typeof event !== "object") return "事件格式錯誤。";
    if (!ID_PATTERN.test(String(event.id || ""))) return "事件 ID 格式錯誤。";
    if (!EVENT_TYPES.has(event.type)) return `不支援的事件類型：${String(event.type || "")}`;
    if (event.visitorId && !ID_PATTERN.test(String(event.visitorId))) return "事件 visitorId 格式錯誤。";
    if (event.sessionId && !ID_PATTERN.test(String(event.sessionId))) return "事件 sessionId 格式錯誤。";
    if (event.data !== undefined && (!event.data || typeof event.data !== "object" || Array.isArray(event.data))) {
      return "事件 data 格式錯誤。";
    }
  }
  return "";
}

function staticPath(urlPath) {
  if (urlPath === "/favicon.svg") return path.join(root, "public", "favicon.svg");
  if (urlPath === "/admin" || urlPath === "/admin/") return path.join(root, "public", "admin", "index.html");
  if (urlPath.startsWith("/admin/")) return path.join(root, "public", urlPath);
  if (urlPath === "/game" || urlPath === "/game/") return path.join(root, "public", "game", "index.html");
  if (urlPath.startsWith("/game/")) return path.join(root, "public", urlPath);
  return null;
}

function serveFile(request, response, filePath) {
  const publicRoot = path.join(root, "public") + path.sep;
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(publicRoot) || path.basename(resolved).startsWith(".")) {
    json(response, 404, { error: "not_found" });
    return;
  }
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    json(response, 404, { error: "not_found" });
    return;
  }
  if (!stats.isFile()) {
    json(response, 404, { error: "not_found" });
    return;
  }
  const extension = path.extname(resolved).toLowerCase();
  const isAdmin = resolved.includes(`${path.sep}admin${path.sep}`);
  response.writeHead(200, {
    "content-type": MIME_TYPES[extension] || "application/octet-stream",
    "content-length": stats.size,
    "cache-control": isAdmin || extension === ".html" ? "no-cache" : "public, max-age=86400",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' *; font-src 'self'; media-src 'self'; frame-ancestors 'self'",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(resolved).pipe(response);
}

export function createAnalyticsServer(options) {
  const {
    databasePath,
    adminPassword,
    sessionSecret,
    allowedOrigins = [],
    trustProxy = false,
    retentionDays = 730,
    reportTimezone = "Asia/Taipei",
  } = options;
  if (!adminPassword || adminPassword.length < 10) throw new Error("DUCK_ADMIN_PASSWORD 至少需要 10 個字元。");
  if (!sessionSecret || sessionSecret.length < 32) throw new Error("DUCK_SESSION_SECRET 至少需要 32 個字元。");

  const store = openAnalyticsStore({ databasePath, retentionDays, reportTimezone });
  store.purgeExpired();
  const rateLimits = new Map();

  function clientAddress(request) {
    if (trustProxy) return String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() || request.socket.remoteAddress;
    return request.socket.remoteAddress || "unknown";
  }

  function rateLimited(request) {
    const key = clientAddress(request);
    const minute = Math.floor(Date.now() / 60_000);
    const current = rateLimits.get(key);
    if (!current || current.minute !== minute) {
      rateLimits.set(key, { minute, count: 1 });
      if (rateLimits.size > 2_000) rateLimits.clear();
      return false;
    }
    current.count += 1;
    return current.count > 180;
  }

  function signSession(expiresAt) {
    return createHmac("sha256", sessionSecret).update(String(expiresAt)).digest("base64url");
  }

  function isAdmin(request) {
    const token = parseCookies(request).duck_admin;
    if (!token) return false;
    const [expiresText, signature] = token.split(".");
    const expiresAt = Number(expiresText);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;
    return safeEqual(signature, signSession(expiresAt));
  }

  function corsHeaders(request) {
    const origin = String(request.headers.origin || "");
    if (!origin) return {};
    let sameOrigin = false;
    try {
      const host = request.headers.host;
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin && !allowedOrigins.includes(origin)) return null;
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "Origin",
    };
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    try {
      if (url.pathname === "/healthz" && request.method === "GET") {
        json(response, 200, { ok: true, service: "duck-analytics", time: new Date().toISOString() });
        return;
      }

      if (url.pathname === "/api/analytics/events") {
        const cors = corsHeaders(request);
        if (!cors) {
          json(response, 403, { error: "origin_not_allowed" });
          return;
        }
        if (request.method === "OPTIONS") {
          response.writeHead(204, cors);
          response.end();
          return;
        }
        if (request.method !== "POST") {
          json(response, 405, { error: "method_not_allowed" }, cors);
          return;
        }
        if (rateLimited(request)) {
          json(response, 429, { error: "rate_limited" }, cors);
          return;
        }
        const body = await readJson(request);
        const validationError = validateEnvelope(body);
        if (validationError) {
          json(response, 400, { error: "invalid_events", message: validationError }, cors);
          return;
        }
        const result = store.ingest(body, request.headers["user-agent"] || "");
        json(response, 202, { ok: true, ...result }, cors);
        return;
      }

      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        if (rateLimited(request)) {
          json(response, 429, { error: "rate_limited", message: "嘗試次數過多，請稍後再試。" });
          return;
        }
        const body = await readJson(request, 8 * 1024);
        if (!safeEqual(body.password || "", adminPassword)) {
          json(response, 401, { error: "invalid_password", message: "密碼不正確。" });
          return;
        }
        const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
        const secure = request.socket.encrypted || request.headers["x-forwarded-proto"] === "https";
        const token = `${expiresAt}.${signSession(expiresAt)}`;
        json(response, 200, { ok: true, expiresAt: new Date(expiresAt).toISOString() }, {
          "set-cookie": `duck_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? "; Secure" : ""}`,
        });
        return;
      }

      if (url.pathname === "/api/admin/logout" && request.method === "POST") {
        json(response, 200, { ok: true }, {
          "set-cookie": "duck_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        });
        return;
      }

      if (url.pathname.startsWith("/api/admin/")) {
        if (!isAdmin(request)) {
          json(response, 401, { error: "unauthorized" });
          return;
        }
        if (url.pathname === "/api/admin/session" && request.method === "GET") {
          json(response, 200, { authenticated: true });
          return;
        }
        if (url.pathname === "/api/admin/summary" && request.method === "GET") {
          json(response, 200, store.dashboard(url.searchParams.get("range") || "30d"));
          return;
        }
        if (url.pathname === "/api/admin/export.csv" && request.method === "GET") {
          const range = url.searchParams.get("range") || "30d";
          const body = csv(store.exportGameplays(range));
          response.writeHead(200, {
            "content-type": "text/csv; charset=utf-8",
            "content-length": Buffer.byteLength(body),
            "content-disposition": `attachment; filename="duck-analytics-${range}.csv"`,
            "cache-control": "no-store",
          });
          response.end(body);
          return;
        }
        json(response, 404, { error: "not_found" });
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (url.pathname === "/") {
          response.writeHead(302, { location: "/game/", "cache-control": "no-store" });
          response.end();
          return;
        }
        const filePath = staticPath(decodeURIComponent(url.pathname));
        if (filePath) {
          serveFile(request, response, filePath);
          return;
        }
      }
      json(response, 404, { error: "not_found" });
    } catch (error) {
      const status = Number(error.status) || 500;
      if (status >= 500) console.error("[duck-analytics] request failed", error);
      json(response, status, {
        error: status === 500 ? "internal_error" : error.message,
        message: status === 500 ? "伺服器發生錯誤。" : undefined,
      });
    }
  });

  return {
    server,
    store,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          store.close();
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
