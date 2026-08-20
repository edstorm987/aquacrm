# `src/built-ins/modules/agency-finance/src/lib/budgetHealth.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (7)

- `interface CampaignBudgetRecord (7 members)`
- `interface WorkforceBudgetRecord (5 members)`
- `type BudgetPotSignal`
- `interface BudgetPotSnapshot (17 members)`
- `buildBudgetPotSnapshots(pots: BudgetPot[], campaigns: CampaignBudgetRecord[], expenses: Expense[], workforcePayments: WorkforceBudgetRecord[] = []): BudgetPotSnapshot[]`
- `budgetPotSnapshot(pot: BudgetPot, campaigns: CampaignBudgetRecord[], expenses: Expense[], workforcePayments: WorkforceBudgetRecord[] = []): BudgetPotSnapshot`
- `campaignPotHeadroom(snapshot: BudgetPotSnapshot, campaign?: CampaignBudgetRecord): number`

## Depends on (1)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](./domain.md)

## Used by (7)

- [`scripts/smoke-finance-budget-control.test.ts`](../../../../../../scripts/smoke-finance-budget-control.test.md)
- [`scripts/smoke-finance-operations.test.ts`](../../../../../../scripts/smoke-finance-operations.test.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../../../../app/portal/agency/marketing/page.md)
- [`src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx`](../components/BudgetPotsWorkspace.md)
- [`src/built-ins/modules/agency-finance/src/pages/BudgetsPage.tsx`](../pages/BudgetsPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx`](../pages/FounderDashboardPage.md)
- [`src/lib/server/financeBudgetCampaigns.ts`](../../../../../lib/server/financeBudgetCampaigns.md)

