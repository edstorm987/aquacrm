# `src/built-ins/modules/affiliates/src/server/onboarding.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Stripe Connect onboarding service for affiliates (R12).  Three operations: start (create Connect account + AccountLink), refreshStatus (re-read Stripe + persist), and snapshotToStatus (translate Stripe's `chargesEnabled / payoutsEnabled / detailsSubmitted` triplet into our 3-state `stripeOnboardingStatus`).  Idempotency on `start`: if the affiliate already has a stripeAccountId we re-issue an AccountLink against the existing account rather than creating a second connected account (Stripe charges per-account on some plans + Felicia's affiliate would otherwise see two accounts).

## Exports (4)

- `interface StartStripeOnboardingArgs (3 members)`
- `interface StartStripeOnboardingResult (3 members)`
- `class OnboardingService`
    - `constructor(private agencyId: AgencyId, private clientId: ClientId, private activity: ActivityLogPort, private events: EventBusPort, private affiliates: AffiliateService, private stripe: StripeConnectPort)`
    - `async start(input: StartStripeOnboardingArgs, actor: UserId): Promise<StartStripeOnboardingResult>`
    - `async refreshStatus(affiliateId: string, actor?: UserId): Promise<Affiliate | null>`
    - `async applySnapshotForAccount(accountId: string, snapshot: StripeConnectAccountSnapshot): Promise<Affiliate | null>`
- `snapshotToStatus(snapshot: StripeConnectAccountSnapshot): StripeOnboardingStatus`

## Depends on (5)

- [`src/built-ins/modules/affiliates/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/affiliates/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/affiliates/src/server/affiliates.ts`](./affiliates.md)
- [`src/built-ins/modules/affiliates/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)

