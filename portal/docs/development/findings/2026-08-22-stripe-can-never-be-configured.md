# Finding — Stripe can never be configured; the error message points at a surface that does not exist

- **Status:** open
- **Severity:** high
- **Where:** `/portal/agency/agency-finance/settings`
- **Found:** 22 Aug 2026

## What I saw
The entire card-payment leg of finance is unreachable, and the two places that tell you
how to fix it send you somewhere that was never built.

**The chain.** The manifest declares `stripeSecretKey` and `stripeWebhookSecret` as
password fields in its `online-payments` settings group
(`src/built-ins/modules/agency-finance/index.ts`). But **no component anywhere renders a
plugin's `settings.groups`** — only `_validate.ts` and `_runtime.ts` reference them. The
sole `patchInstall` caller in `src/app` (`/api/portal/settings/route.ts`) writes only
currency, terms, tax and prefix. The finance Settings page renders install-state counts
and nothing else — verified by rendering it: *"Categories 6 · Draft invoices 0 · Plugin
id · Enabled"*.

**So `stripeConfigured()` is permanently false.** No pay-links. `invoices/checkout` and
`payments/refund` are unreachable by construction. And `readStripeKeysFromInstall` reads
only `install.config.stripeSecretKey` — it never consults the integrations vault's own
stripe mapping at `integrationConnections.ts:311`, so even a vault-connected Stripe does
not help.

**The dead end is user-visible.** `closeDeal.ts:64` and `stripe.ts:132` both tell the
operator to *"Set up Stripe in Finance settings"*. There is no such control. The docs
claim "Keys are Ed's (install config)" — there is no path to put them there.

**The fix, in shape.** Build the settings surface that renders whatever a plugin declares
in `settings.groups` and writes it. Secrets go through the encrypted vault path this
codebase already uses — never onto a record that reaches the client, and never echoed
back. Doing it generically means the next plugin's declared settings work for free
instead of repeating this.

**Test to pin it**
- Extend `src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts`, or add a
  settings-surface contract test: **every field id declared in a manifest's
  `settings.groups` must be writable through a real settings write path.** Today that
  test is red for both stripe fields — which is the point.

---
_Captured from the Dev Team portal. Findings are the input side: review them, turn them into a plan, hand the plan to a worker._
