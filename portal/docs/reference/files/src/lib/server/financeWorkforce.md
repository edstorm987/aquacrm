# `src/lib/server/financeWorkforce.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `interface FinanceStaffOption (8 members)`
- `interface FinanceDepartmentOption (3 members)`
- `async listFinanceWorkforceOptions(agencyId: string): Promise<{ staff: FinanceStaffOption[]; departments: FinanceDepartmentOption[]; hrEnabled: boolean; }>`

## Depends on (3)

- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/server/people.ts`](../../server/people.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)

## Used by (2)

- [`src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx`](../../built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.md)
- [`src/built-ins/modules/agency-finance/src/pages/OperationsPage.tsx`](../../built-ins/modules/agency-finance/src/pages/OperationsPage.md)

