# `src/lib/server/requireAgencyScope.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** R023 — `lead` role boundary helper.  Most route handlers assume `session.agencyId` resolves to a real agency record. Leads are global tenants (no agency) — they should never reach those handlers. This helper centralises the 403 so callers can drop one line at the top of any agency-scoped endpoint:  const session = await requireSession(); requireAgencyScope(session);    // throws 403 for lead role  Pairs with `requireRole` — that gates by allowed-role list, this gates by whether the session has any agency scope at all.

## Exports (2)

- `isAgencyScopedSession(session: SessionPayload): boolean`
- `requireAgencyScope(session: SessionPayload): void`

## Depends on (2)

- [`src/lib/server/auth.ts`](./auth.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

