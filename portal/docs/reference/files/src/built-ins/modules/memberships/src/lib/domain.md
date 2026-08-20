# `src/built-ins/modules/memberships/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Memberships domain types. Persisted under per-install plugin storage.  All three entities scope to (agencyId, clientId): a Plan defined for Felicia's store doesn't appear in another client's store. Per-end- customer subscriptions add `endCustomerUserId` (foundation Users).  Currency is stored as ISO 4217 strings. Prices are integer cents (£12.50 → 1250) — never use floats for money.

## Exports (16)

- `type Currency`
- `type PlanStatus`
- `interface Plan (17 members)`
- `interface CreatePlanInput (9 members)`
- `interface UpdatePlanPatch (12 members)`
- `type BenefitCategory`
- `type BenefitStatus`
- `interface Benefit (11 members)`
- `interface CreateBenefitInput (5 members)`
- `interface UpdateBenefitPatch (6 members)`
- `type SubscriptionStatus`
- `type Billing`
- `interface Subscription (14 members)`
- `interface SubscribeInput (5 members)`
- `interface CancelInput (2 members)`
- `interface WebhookEventSeen (3 members)`

## Depends on (1)

- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](./tenancy.md)

## Used by (12)

- [`src/built-ins/modules/memberships/index.ts`](../../index.md)
- [`src/built-ins/modules/memberships/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/memberships/src/components/BenefitsList.tsx`](../components/BenefitsList.md)
- [`src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx`](../components/MyMembershipPanel.md)
- [`src/built-ins/modules/memberships/src/components/NewPlanModal.tsx`](../components/NewPlanModal.md)
- [`src/built-ins/modules/memberships/src/components/PlansList.tsx`](../components/PlansList.md)
- [`src/built-ins/modules/memberships/src/components/SubscribersList.tsx`](../components/SubscribersList.md)
- [`src/built-ins/modules/memberships/src/pages/PlansPage.tsx`](../pages/PlansPage.md)
- [`src/built-ins/modules/memberships/src/server/benefits.ts`](../server/benefits.md)
- [`src/built-ins/modules/memberships/src/server/plans.ts`](../server/plans.md)
- [`src/built-ins/modules/memberships/src/server/subscriptions.ts`](../server/subscriptions.md)
- [`src/built-ins/modules/memberships/src/server/webhook.ts`](../server/webhook.md)

