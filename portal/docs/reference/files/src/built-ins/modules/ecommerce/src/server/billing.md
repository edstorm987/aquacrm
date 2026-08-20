# `src/built-ins/modules/ecommerce/src/server/billing.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Per-install billing helpers.  Lifted from `02 felicias aqua portal work/src/portal/server/billing.ts` and rewired: - `orgId` → `clientId` (ecommerce installs are per-client) - PLANS registry stays as data — agencies can define their own plan tiers for their client portals - Subscription state lives on the per-install storage slice rather than `org.subscription`  **Vestigial** — see chapter §"Vestigial state". The 02 implementation gates Aqua's own SaaS features by org plan; in 04 every agency picks the features they offer their clients via the per-install settings on each plugin. This module is preserved for shape compatibility while the chief commander decides whether to retain it or move to a future `@aqua/plugin-saas-billing`.

## Exports (6)

- `type PlanId`
- `interface Plan (4 members)`
- `type SubscriptionStatus`
- `interface Subscription (7 members)`
- `PLANS: Record<PlanId, Plan>`
- `class BillingService`
    - `constructor(private storage: StoragePort)`
    - `listPlans(): Plan[]`
    - `getPlan(id: PlanId): Plan | undefined`
    - `async getSubscription(clientId: ClientId): Promise<Subscription | null>`
    - `async setSubscription(clientId: ClientId, planId: PlanId, status: SubscriptionStatus = "active"): Promise<Subscription>`
    - `async cancelSubscription(clientId: ClientId): Promise<Subscription | null>`
    - `async hasFeature(clientId: ClientId, flag: string): Promise<boolean>`
    - `async listFeatures(clientId: ClientId): Promise<string[]>`

## Depends on (3)

- [`src/built-ins/modules/ecommerce/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/ecommerce/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)

