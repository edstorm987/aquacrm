# `src/server/phaseApplier.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (3)

- `interface ApplyResult (6 members)`
- `interface ApplyError (2 members)`
- `async applyPhaseToClient(clientId: string, phaseId: string, agencyId: string): Promise<ApplyResult | ApplyError>`

## Depends on (2)

- [`src/server/phases.ts`](./phases.md)
- [`src/server/tenants.ts`](./tenants.md)

## Used by (2)

- [`scripts/smoke-app-route-tenancy.test.ts`](../../scripts/smoke-app-route-tenancy.test.md)
- [`src/app/api/portal/phases/apply/route.ts`](../app/api/portal/phases/apply/route.md)

