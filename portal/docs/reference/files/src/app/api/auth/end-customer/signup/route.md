# `src/app/api/auth/end-customer/signup/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/auth/end-customer/signup — register a new end-customer for a specific client of the agency.  Body: { clientId, email, password, name? }  Behaviour: 1. Resolve clientId → Client; 404 if missing or archived. 2. Refuse if `client.endCustomers.signupsEnabled === false`. 3. Per-IP + per-email rate limit (mirrors /api/auth/login). 4. Per-(client, email) uniqueness — two different clients of the same agency may both have a customer named jane@gmail.com (per 03-architecture §1). Backed by `users.ts`'s scoped key shape. 5. createUser({ role: "end-customer", agencyId, clientId, … }). 6. Issue an `lk_session_v1` cookie carrying (agencyId, clientId, role: "end-customer"). No `isDemo` flag — that's reserved for sessions issued via /demo. 7. Return { ok: true, user, returnUrl? }.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (6)

- [`src/lib/server/auth.ts`](../../../../../lib/server/auth.md)
- [`src/lib/server/rateLimit.ts`](../../../../../lib/server/rateLimit.md)
- [`src/server/activity.ts`](../../../../../server/activity.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)
- [`src/server/users.ts`](../../../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

