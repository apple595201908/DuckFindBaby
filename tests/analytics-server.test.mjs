import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAnalyticsServer } from "../server/app.mjs";

test("collects anonymous gameplay events and protects the dashboard", async (context) => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "duck-analytics-test-"));
  const application = createAnalyticsServer({
    databasePath: path.join(temporaryDirectory, "analytics.sqlite"),
    adminPassword: "correct-horse-battery",
    sessionSecret: "test-secret-that-is-longer-than-thirty-two-characters",
    reportTimezone: "Asia/Taipei",
    retentionDays: 30,
  });
  application.server.listen(0, "127.0.0.1");
  await new Promise((resolve) => application.server.once("listening", resolve));
  context.after(async () => {
    await application.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  const address = application.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const visitorId = "visitor_test_0001";
  const sessionId = "session_test_0001";
  const gameplayId = "gameplay_test_0001";
  const eventTime = new Date().toISOString();
  const envelope = {
    visitorId,
    sessionId,
    events: [
      {
        id: "event_test_start_0001",
        type: "session_start",
        visitorId,
        sessionId,
        occurredAt: eventTime,
        data: {
          visitNumber: 2,
          deviceType: "手機",
          os: "Android",
          browser: "Chrome",
          language: "zh-TW",
          timezone: "Asia/Taipei",
          screenWidth: 390,
          screenHeight: 844,
          referrer: "https://example.com/play",
        },
      },
      {
        id: "event_test_game_0001",
        type: "game_start",
        visitorId,
        sessionId,
        occurredAt: eventTime,
        data: { gameplayId, playNumber: 1, assistEnabled: false },
      },
      {
        id: "event_test_round_0001",
        type: "round_answer",
        visitorId,
        sessionId,
        occurredAt: eventTime,
        data: { gameplayId, roundNumber: 1, correct: true, earnedScore: 9, totalScore: 9, combo: 1, responseMs: 700 },
      },
      {
        id: "event_test_end_0001",
        type: "game_end",
        visitorId,
        sessionId,
        occurredAt: eventTime,
        data: { gameplayId, reason: "wrong", finalScore: 9, roundsCompleted: 1, maxCombo: 1, durationMs: 4500, completed: true },
      },
      {
        id: "event_test_session_end_0001",
        type: "session_end",
        visitorId,
        sessionId,
        occurredAt: eventTime,
        data: { activeMs: 12000, pageMs: 15000 },
      },
    ],
  };

  const collectResponse = await fetch(`${baseUrl}/api/analytics/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  assert.equal(collectResponse.status, 202);
  assert.deepEqual(await collectResponse.json(), { ok: true, accepted: 5, duplicates: 0 });

  const duplicateResponse = await fetch(`${baseUrl}/api/analytics/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
  });
  assert.equal(duplicateResponse.status, 202);
  assert.equal((await duplicateResponse.json()).duplicates, 5);

  assert.equal((await fetch(`${baseUrl}/api/admin/summary?range=30d`)).status, 401);
  const badLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "incorrect-password" }),
  });
  assert.equal(badLogin.status, 401);

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "correct-horse-battery" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const summaryResponse = await fetch(`${baseUrl}/api/admin/summary?range=30d`, { headers: { cookie } });
  assert.equal(summaryResponse.status, 200);
  const dashboard = await summaryResponse.json();
  assert.equal(dashboard.summary.uniqueVisitors, 1);
  assert.equal(dashboard.summary.sessions, 1);
  assert.equal(dashboard.summary.gameplays, 1);
  assert.equal(dashboard.summary.completedGameplays, 1);
  assert.equal(dashboard.summary.highScore, 9);
  assert.equal(dashboard.summary.averageActiveMs, 12000);
  assert.deepEqual(dashboard.devices, [{ label: "手機", count: 1 }]);
  assert.equal(dashboard.recentSessions[0].visit_number, 2);

  const exportResponse = await fetch(`${baseUrl}/api/admin/export.csv?range=30d`, { headers: { cookie } });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-type"), /^text\/csv/);
  assert.match(await exportResponse.text(), /Android/);

  assert.equal((await fetch(`${baseUrl}/game/`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/admin/`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
});
