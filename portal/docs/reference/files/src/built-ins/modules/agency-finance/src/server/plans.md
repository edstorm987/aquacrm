# `src/built-ins/modules/agency-finance/src/server/plans.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** PlanService — recurring plan tiers + per-client assignment. R007 addition.  Storage layout: plans/index               → string[] of plan ids plans/by-id/<id>          → Plan plans/by-client/<cid>     → string (single plan id)  // v1: 1 plan/client

## Exports (1)

- `class PlanService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(includeInactive = false): Promise<Plan[]>`
    - `async get(id: string): Promise<Plan | null>`
    - `async getForClient(clientId: ClientId): Promise<Plan | null>`
    - `async create(actor: UserId, input: CreatePlanInput): Promise<Plan>`
    - `async update(actor: UserId, id: string, patch: UpdatePlanPatch): Promise<Plan>`
    - `async assignClient(actor: UserId, clientId: ClientId, planId: string | null): Promise<void>`

## Depends on (6)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/agency-finance/src/server/rowIndex.ts`](./rowIndex.md)

## Used by (2)

- [`src/built-ins/modules/agency-finance/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-finance/src/server/pnl.ts`](./pnl.md)

