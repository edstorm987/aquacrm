# `src/built-ins/modules/agency-finance/src/lib/idempotency.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Shared idempotency for the finance money-CREATE surface.  The problem: every create path (payments, income, plans, invoices, payroll, close-deal) minted a fresh `makeId(...)` on every call, so a double-click or a network retry recorded a SECOND record → money silently double-counted.  The mechanism — one, reused everywhere: a caller supplies a one-time idempotency key per *intent*, and the record's id is DERIVED from that key instead of random. Same key → same id → the second write lands on the same storage slot and overwrites, so it can never become a duplicate row — even if two submits race in parallel (a plain "have I seen this key?" check races between its read and its write; a deterministic id does not). This reuses the exact "stable reference" idea the Stripe path already relies on (`findByExternalRef` dedupes a redelivered webhook on the PaymentIntent; the delight wire dedupes on `reference: delight:<id>`) — generalised to the whole create-surface, not a parallel scheme.  The nuance it MUST preserve: recording *multiple* payments against one invoice is legitimate (partial payments). A genuine second payment is a new intent → a new key → a new id → recorded normally. Dedup only ever collapses a resubmit of the SAME key. No time window, no (invoice, amount) guessing — so two honest identical instalments are never wrongly merged.

## Exports (2)

- `normaliseIdempotencyKey(key: string | undefined | null): string | undefined`
- `deriveRecordId(prefix: string, idempotencyKey?: string | null): string`

## Depends on (1)

- [`src/built-ins/modules/agency-finance/src/lib/ids.ts`](./ids.md)

## Used by (8)

- [`scripts/smoke-finance-idempotency.test.ts`](../../../../../../scripts/smoke-finance-idempotency.test.md)
- [`scripts/smoke-finance-stripe.test.ts`](../../../../../../scripts/smoke-finance-stripe.test.md)
- [`src/built-ins/modules/agency-finance/src/server/income.ts`](../server/income.md)
- [`src/built-ins/modules/agency-finance/src/server/invoices.ts`](../server/invoices.md)
- [`src/built-ins/modules/agency-finance/src/server/operations.ts`](../server/operations.md)
- [`src/built-ins/modules/agency-finance/src/server/payments.ts`](../server/payments.md)
- [`src/built-ins/modules/agency-finance/src/server/plans.ts`](../server/plans.md)
- [`src/lib/server/closeDeal.ts`](../../../../../lib/server/closeDeal.md)

