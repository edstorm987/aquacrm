# `src/app/api/internal/sweep/route.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** GET /api/internal/sweep — founder-gated diagnostic that prunes expired rate-limit + login-failure records and reports counts. R021 Goal D.  Sessions are stateless HMAC tokens — they auto-expire on verify. There is no session-list to prune (chapter #68 honesty). The sweep covers the in-memory stores that DO accumulate: the rateLimit bucket map and the login-failure lockout map.

## Exports (1)

- `async GET()`

## Depends on (5)

- [`src/lib/server/auth.ts`](../../../../lib/server/auth.md)
- [`src/lib/server/inboxService.ts`](../../../../lib/server/inboxService.md)
- [`src/lib/server/rateLimit.ts`](../../../../lib/server/rateLimit.md)
- [`src/server/automations.ts`](../../../../server/automations.md)
- [`src/server/storage.ts`](../../../../server/storage.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

