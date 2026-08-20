# `src/server/agencyBootstrap.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `interface BootstrapAgencyResult (2 members)`
- `interface AgencyHoldingLink (2 members)`
- `listHeldCompanyPortals(holdingAgencyId: string): Agency[]`
- `getCompanyPortalAgency(holdingAgencyId: string, companyId: string): Agency | null`
- `async bootstrapAgency(input: CreateAgencyInput, installedBy?: string, holding?: AgencyHoldingLink): Promise<BootstrapAgencyResult>`

## Depends on (6)

- [`src/built-ins/runtime/_runtime.ts`](../built-ins/runtime/_runtime.md)
- [`src/server/activity.ts`](./activity.md)
- [`src/server/pipelines.ts`](./pipelines.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (10)

- [`scripts/smoke-company-portal.test.ts`](../../scripts/smoke-company-portal.test.md)
- [`scripts/smoke-website-signup-lead.test.ts`](../../scripts/smoke-website-signup-lead.test.md)
- [`src/app/api/auth/oauth/google/callback/route.ts`](../app/api/auth/oauth/google/callback/route.md)
- [`src/app/api/auth/signup/route.ts`](../app/api/auth/signup/route.md)
- [`src/app/api/portal/agency/companies/[companyId]/portal/route.ts`](../app/api/portal/agency/companies/[companyId]/portal/route.md)
- [`src/archive/multi-agency/api/agency-add.ts`](../archive/multi-agency/api/agency-add.md)
- [`src/lib/server/auth/showcaseMode.ts`](../lib/server/auth/showcaseMode.md)
- [`src/lib/server/seeds/aquaOasisSeed.ts`](../lib/server/seeds/aquaOasisSeed.md)
- [`src/lib/server/seeds/demoSeed.ts`](../lib/server/seeds/demoSeed.md)
- [`src/lib/server/seeds/founderSeed.ts`](../lib/server/seeds/founderSeed.md)

