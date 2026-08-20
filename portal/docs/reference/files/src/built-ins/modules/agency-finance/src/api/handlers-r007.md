# `src/built-ins/modules/agency-finance/src/api/handlers-r007.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R007 handlers — Payments / Plans / P&L. Kept in a sibling file so the original handlers.ts stays small and reviewable.

## Exports (9)

- `async listPaymentsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createPaymentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listIncomeHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createIncomeHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listPlansHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createPlanHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updatePlanHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async assignPlanHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async pnlSummaryHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/lib/server/financeCurrency.ts`](../../../../../lib/server/financeCurrency.md)

## Used by (2)

- [`scripts/smoke-finance-idempotency.test.ts`](../../../../../../scripts/smoke-finance-idempotency.test.md)
- [`src/built-ins/modules/agency-finance/src/api/routes.ts`](./routes.md)

