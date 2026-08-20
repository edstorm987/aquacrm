# `scripts/smoke-finance-idempotency.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Finance — the shared money-CREATE idempotency guard (launch blocker).  The bug (auditor, tick-19 + the cross-cutting finding): every money-creating path minted a fresh id per call, so a double-click / retry recorded a SECOND record → money-in silently double-counted (and close-deal double-billed).  The fix, proven here: a client supplies a one-time idempotency key per intent; the record id is derived from it, so a resubmit lands on the SAME record. Two things must BOTH hold: 1. two rapid identical submits (sequential AND parallel) → exactly ONE record; 2. a genuine second/partial payment (a NEW key) on the same invoice → ALLOWED. Driven over the real Payment/Income services in an in-memory finance container. Record + surface only; the app never holds funds.

_No exported symbols (side-effect / internal module)._

## Depends on (7)

- [`src/built-ins/modules/agency-finance/src/api/handlers-r007.ts`](../src/built-ins/modules/agency-finance/src/api/handlers-r007.md)
- [`src/built-ins/modules/agency-finance/src/api/handlers.ts`](../src/built-ins/modules/agency-finance/src/api/handlers.md)
- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/idempotency.ts`](../src/built-ins/modules/agency-finance/src/lib/idempotency.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../src/built-ins/modules/agency-finance/src/lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../src/built-ins/modules/agency-finance/src/server/foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](../src/built-ins/modules/agency-finance/src/server/ports.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

