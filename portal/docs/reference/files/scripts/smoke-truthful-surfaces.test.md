# `scripts/smoke-truthful-surfaces.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Surfaces that used to state something the system did not know.  Finding 2026-08-22 "four surfaces state something untrue". Grouped there, and grouped here, because they are one habit rather than four bugs: **a value that was never measured rendered as if it had been.**  1. Marketing printed "Views today: 0" beside "Tag: Waiting". 2. Two marketing panels told a real founder they were "in a demo session" when the enquiry read had merely failed. 3. Reports clamped a tax RECLAIM to £0.00 with `Math.max(0, …)`. 4. Overview pinned every total to `invoices[0]?.currency`, so one stray USD invoice sorting first hid all the GBP money with no indicator.  …plus the Deposits page (finding 1c), which printed bare `(cents/100) .toFixed(2)` with no currency at all and a raw `cli_…` id where the client's name belongs.

_No exported symbols (side-effect / internal module)._

## Depends on (7)

- [`src/built-ins/modules/agency-finance/src/lib/currencies.ts`](../src/built-ins/modules/agency-finance/src/lib/currencies.md)
- [`src/built-ins/modules/agency-finance/src/lib/taxPosition.ts`](../src/built-ins/modules/agency-finance/src/lib/taxPosition.md)
- [`src/lib/performance/telemetryDisplay.ts`](../src/lib/performance/telemetryDisplay.md)
- [`src/lib/server/finance/financeCurrency.ts`](../src/lib/server/finance/financeCurrency.md)
- [`src/server/pluginInstalls.ts`](../src/server/pluginInstalls.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

