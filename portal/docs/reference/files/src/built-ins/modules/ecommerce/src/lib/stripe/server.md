# `src/built-ins/modules/ecommerce/src/lib/stripe/server.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Server-only Stripe client.  Lifted from `02 felicias aqua portal work/src/lib/stripe/server.ts` and refactored to take API keys per call (or via a small Stripe container) instead of reading `process.env`. Per-install config:  install.config = { stripeSecretKey: "sk_test_…", stripeWebhookSecret: "whsec_…", stripePublishableKey: "pk_test_…", ... }  The plugin manifest's setup wizard collects these on first install.

## Exports (11)

- `interface StripeKeys (2 members)`
- `interface StripeLineItem (6 members)`
- `interface CheckoutSessionInput (6 members)`
- `interface CheckoutSessionResult (2 members)`
- `async createCheckoutSession(keys: StripeKeys, input: CheckoutSessionInput): Promise<CheckoutSessionResult>`
- `async constructWebhookEvent(keys: StripeKeys, rawBody: string, signature: string): Promise<unknown>`
- `interface BillingPortalInput (3 members)`
- `interface BillingPortalResult (1 members)`
- `async createBillingPortalSession(keys: StripeKeys, input: BillingPortalInput): Promise<BillingPortalResult>`
- `interface InstallStripeConfig (6 members)`
- `readStripeKeysFromInstall(config: Record<string, unknown>): StripeKeys`

## Used by (1)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../../api/handlers.md)

