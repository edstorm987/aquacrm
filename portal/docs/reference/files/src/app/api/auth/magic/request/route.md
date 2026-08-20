# `src/app/api/auth/magic/request/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/auth/magic/request — body { email, clientId } Issues a 15-min single-use HMAC token and either delivers it via the registered MagicLinkDelivery hook (T2 R10's email-sender) or logs it to the server console (dev fallback).  Security: response shape is constant (`ok:true, sent:true`) for any not-disabled client to avoid leaking whether an email exists. Only the per-client `signupsEnabled === false` flag returns 403 — we want the operator to know that path is closed.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (4)

- [`src/lib/server/magicLink.ts`](../../../../../lib/server/magicLink.md)
- [`src/lib/server/rateLimit.ts`](../../../../../lib/server/rateLimit.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

