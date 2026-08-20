# `src/app/api/auth/magic/verify/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** GET /api/auth/magic/verify?token=...&return=/path Verifies the HMAC + TTL + single-use, looks up or auto-creates the end-customer for (clientId, email), issues an `lk_session_v1` cookie scoped to (agencyId, clientId, role: end-customer), then redirects.  Auto-create: if the magic token's email isn't yet a registered end- customer and the client allows signups, we create the user on the fly. The token itself was the proof of email ownership.

## Exports (1)

- `async GET(req: NextRequest)`

## Depends on (7)

- [`src/lib/server/auth/auth.ts`](../../../../../lib/server/auth/auth.md)
- [`src/lib/server/auth/magicLink.ts`](../../../../../lib/server/auth/magicLink.md)
- [`src/lib/server/auth/postLoginRedirect.ts`](../../../../../lib/server/auth/postLoginRedirect.md)
- [`src/server/activity.ts`](../../../../../server/activity.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)
- [`src/server/users.ts`](../../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

