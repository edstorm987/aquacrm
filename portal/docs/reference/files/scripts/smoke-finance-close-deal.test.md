# `scripts/smoke-finance-close-deal.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Finance Phase 4a — the one-button "close the deal" (existing-client flavour).  One action → contract (sent) + invoice (issued) + routed payment. Driven against the real InvoiceService over an in-memory container, with the contract persistence + Stripe pay-link injected. Record + surface only.

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/tenancy.ts`](../src/built-ins/modules/agency-finance/src/lib/tenancy.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../src/built-ins/modules/agency-finance/src/server/foundationAdapter.md)
- [`src/built-ins/modules/agency-finance/src/server/ports.ts`](../src/built-ins/modules/agency-finance/src/server/ports.md)
- [`src/lib/clientContracts.ts`](../src/lib/clientContracts.md)
- [`src/lib/server/closeDeal.ts`](../src/lib/server/closeDeal.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

