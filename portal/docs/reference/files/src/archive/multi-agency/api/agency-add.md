# `src/archive/multi-agency/api/agency-add.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Archived endpoint: create a new agency + add the current user as a master member + flip the session's activeAgencyId to the new tenant. Backs the AgencySwitcher's "Add new agency" form (Ed's directive 2026-05-07 — agency-name title button + add tenants from the UI).  Body: { name: string, slug?: string } Slug is auto-derived from name when omitted; clashes return 409. Idempotent on slug — re-submitting same name finds the existing agency, joins the user if not already a member, and switches.  Founders only — agency creation is a master-side privilege.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (8)

- [`src/lib/server/aquaOasisSeed.ts`](../../../lib/server/aquaOasisSeed.md)
- [`src/lib/server/auth.ts`](../../../lib/server/auth.md)
- [`src/lib/server/postLoginRedirect.ts`](../../../lib/server/postLoginRedirect.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/agencyBootstrap.ts`](../../../server/agencyBootstrap.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/users.ts`](../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

