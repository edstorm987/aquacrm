# `src/built-ins/modules/agency-finance/src/lib/aging.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** AR / AP aging — who owes you (receivables) and what you owe (payables), bucketed by how overdue it is. Pure computation over records the finance services already hold; record + surface only.

## Exports (5)

- `type AgingBucketKey`
- `interface AgingBucket (4 members)`
- `interface AgingSummary (4 members)`
- `interface AgingItem (2 members)`
- `summariseAging(items: readonly AgingItem[], now: number): AgingSummary`

## Used by (2)

- [`scripts/smoke-finance-aging.test.ts`](../../../../../../scripts/smoke-finance-aging.test.md)
- [`src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)

