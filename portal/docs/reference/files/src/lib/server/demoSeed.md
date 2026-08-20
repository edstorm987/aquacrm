# `src/lib/server/seeds/demoSeed.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (26)

- `DEMO_AGENCY_SLUG`
- `DEMO_AGENCY_NAME`
- `DEMO_OWNER_EMAIL`
- `DEMO_OWNER_PASSWORD`
- `DEMO_STAFF_EMAIL`
- `DEMO_STAFF_PASSWORD`
- `DEMO_STAFF_NAME`
- `DEMO_CLIENT_SLUG`
- `DEMO_CLIENT_NAME`
- `DEMO_CLIENT_EMAIL`
- `DEMO_CLIENT_PASSWORD`
- `DEMO_CUSTOMER_EMAIL`
- `DEMO_CUSTOMER_PASSWORD`
- `DEMO_CUSTOMER_NAME`
- `DEMO_FREELANCER_EMAIL`
- `DEMO_FREELANCER_PASSWORD`
- `DEMO_FREELANCER_NAME`
- `interface SeedDemoResult (10 members)`
- `async seedDemoAgency(actor?: string): Promise<SeedDemoResult>`
- `interface ResetDemoResult (3 members)`
- `async resetDemo(): Promise<ResetDemoResult>`
- `ensureDemoStaffEmployee(agencyId: string, actor?: string): void`
- `ensureDemoFreelancer(agencyId: string): void`
- `ensureDemoCustomerReady(agencyId: string): void`
- `interface DemoTenantSnapshot (5 members)`
- `getDemoSnapshot(): DemoTenantSnapshot | null`

## Depends on (11)

- [`src/built-ins/runtime/_runtime.ts`](../../built-ins/runtime/_runtime.md)
- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/server/activity.ts`](../../server/activity.md)
- [`src/server/agencyBootstrap.ts`](../../server/agencyBootstrap.md)
- [`src/server/people.ts`](../../server/people.md)
- [`src/server/phases.ts`](../../server/phases.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/tenants.ts`](../../server/tenants.md)
- [`src/server/types.ts`](../../server/types.md)
- [`src/server/users.ts`](../../server/users.md)

## Used by (3)

- [`scripts/smoke-dev-mode.test.ts`](../../../scripts/smoke-dev-mode.test.md)
- [`src/app/api/auth/dev-mode/route.ts`](../../app/api/auth/dev-mode/route.md)
- [`src/app/api/auth/preview-as-client-at-phase/route.ts`](../../app/api/auth/preview-as-client-at-phase/route.md)

