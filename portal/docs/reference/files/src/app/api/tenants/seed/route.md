# `src/app/api/tenants/seed/route.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev-only seed endpoint.  POST /api/tenants/seed seeds a Milesy Media agency + owner + Felicia client + a sample client-owner user, when the store is empty. Useful for `npm run dev` smoke tests. Returns 403 in production unless the caller already has a session.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (5)

- [`src/lib/server/auth/auth.ts`](../../../../lib/server/auth/auth.md)
- [`src/server/activity.ts`](../../../../server/activity.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../server/tenants.md)
- [`src/server/users.ts`](../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

