# `src/app/healthz/route.ts`

← [File index](../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** `/healthz` — lightweight liveness probe.  Used by: 1. The ops plugin's hourly cron (sample → UptimeStore). 2. External monitors (Vercel deploy checks, Pingdom, etc.).  Returns the build SHA (when available) + the runtime env so a monitor can detect rollbacks. NEVER touches the database — a healthz that depends on Postgres is a false-positive when the app is up but Postgres is paged. A separate `/healthz/full` could probe storage in a later round if Ed needs it.

## Exports (3)

- `dynamic`
- `revalidate`
- `GET(): NextResponse`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

