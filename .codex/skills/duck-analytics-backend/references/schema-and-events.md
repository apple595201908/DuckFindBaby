# Duck Analytics Schema and Event Reference

Use this reference when changing tracking, storage, APIs, dashboards, or KPI calculations. The source code remains authoritative if a documented field differs.

## Identifier hierarchy

| Identifier | Lifetime | Purpose |
| --- | --- | --- |
| `visitorId` | Persisted in the browser | Counts anonymous returning browsers |
| `sessionId` | One active browser visit | Groups time, device, and navigation events |
| `playId` | One game attempt | Groups rounds and the final result |
| `eventId` | One event | Makes retried ingestion idempotent |

Identifiers are random operational IDs, not user accounts. Do not derive them from IP addresses, user-agent fingerprints, or personal data.

## Browser events

| Event | Trigger | Important payload |
| --- | --- | --- |
| `session_start` | Analytics session starts | entry path, referrer class, screen/viewport, language, timezone, device hints |
| `heartbeat` | Periodic while visible and active | accumulated active milliseconds |
| `session_end` | page hide/unload best effort | final accumulated active milliseconds |
| `game_start` | player starts a game | `playId`, selected settings |
| `round_answer` | player submits an answer | `playId`, round, correctness, response time, score context |
| `game_end` | game finishes | `playId`, score, accuracy, duration, completion context |
| `settings_change` | supported game setting changes | changed setting and normalized value |

The client may retry or deliver out of order. The server must deduplicate by `eventId` and project sessions/plays defensively.

## SQLite entities

- `analytics_events`: immutable accepted event log with unique event ID, timestamps, identifiers, type, and JSON payload.
- `visitors`: first/last seen timestamps and aggregate visit/play facts for an anonymous browser.
- `sessions`: session start/end, last seen, active duration, device/browser/OS classifications, viewport, language, and entry context.
- `gameplays`: play start/end, score, round count, combo, duration, assist setting, end reason, and completion state.
- `round_answers`: one deduplicated answer per gameplay and round, including correctness, response time, score, and color values.

Indexes should serve time filters, identifier lookups, device breakdowns, event types, and recent activity. Retention cleanup must run transactionally and never leave aggregates in a partially updated state.

## HTTP routes

| Method and route | Authentication | Purpose |
| --- | --- | --- |
| `GET /healthz` | No | Service liveness |
| `POST /api/analytics/events` | No | Validated anonymous batch ingestion |
| `POST /api/admin/login` | Password | Establish signed admin session |
| `POST /api/admin/logout` | Admin cookie | End admin session |
| `GET /api/admin/session` | Admin cookie | Report login/session state |
| `GET /api/admin/summary` | Admin cookie | Headline KPIs and trends |
| `GET /api/admin/export.csv` | Admin cookie | Filtered CSV export |

All routes returning analytics data are private even though ingestion is public.

## KPI definitions

- Unique visitors: distinct `visitorId` values first or last seen in the selected window, according to the query label.
- Sessions: accepted session records started in the selected window.
- Plays: accepted play records started in the selected window.
- Repeat visitors: visitors with more than one known session; repeat rate is repeat visitors divided by eligible visitors.
- Average active time: sum of final/maximum session active milliseconds divided by counted sessions.
- Average plays per visitor: counted plays divided by distinct visitors represented by those plays.
- Completion rate: completed plays divided by started plays with a known outcome.
- Device/browser/OS shares: sessions in a category divided by categorized sessions in the same window.

Display durations as human-readable time while storing them as integer milliseconds. Label reporting timezone explicitly; server filters should use one consistent definition.
