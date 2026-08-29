---
name: duck-analytics-backend
description: Maintain, debug, test, document, or extend the Duck Gene Lab self-hosted analytics backend, including its anonymous browser event collector, Node.js HTTP API, SQLite store, password-protected dashboard, CSV export, and Cloudflare Tunnel launcher. Use for this repository's analytics, admin dashboard, tracking, KPI, session, device, retention, privacy, or public-access work; do not use as generic Node.js guidance for unrelated projects.
---

# Duck Analytics Backend

Maintain the analytics system without weakening anonymous collection, data integrity, dashboard authentication, or the game's offline behavior.

## Inspect the relevant path first

- Read `public/game/analytics.js` for visitor/session IDs, event batching, heartbeats, active-time accounting, offline queueing, and consent opt-out.
- Read `public/game/game.js` for gameplay event integration.
- Read `server/app.mjs` for routing, validation, cookies, authentication, rate limits, CORS, CSV export, and static files.
- Read `server/analytics-store.mjs` for the SQLite schema, migrations, transactions, retention, and KPI queries.
- Read `server/index.mjs` for configuration and startup behavior.
- Read `public/admin/` for dashboard rendering and API consumption.
- Read `scripts/start-public-server.mjs` and the batch launchers for LAN or Cloudflare Tunnel access.
- Read `tests/analytics-server.test.mjs`, `docs/ANALYTICS_SERVER.md`, and `docs/ANALYTICS_DEVELOPMENT_REPORT.md` before changing externally visible behavior.

Load [references/schema-and-events.md](references/schema-and-events.md) when changing events, database fields, APIs, or KPI definitions.

## Preserve the privacy contract

- Collect anonymous random identifiers only. Do not add names, email addresses, phone numbers, advertising IDs, precise location, fingerprint hashes, or raw IP addresses.
- Keep visitor, session, play, and event IDs separate so repeat visits and plays can be counted without identifying a person.
- Keep the browser queue bounded at 250 events and batches bounded at 50 events unless tests and operational limits are revised together.
- Treat event IDs as idempotency keys. Duplicate delivery must not inflate counts.
- Update active duration monotonically with the largest observed value. Delayed heartbeats must never reduce a session's active time.
- Preserve `?analytics=off` as a local opt-out and avoid emitting events while it is enabled.
- Never commit `.env.analytics`, `data/`, SQLite databases, logs, PID files, or `.duck-public-url.txt`.

## Keep the collection boundary defensive

- Require authentication for every route that returns admin data or exports CSV.
- Keep the admin session cookie `HttpOnly`, `SameSite=Strict`, time-limited, HMAC-signed, and `Secure` when served through HTTPS.
- Use timing-safe comparisons for passwords and cookie signatures.
- Validate JSON body size, event names, identifier formats, timestamps, numeric ranges, payload shapes, and allowed origins before writing.
- Use parameterized SQLite statements and transactions. Never interpolate untrusted values into SQL.
- Render untrusted dashboard values with `textContent`, not `innerHTML`.
- Restrict static-file resolution to the intended public directories.
- Trust forwarding headers only when the process is actually behind a trusted proxy.
- Retain the collector's rate limits and add negative tests when widening any limit or accepted input.

## Route changes consistently

### Events or tracking

Update the browser emitter, server allowlist/validation, store projection, event reference, technical report, and integration tests together. Preserve the game when the collector is unavailable: analytics failures must stay non-blocking.

### Database or KPIs

Prefer additive, idempotent migrations. Document each new column/index and define numerator, denominator, time window, and timezone for every KPI. Recalculate summaries from the same source-of-truth queries used by detail tables or add reconciliation tests.

### Dashboard

Keep the dashboard mobile-first, readable without horizontal scrolling, keyboard accessible, and explicit about timezone and filters. Preserve session expiry handling and escape all returned data.

### Game integration

Follow the repository's `duck-gene-lab-development` skill. If a cached game asset changes, update both the service-worker cache name and the version query in `public/game/index.html`.

### Public access

Treat Quick Tunnel URLs as temporary. Do not write them into committed documentation. A stable hostname requires explicit Cloudflare authentication and DNS configuration; do not infer authorization for that external change.

## Verify changes

Run the narrowest checks while iterating, then finish with:

```powershell
npm run lint
npm test
npm run test:analytics
git diff --check
```

Also test the admin login, an unauthenticated `/api/admin/summary` request, ingestion of a valid batch, rejection of invalid events, CSV export, a narrow mobile viewport, and continued gameplay when the collector is offline. Confirm ignored runtime files before committing.

Only push, publish, create DNS records, or change external cloud state when the user explicitly requests it.
