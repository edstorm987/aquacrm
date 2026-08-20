# `src/built-ins/modules/memberships/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the memberships plugin.  Same discipline as fulfillment / ecommerce / agency-hr: every reach into the foundation goes through one of these interfaces. T1 binds concrete implementations at boot via `registerMembershipsFoundation` and the plugin sees only the typed surface.  Memberships needs more ports than agency-HR because it (a) talks to Stripe via per-install keys and (b) needs to resolve end-customer identities to drive the customer-facing pages. The Stripe surface is declared here as `StripePort` rather than imported from the ecommerce package — the prompt's preferred decoupled default. T1 brokers by reading per-install Stripe keys from the ecommerce install (same agencyId+clientId scope) and constructing a Stripe client per request, then handing it to the memberships container.

## Exports (21)

- `interface StoragePort (4 members)`
- `interface TenantPort (2 members)`
- `interface UserPort (2 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type MembershipEventName`
- `interface EventBusPort (1 members)`
- `interface PluginInstallStorePort (1 members)`
- `interface StripeCustomerInput (3 members)`
- `interface StripeCustomer (2 members)`
- `interface StripeSubscriptionInput (4 members)`
- `interface StripeSubscription (7 members)`
- `interface StripeCheckoutSessionInput (7 members)`
- `interface StripeCheckoutSession (2 members)`
- `interface StripeBillingPortalInput (2 members)`
- `interface StripeBillingPortalSession (2 members)`
- `interface StripePriceInput (5 members)`
- `interface StripePrice (2 members)`
- `interface StripeWebhookEvent (4 members)`
- `interface StripePort (12 members)`

## Depends on (1)

- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (8)

- [`src/built-ins/modules/memberships/src/__smoke__/memberships.test.ts`](../__smoke__/memberships.test.md)
- [`src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/memberships/src/server/benefits.ts`](./benefits.md)
- [`src/built-ins/modules/memberships/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/memberships/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/memberships/src/server/plans.ts`](./plans.md)
- [`src/built-ins/modules/memberships/src/server/subscriptions.ts`](./subscriptions.md)
- [`src/built-ins/modules/memberships/src/server/webhook.ts`](./webhook.md)

