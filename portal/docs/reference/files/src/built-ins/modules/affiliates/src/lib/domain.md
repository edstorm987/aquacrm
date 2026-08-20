# `src/built-ins/modules/affiliates/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Affiliates domain. Persisted under per-install plugin storage.  Scope: per-client. Felicia's affiliate pool isn't shared with other agency clients. `endCustomerUserId` is the foundation Users.id of the end-customer who signed up to refer; it's the affiliate's portal identity.

## Exports (20)

- `type AffiliateStatus`
- `interface Affiliate (16 members)`
- `type StripeOnboardingStatus`
- `interface CreateAffiliateInput (4 members)`
- `interface UpdateAffiliatePatch (6 members)`
- `type ReferralCodeStatus`
- `interface ReferralCode (10 members)`
- `interface CreateReferralCodeInput (4 members)`
- `interface UpdateReferralCodePatch (3 members)`
- `type AttributionStatus`
- `interface Attribution (14 members)`
- `type PayoutStatus`
- `type PayoutMethod`
- `interface Payout (13 members)`
- `interface SchedulePayoutInput (3 members)`
- `interface MarkPayoutPaidInput (2 members)`
- `interface AffiliateFilter (2 members)`
- `interface ReferralCodeFilter (3 members)`
- `interface AttributionFilter (3 members)`
- `interface PayoutFilter (2 members)`

## Depends on (1)

- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](./tenancy.md)

## Used by (11)

- [`src/built-ins/modules/affiliates/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/affiliates/src/components/AffiliatesList.tsx`](../components/AffiliatesList.md)
- [`src/built-ins/modules/affiliates/src/components/AttributionsList.tsx`](../components/AttributionsList.md)
- [`src/built-ins/modules/affiliates/src/components/CodesList.tsx`](../components/CodesList.md)
- [`src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx`](../components/MyAffiliatePanel.md)
- [`src/built-ins/modules/affiliates/src/components/PayoutsList.tsx`](../components/PayoutsList.md)
- [`src/built-ins/modules/affiliates/src/server/affiliates.ts`](../server/affiliates.md)
- [`src/built-ins/modules/affiliates/src/server/attributions.ts`](../server/attributions.md)
- [`src/built-ins/modules/affiliates/src/server/codes.ts`](../server/codes.md)
- [`src/built-ins/modules/affiliates/src/server/onboarding.ts`](../server/onboarding.md)
- [`src/built-ins/modules/affiliates/src/server/payouts.ts`](../server/payouts.md)

