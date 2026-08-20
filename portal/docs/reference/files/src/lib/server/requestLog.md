# `src/lib/server/requestLog.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Request log helper (T1 R030 — chapter `04-observability.md`).  Lightweight JSON-line stdout logger for HTTP requests. Designed to be called from route handlers (or wrapped via `withRequestLog`) rather than running as a Next.js middleware on every request — the project's existing middleware.ts is matcher-scoped to `/embed/...` and broadening it would log every static asset and healthcheck. Mass instrumentation is deferred to incremental adoption.  Output shape: {"t":"req","ts":<epoch-ms>,"method":"GET","path":"/portal/agency", "status":200,"durationMs":42,"userId":"usr_…","agencyId":"agency_…"}  One JSON object per stdout line so log aggregators (Vercel Logs / Datadog / Loki) parse cleanly. Skips configured high-volume paths so the default invocation doesn't drown the channel.  No `server-only` shim so the smoke can drive shape under tsx --test.

## Exports (5)

- `interface RequestLogEntry (8 members)`
- `shouldSkipRequestLog(path: string): boolean`
- `formatRequestLog(entry: RequestLogEntry, now = Date.now()): string`
- `logRequest(entry: RequestLogEntry): void`
- `withRequestLog(handler: Handler, opts: { route?: string; tag?: TagFn } = {}): Handler`

## Used by (1)

- [`scripts/smoke-observability.test.ts`](../../../scripts/smoke-observability.test.md)

