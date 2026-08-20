# `src/app/healthz/full/route.ts`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** `/healthz/full` — deep health probe (T1 R030 — chapter `04-observability.md`).  Distinct from `/healthz` (lightweight liveness — never touches the DB; "the app is up" is a different signal from "durable storage is up"). The full probe touches storage + plugin registry + reports uptime.  Returns: 200 { ok: true, db: "connected"|"untested", plugins, uptime, sha, env, ts } 503 { ok: false, db: "down", error, plugins?, uptime, sha, env, ts }  Used by: - Production deploy gate ("smoke 200 across all surfaces" per chapter #124 ship gate). - Operator dashboard / Sentry health monitor.  Lightweight: either a single `SELECT 1` against Postgres or a one-row Supabase datastore read. Local file-backed runs report `db: "untested"` rather than fabricating a green light (chapter #68 honesty).

## Exports (3)

- `dynamic`
- `revalidate`
- `async GET(): Promise<NextResponse>`

## Depends on (3)

- [`src/lib/server/databaseStorageHealth.ts`](../../../lib/server/databaseStorageHealth.md)
- [`src/lib/server/productionReadiness.ts`](../../../lib/server/productionReadiness.md)
- [`src/server/storage.ts`](../../../server/storage.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

