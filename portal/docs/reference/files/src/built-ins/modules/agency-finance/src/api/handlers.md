# `src/built-ins/modules/agency-finance/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** HTTP handlers for the agency-finance plugin.

## Exports (18)

- `async listInvoicesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async markInvoicePaidHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async downloadInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async invoiceTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listExpensesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async approveExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async rejectExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async reimburseExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async postRecurringExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listCategoriesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createCategoryHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateCategoryHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async reportHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (5)

- [`src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-finance/src/lib/currencies.ts`](../lib/currencies.md)
- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/lib/server/financeCurrency.ts`](../../../../../lib/server/financeCurrency.md)

## Used by (2)

- [`scripts/smoke-finance-idempotency.test.ts`](../../../../../../scripts/smoke-finance-idempotency.test.md)
- [`src/built-ins/modules/agency-finance/src/api/routes.ts`](./routes.md)

