# `src/archive/multi-agency/api/agency-switch.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** Archived endpoint: flip the session's activeAgencyId. T1 R026 (chapter `04-topbar-agency-switcher.md`).  Body: { agencyId: string } Validates: session present + session.agencyIds includes agencyId. Re-issues the session cookie with `activeAgencyId: agencyId` and `agencyId` mirror updated. Returns `{ ok, redirect }` so the client can route per chapter #125 R022.

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (6)

- [`src/lib/server/auth.ts`](../../../lib/server/auth.md)
- [`src/lib/server/postLoginRedirect.ts`](../../../lib/server/postLoginRedirect.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/users.ts`](../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

