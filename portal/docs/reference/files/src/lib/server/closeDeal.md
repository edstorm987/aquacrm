# `src/lib/server/closeDeal.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** The one-button "close the deal" orchestration (existing-client flavour).  In a sale you want ONE action that, in the meeting, produces the whole close: a contract, an issued invoice, and a routed payment — stitched and tracked. This is the pure orchestration; the route (api/tenants/close-deal) wires the real persistence + Stripe, and it's unit-testable with injected deps.  SAFETY: record + route + surface only. The money still flows client → Ed's own Stripe/bank/cash directly; the app never holds funds. (Lead → client conversion — the leads-pipeline flavour — is a separate, flagged follow-up.)

## Exports (4)

- `interface CloseDealInput (8 members)`
- `interface CloseDealDeps (8 members)`
- `interface CloseDealResult (6 members)`
- `async closeDealForClient(input: CloseDealInput, deps: CloseDealDeps): Promise<CloseDealResult>`

## Depends on (5)

- [`src/built-ins/modules/agency-finance/src/lib/channels.ts`](../../built-ins/modules/agency-finance/src/lib/channels.md)
- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../../built-ins/modules/agency-finance/src/lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../../built-ins/modules/agency-finance/src/lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](../../built-ins/modules/agency-finance/src/server/index.md)
- [`src/lib/clientContracts.ts`](../clientContracts.md)

## Used by (2)

- [`scripts/smoke-finance-close-deal.test.ts`](../../../scripts/smoke-finance-close-deal.test.md)
- [`src/app/api/tenants/close-deal/route.ts`](../../app/api/tenants/close-deal/route.md)

