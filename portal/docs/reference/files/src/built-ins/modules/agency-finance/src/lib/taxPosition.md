# `src/built-ins/modules/agency-finance/src/lib/taxPosition.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** The tax position, stated in the direction it actually points.  Reports used to render `Math.max(0, outputTax - inputTax)` in both the metric and the "Recorded tax balance" row. When recoverable tax exceeds tax charged — money owed BACK — the clamp turned a reclaim into "£0.00" and the operator had no way to know one existed. A number that can only be positive is not a balance; it is half of one.  Pure so it can be tested without rendering the page.

## Exports (3)

- `type TaxDirection`
- `interface TaxPosition (5 members)`
- `taxPosition(outputTaxCents: number, inputTaxCents: number): TaxPosition`

## Used by (3)

- [`scripts/smoke-truthful-surfaces.test.ts`](../../../../../../scripts/smoke-truthful-surfaces.test.md)
- [`src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx`](../pages/FounderDashboardPage.md)
- [`src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)

