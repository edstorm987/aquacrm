# `src/app/api/tenants/close-deal/route.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** POST /api/tenants/close-deal — the one-button "close the deal" for an existing client. One action → contract (sent) + invoice (issued) + routed payment (Stripe pay-link, or a manual bank/cash intent). Thin wiring around the tested orchestration in `@/lib/server/closeDeal`.  SAFETY: record + route + surface only — money flows to Ed's own Stripe/bank/ cash directly; the app never holds funds. (Lead → client conversion is a separate, flagged follow-up that touches leads-pipeline.)

## Exports (1)

- `async POST(request: Request)`

## Depends on (16)

- [`src/built-ins/modules/agency-finance/src/lib/channels.ts`](../../../../built-ins/modules/agency-finance/src/lib/channels.md)
- [`src/built-ins/modules/agency-finance/src/lib/currencies.ts`](../../../../built-ins/modules/agency-finance/src/lib/currencies.md)
- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../../../../built-ins/modules/agency-finance/src/lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/lib/stripe.ts`](../../../../built-ins/modules/agency-finance/src/lib/stripe.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../../../../built-ins/modules/agency-finance/src/server/foundationAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/agencyFinanceFoundation.ts`](../../../../built-ins/runtime/foundation-adapters/agencyFinanceFoundation.md)
- [`src/lib/clients/clientContracts.ts`](../../../../lib/clients/clientContracts.md)
- [`src/lib/server/auth/auth.ts`](../../../../lib/server/auth/auth.md)
- [`src/lib/server/closeDeal.ts`](../../../../lib/server/closeDeal.md)
- [`src/lib/server/pluginStorage.ts`](../../../../lib/server/pluginStorage.md)
- [`src/lib/server/plugins/pluginSecretConfig.ts`](../../../../lib/server/plugins/pluginSecretConfig.md)
- [`src/server/activity.ts`](../../../../server/activity.md)
- [`src/server/pluginInstalls.ts`](../../../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../server/tenants.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

