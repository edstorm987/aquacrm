# `scripts/smoke-plugin-settings-surface.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The generic plugin settings surface.  Finding 2026-08-22 "Stripe can never be configured": agency-finance declared `stripeSecretKey` and `stripeWebhookSecret` as password fields in its manifest, and NO component anywhere rendered a plugin's `settings.groups`. The only `patchInstall` caller in `src/app` wrote four hardcoded finance keys. So `stripeConfigured()` was permanently false, `invoices/checkout` and `payments/refund` were unreachable by construction, and `closeDeal.ts` plus `stripe.ts` both told the operator to "Set up Stripe in Finance settings" — a control that had never been built.  The contract the finding asked for, verbatim: **every field id declared in a manifest's `settings.groups` must be writable through a real settings write path.** That test was red for both stripe fields; it is the first case below and it now runs over EVERY registered plugin, not just finance.  The rest pin the part that is easy to get wrong once a form exists: a secret must never come back out. Not in the describe payload, not on the install record that page props hand to the browser, not in the activity log.

_No exported symbols (side-effect / internal module)._

## Depends on (8)

- [`src/built-ins/modules/agency-finance/src/lib/stripe.ts`](../src/built-ins/modules/agency-finance/src/lib/stripe.md)
- [`src/built-ins/runtime/_registry.ts`](../src/built-ins/runtime/_registry.md)
- [`src/built-ins/runtime/_validate.ts`](../src/built-ins/runtime/_validate.md)
- [`src/lib/server/plugins/pluginSecretConfig.ts`](../src/lib/server/plugins/pluginSecretConfig.md)
- [`src/lib/server/plugins/pluginSettingsSurface.ts`](../src/lib/server/plugins/pluginSettingsSurface.md)
- [`src/server/pluginInstalls.ts`](../src/server/pluginInstalls.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

