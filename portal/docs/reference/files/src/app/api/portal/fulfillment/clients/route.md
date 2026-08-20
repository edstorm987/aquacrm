# `src/app/api/portal/fulfillment/clients/route.ts`

← [File index](../../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/portal/fulfillment/clients  Backs the "+ New client" modal on the agency home (src/app/portal/agency/_NewClientButton.tsx). Creates a client under the caller's active agency via the canonical createClient() in

## Exports (1)

- `async POST(req: NextRequest)`

## Depends on (9)

- [`src/lib/server/auth/auth.ts`](../../../../../lib/server/auth/auth.md)
- [`src/lib/server/clients/customerPortalProvisioning.ts`](../../../../../lib/server/clients/customerPortalProvisioning.md)
- [`src/server/activity.ts`](../../../../../server/activity.md)
- [`src/server/clientDelight.ts`](../../../../../server/clientDelight.md)
- [`src/server/clientPortalSetup.ts`](../../../../../server/clientPortalSetup.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)
- [`src/server/tradingCompanies.ts`](../../../../../server/tradingCompanies.md)
- [`src/server/types.ts`](../../../../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

