import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const RANGE_DAYS = Object.freeze({
  "7d": 7,
  "30d": 30,
  "90d": 90,
});

const SCORE_BUCKETS = Object.freeze([
  { label: "0", min: 0, max: 0 },
  { label: "1–25", min: 1, max: 25 },
  { label: "26–50", min: 26, max: 50 },
  { label: "51–100", min: 51, max: 100 },
  { label: "101–200", min: 101, max: 200 },
  { label: "201+", min: 201, max: Number.MAX_SAFE_INTEGER },
]);

function finiteInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function cleanText(value, maxLength = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function booleanInteger(value) {
  return value ? 1 : 0;
}

function safeTimestamp(value, fallback) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return fallback;
  const earliest = Date.now() - 1000 * 60 * 60 * 24 * 90;
  const latest = Date.now() + 1000 * 60 * 10;
  if (timestamp.getTime() < earliest || timestamp.getTime() > latest) return fallback;
  return timestamp.toISOString();
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseData(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rangeStart(range, now = new Date()) {
  const days = RANGE_DAYS[range];
  return days ? new Date(now.getTime() - days * 86_400_000).toISOString() : "1970-01-01T00:00:00.000Z";
}

function localDateKey(value, timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return String(value).slice(0, 10);
  }
}

function dateKeys(range, timezone, now = new Date()) {
  if (range === "all") return [];
  const days = RANGE_DAYS[range] ?? 30;
  const keys = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(localDateKey(new Date(now.getTime() - offset * 86_400_000), timezone));
  }
  return [...new Set(keys)];
}

function mapRows(statement, ...params) {
  return [...statement.all(...params)];
}

