# `src/app/api/auth/csrf/route.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** GET /api/auth/csrf — issue a CSRF token (cookie + body) for double-submit. R021. Forms fetch this on mount, then echo `token` in `x-csrf-token` header on subsequent state-changing requests.

## Exports (1)

- `async GET()`

## Depends on (1)

- [`src/lib/server/csrf.ts`](../../../../lib/server/csrf.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