export function openAnalyticsStore({ databasePath, retentionDays = 730, reportTimezone = "Asia/Taipei" }) {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      visitor_id TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      first_referrer TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
      visit_number INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      ended_at TEXT,
      active_ms INTEGER NOT NULL DEFAULT 0,
      page_ms INTEGER NOT NULL DEFAULT 0,
      device_type TEXT NOT NULL DEFAULT 'unknown',
      os TEXT NOT NULL DEFAULT 'unknown',
      browser TEXT NOT NULL DEFAULT 'unknown',
      language TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT '',
      screen_width INTEGER NOT NULL DEFAULT 0,
      screen_height INTEGER NOT NULL DEFAULT 0,
      viewport_width INTEGER NOT NULL DEFAULT 0,
      viewport_height INTEGER NOT NULL DEFAULT 0,
      touch_points INTEGER NOT NULL DEFAULT 0,
      is_pwa INTEGER NOT NULL DEFAULT 0,
      connection_type TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS gameplays (
      gameplay_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
      play_number INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      final_score INTEGER NOT NULL DEFAULT 0,
      rounds_completed INTEGER NOT NULL DEFAULT 0,
      max_combo INTEGER NOT NULL DEFAULT 0,
      end_reason TEXT NOT NULL DEFAULT '',
      assist_enabled INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS round_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gameplay_id TEXT NOT NULL REFERENCES gameplays(gameplay_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      answered_at TEXT NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      earned_score INTEGER NOT NULL DEFAULT 0,
      total_score INTEGER NOT NULL DEFAULT 0,
      response_ms INTEGER NOT NULL DEFAULT 0,
      parent_a INTEGER,
      parent_b INTEGER,
      target_color INTEGER,
      chosen_color INTEGER,
      UNIQUE(gameplay_id, round_number)
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      gameplay_id TEXT,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS sessions_started_idx ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS sessions_visitor_idx ON sessions(visitor_id, started_at);
    CREATE INDEX IF NOT EXISTS gameplays_started_idx ON gameplays(started_at);
    CREATE INDEX IF NOT EXISTS gameplays_session_idx ON gameplays(session_id, started_at);
    CREATE INDEX IF NOT EXISTS rounds_gameplay_idx ON round_answers(gameplay_id, round_number);
    CREATE INDEX IF NOT EXISTS events_occurred_idx ON analytics_events(occurred_at);
  `);

  const statements = {
    insertVisitor: db.prepare(`
      INSERT INTO visitors (visitor_id, first_seen_at, last_seen_at, first_referrer)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(visitor_id) DO UPDATE SET
        first_seen_at = MIN(first_seen_at, excluded.first_seen_at),
        last_seen_at = MAX(last_seen_at, excluded.last_seen_at)
    `),
    insertSession: db.prepare(`
      INSERT INTO sessions (
        session_id, visitor_id, visit_number, started_at, last_seen_at,
        device_type, os, browser, language, timezone,
        screen_width, screen_height, viewport_width, viewport_height,
        touch_points, is_pwa, connection_type, referrer, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        last_seen_at = MAX(last_seen_at, excluded.last_seen_at),
        visit_number = MAX(visit_number, excluded.visit_number),
        device_type = CASE WHEN device_type = 'unknown' THEN excluded.device_type ELSE device_type END,
        os = CASE WHEN os = 'unknown' THEN excluded.os ELSE os END,
        browser = CASE WHEN browser = 'unknown' THEN excluded.browser ELSE browser END
    `),
    touchSession: db.prepare(`
      UPDATE sessions SET last_seen_at = MAX(last_seen_at, ?) WHERE session_id = ?
    `),
    insertEvent: db.prepare(`
      INSERT OR IGNORE INTO analytics_events
        (event_id, event_type, visitor_id, session_id, gameplay_id, occurred_at, received_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    insertGameplay: db.prepare(`
      INSERT INTO gameplays (
        gameplay_id, session_id, visitor_id, play_number, started_at, assist_enabled
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(gameplay_id) DO NOTHING
    `),
    updateRoundProgress: db.prepare(`
      UPDATE gameplays SET
        final_score = MAX(final_score, ?),
        rounds_completed = MAX(rounds_completed, ?),
        max_combo = MAX(max_combo, ?)
      WHERE gameplay_id = ?
    `),
    insertRound: db.prepare(`
      INSERT OR IGNORE INTO round_answers (
        gameplay_id, session_id, visitor_id, round_number, answered_at,
        correct, earned_score, total_score, response_ms,
        parent_a, parent_b, target_color, chosen_color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    endGameplay: db.prepare(`
      UPDATE gameplays SET
        ended_at = COALESCE(ended_at, ?),
        duration_ms = MAX(duration_ms, ?),
        final_score = MAX(final_score, ?),
        rounds_completed = MAX(rounds_completed, ?),
        max_combo = MAX(max_combo, ?),
        end_reason = CASE WHEN completed = 1 THEN end_reason ELSE ? END,
        completed = MAX(completed, ?)
      WHERE gameplay_id = ?
    `),
    heartbeat: db.prepare(`
      UPDATE sessions SET
        last_seen_at = MAX(last_seen_at, ?),
        active_ms = MAX(active_ms, ?),
        page_ms = MAX(page_ms, ?)
      WHERE session_id = ?
    `),
    endSession: db.prepare(`
      UPDATE sessions SET
        last_seen_at = MAX(last_seen_at, ?),
        ended_at = CASE WHEN ended_at IS NULL OR ended_at < ? THEN ? ELSE ended_at END,
        active_ms = MAX(active_ms, ?),
        page_ms = MAX(page_ms, ?)
      WHERE session_id = ?
    `),
  };

  function ensureEntities({ visitorId, sessionId, occurredAt, data, userAgent }) {
    const referrer = cleanText(data.referrer, 500);
    statements.insertVisitor.run(visitorId, occurredAt, occurredAt, referrer);
    statements.insertSession.run(
      sessionId,
      visitorId,
      finiteInteger(data.visitNumber, 1, 1, 1_000_000),
      occurredAt,
      occurredAt,
      cleanText(data.deviceType, 32) || "unknown",
      cleanText(data.os, 64) || "unknown",
      cleanText(data.browser, 64) || "unknown",
      cleanText(data.language, 32),
      cleanText(data.timezone, 80),
      finiteInteger(data.screenWidth, 0, 0, 20_000),
      finiteInteger(data.screenHeight, 0, 0, 20_000),
      finiteInteger(data.viewportWidth, 0, 0, 20_000),
      finiteInteger(data.viewportHeight, 0, 0, 20_000),
      finiteInteger(data.touchPoints, 0, 0, 100),
      booleanInteger(data.isPwa),
      cleanText(data.connectionType, 40),
      referrer,
      cleanText(userAgent, 500),
    );
  }

  function ensureGameplay(event, occurredAt, data) {
    const gameplayId = cleanText(data.gameplayId, 80);
    if (!gameplayId) return "";
    statements.insertGameplay.run(
      gameplayId,
      event.sessionId,
      event.visitorId,
      finiteInteger(data.playNumber, 1, 1, 100_000),
      occurredAt,
      booleanInteger(data.assistEnabled),
    );
    return gameplayId;
  }

  function ingest(envelope, userAgent = "") {
    const receivedAt = new Date().toISOString();
    let accepted = 0;
    let duplicates = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const rawEvent of envelope.events) {
        const data = parseData(rawEvent.data);
        const occurredAt = safeTimestamp(rawEvent.occurredAt, receivedAt);
        const event = {
          id: cleanText(rawEvent.id, 80),
          type: cleanText(rawEvent.type, 48),
          visitorId: cleanText(rawEvent.visitorId || envelope.visitorId, 80),
          sessionId: cleanText(rawEvent.sessionId || envelope.sessionId, 80),
        };

        ensureEntities({ visitorId: event.visitorId, sessionId: event.sessionId, occurredAt, data, userAgent });
        const gameplayId = cleanText(data.gameplayId, 80) || null;
        const inserted = statements.insertEvent.run(
          event.id,
          event.type,
          event.visitorId,
          event.sessionId,
          gameplayId,
          occurredAt,
          receivedAt,
          safeJson(data),
        );
        if (inserted.changes === 0) {
          duplicates += 1;
          continue;
        }

        accepted += 1;
        statements.touchSession.run(occurredAt, event.sessionId);
        if (event.type === "game_start") {
          ensureGameplay(event, occurredAt, data);
        } else if (event.type === "round_answer") {
          const ensuredGameplayId = ensureGameplay(event, occurredAt, data);
          if (ensuredGameplayId) {
            const roundNumber = finiteInteger(data.roundNumber, 1, 1, 100_000);
            const correct = booleanInteger(data.correct);
            const roundsCompleted = correct ? roundNumber : Math.max(0, roundNumber - 1);
            statements.insertRound.run(
              ensuredGameplayId,
              event.sessionId,
              event.visitorId,
              roundNumber,
              occurredAt,
              correct,
              finiteInteger(data.earnedScore, 0, 0, 10_000),
              finiteInteger(data.totalScore, 0, 0, 10_000_000),
              finiteInteger(data.responseMs, 0, 0, 3_600_000),
              Number.isFinite(Number(data.parentA)) ? Number(data.parentA) : null,
              Number.isFinite(Number(data.parentB)) ? Number(data.parentB) : null,
              Number.isFinite(Number(data.targetColor)) ? Number(data.targetColor) : null,
              Number.isFinite(Number(data.chosenColor)) ? Number(data.chosenColor) : null,
            );
            statements.updateRoundProgress.run(
              finiteInteger(data.totalScore, 0, 0, 10_000_000),
              roundsCompleted,
              finiteInteger(data.combo, 0, 0, 100_000),
              ensuredGameplayId,
            );
          }
        } else if (event.type === "game_end") {
          const ensuredGameplayId = ensureGameplay(event, occurredAt, data);
          if (ensuredGameplayId) {
            statements.endGameplay.run(
              occurredAt,
              finiteInteger(data.durationMs, 0, 0, 86_400_000),
              finiteInteger(data.finalScore, 0, 0, 10_000_000),
              finiteInteger(data.roundsCompleted, 0, 0, 100_000),
              finiteInteger(data.maxCombo, 0, 0, 100_000),
              cleanText(data.reason, 32),
              booleanInteger(data.completed !== false),
              ensuredGameplayId,
            );
          }
        } else if (event.type === "heartbeat") {
          statements.heartbeat.run(
            occurredAt,
            finiteInteger(data.activeMs, 0, 0, 604_800_000),
            finiteInteger(data.pageMs, 0, 0, 604_800_000),
            event.sessionId,
          );
        } else if (event.type === "session_end") {
          statements.endSession.run(
            occurredAt,
            occurredAt,
            occurredAt,
            finiteInteger(data.activeMs, 0, 0, 604_800_000),
            finiteInteger(data.pageMs, 0, 0, 604_800_000),
            event.sessionId,
          );
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { accepted, duplicates };
  }

  function dashboard(range = "30d") {
    const safeRange = Object.hasOwn(RANGE_DAYS, range) ? range : range === "all" ? "all" : "30d";
    const cutoff = rangeStart(safeRange);
    const now = new Date();

    const summary = db.prepare(`
      WITH ranged_sessions AS (
        SELECT * FROM sessions WHERE started_at >= ?
      ), ranged_games AS (
        SELECT * FROM gameplays WHERE started_at >= ?
      ), active_visitors AS (
        SELECT DISTINCT visitor_id FROM ranged_sessions
      ), lifetime_counts AS (
        SELECT s.visitor_id, COUNT(*) AS session_count
        FROM sessions s JOIN active_visitors a ON a.visitor_id = s.visitor_id
        GROUP BY s.visitor_id
      ), session_games AS (
        SELECT session_id, COUNT(*) AS game_count FROM ranged_games GROUP BY session_id
      )
      SELECT
        (SELECT COUNT(*) FROM active_visitors) AS unique_visitors,
        (SELECT COUNT(*) FROM ranged_sessions) AS sessions,
        (SELECT COUNT(*) FROM ranged_games) AS gameplays,
        (SELECT COUNT(*) FROM ranged_games WHERE completed = 1) AS completed_gameplays,
        (SELECT ROUND(AVG(final_score), 1) FROM ranged_games WHERE ended_at IS NOT NULL) AS average_score,
        (SELECT MAX(final_score) FROM ranged_games) AS high_score,
        (SELECT ROUND(AVG(active_ms)) FROM ranged_sessions) AS average_active_ms,
        (SELECT SUM(active_ms) FROM ranged_sessions) AS total_active_ms,
        (SELECT COUNT(*) FROM lifetime_counts WHERE session_count > 1) AS returning_visitors,
        (SELECT COUNT(*) FROM session_games WHERE game_count > 1) AS replay_sessions,
        (SELECT COUNT(*) FROM session_games) AS playing_sessions,
        (SELECT ROUND(AVG(rounds_completed), 1) FROM ranged_games WHERE ended_at IS NOT NULL) AS average_rounds
    `).get(cutoff, cutoff);

    const sessionRows = mapRows(db.prepare(`
      SELECT started_at, visitor_id, device_type, os, browser, referrer
      FROM sessions WHERE started_at >= ? ORDER BY started_at ASC
    `), cutoff);
    const gameRows = mapRows(db.prepare(`
      SELECT started_at, final_score, ended_at FROM gameplays
      WHERE started_at >= ? ORDER BY started_at ASC
    `), cutoff);

    let keys = dateKeys(safeRange, reportTimezone, now);
    if (safeRange === "all") {
      keys = [...new Set([...sessionRows, ...gameRows].map((row) => localDateKey(row.started_at, reportTimezone)))];
      if (keys.length > 90) keys = keys.slice(-90);
    }
    const trend = new Map(keys.map((date) => [date, { date, visitors: new Set(), sessions: 0, gameplays: 0, scores: [] }]));
    for (const row of sessionRows) {
      const key = localDateKey(row.started_at, reportTimezone);
      const bucket = trend.get(key);
      if (!bucket) continue;
      bucket.visitors.add(row.visitor_id);
      bucket.sessions += 1;
    }
    for (const row of gameRows) {
      const key = localDateKey(row.started_at, reportTimezone);
      const bucket = trend.get(key);
      if (!bucket) continue;
      bucket.gameplays += 1;
      if (row.ended_at) bucket.scores.push(Number(row.final_score));
    }
    const trends = [...trend.values()].map((item) => ({
      date: item.date,
      visitors: item.visitors.size,
      sessions: item.sessions,
      gameplays: item.gameplays,
      averageScore: item.scores.length
        ? Math.round((item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length) * 10) / 10
        : 0,
    }));

    const groupBy = (field) => {
      const counts = new Map();
      for (const row of sessionRows) {
        const label = cleanText(row[field], 100) || "未知";
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 8);
    };

    const referralCounts = new Map();
    for (const row of sessionRows) {
      let label = "直接進入";
      if (row.referrer) {
        try {
          label = new URL(row.referrer).hostname || "直接進入";
        } catch {
          label = cleanText(row.referrer, 60) || "直接進入";
        }
      }
      referralCounts.set(label, (referralCounts.get(label) ?? 0) + 1);
    }

    const completedScores = gameRows.filter((row) => row.ended_at).map((row) => Number(row.final_score));
    const scoreDistribution = SCORE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      count: completedScores.filter((score) => score >= bucket.min && score <= bucket.max).length,
    }));

    const frequencyRows = mapRows(db.prepare(`
      WITH active_visitors AS (
        SELECT DISTINCT visitor_id FROM sessions WHERE started_at >= ?
      )
      SELECT s.visitor_id, COUNT(*) AS session_count
      FROM sessions s JOIN active_visitors a ON a.visitor_id = s.visitor_id
      GROUP BY s.visitor_id
    `), cutoff);
    const visitorFrequency = [
      { label: "首次（1 次）", count: frequencyRows.filter((row) => row.session_count === 1).length },
      { label: "回訪（2–3 次）", count: frequencyRows.filter((row) => row.session_count >= 2 && row.session_count <= 3).length },
      { label: "忠實（4–9 次）", count: frequencyRows.filter((row) => row.session_count >= 4 && row.session_count <= 9).length },
      { label: "核心（10+ 次）", count: frequencyRows.filter((row) => row.session_count >= 10).length },
    ];

    const endReasons = mapRows(db.prepare(`
      SELECT CASE WHEN end_reason = '' THEN 'unknown' ELSE end_reason END AS label, COUNT(*) AS count
      FROM gameplays WHERE started_at >= ? AND ended_at IS NOT NULL
      GROUP BY label ORDER BY count DESC
    `), cutoff);

    const recentSessions = mapRows(db.prepare(`
      SELECT
        s.session_id, s.visitor_id, s.started_at, s.last_seen_at, s.active_ms,
        s.device_type, s.os, s.browser, s.visit_number,
        COUNT(g.gameplay_id) AS gameplays,
        COALESCE(MAX(g.final_score), 0) AS high_score
      FROM sessions s
      LEFT JOIN gameplays g ON g.session_id = s.session_id
      WHERE s.started_at >= ?
      GROUP BY s.session_id
      ORDER BY s.started_at DESC LIMIT 50
    `), cutoff).map((row) => ({
      ...row,
      visitor_id: `${String(row.visitor_id).slice(0, 8)}…`,
      session_id: `${String(row.session_id).slice(0, 8)}…`,
    }));

    const uniqueVisitors = Number(summary.unique_visitors || 0);
    const playingSessions = Number(summary.playing_sessions || 0);
    return {
      generatedAt: now.toISOString(),
      reportTimezone,
      range: safeRange,
      summary: {
        uniqueVisitors,
        sessions: Number(summary.sessions || 0),
        gameplays: Number(summary.gameplays || 0),
        completedGameplays: Number(summary.completed_gameplays || 0),
        averageScore: Number(summary.average_score || 0),
        highScore: Number(summary.high_score || 0),
        averageActiveMs: Number(summary.average_active_ms || 0),
        totalActiveMs: Number(summary.total_active_ms || 0),
        returningVisitors: Number(summary.returning_visitors || 0),
        repeatVisitorRate: uniqueVisitors ? Number(summary.returning_visitors || 0) / uniqueVisitors : 0,
        replaySessions: Number(summary.replay_sessions || 0),
        replayRate: playingSessions ? Number(summary.replay_sessions || 0) / playingSessions : 0,
        averageRounds: Number(summary.average_rounds || 0),
      },
      trends,
      devices: groupBy("device_type"),
      operatingSystems: groupBy("os"),
      browsers: groupBy("browser"),
      referrers: [...referralCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      visitorFrequency,
      scoreDistribution,
      endReasons,
      recentSessions,
    };
  }

  function exportGameplays(range = "30d") {
    const safeRange = Object.hasOwn(RANGE_DAYS, range) ? range : range === "all" ? "all" : "30d";
    return mapRows(db.prepare(`
      SELECT
        g.started_at, g.ended_at, g.duration_ms, g.final_score,
        g.rounds_completed, g.max_combo, g.end_reason, g.play_number,
        s.device_type, s.os, s.browser, s.language, s.timezone,
        s.visit_number, s.active_ms, s.referrer
      FROM gameplays g JOIN sessions s ON s.session_id = g.session_id
      WHERE g.started_at >= ? ORDER BY g.started_at DESC
    `), rangeStart(safeRange));
  }

  function purgeExpired() {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const result = db.prepare("DELETE FROM visitors WHERE last_seen_at < ?").run(cutoff);
    db.prepare("DELETE FROM analytics_events WHERE occurred_at < ?").run(cutoff);
    return Number(result.changes || 0);
  }

  return {
    ingest,
    dashboard,
    exportGameplays,
    purgeExpired,
    close() {
      db.close();
    },
  };
}
