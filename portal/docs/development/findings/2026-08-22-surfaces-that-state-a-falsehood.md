# Finding — four surfaces state something untrue: a measured zero, a demo session, a clamped reclaim, a guessed currency

- **Status:** fixed — **but it was reported fixed once while two of it were still live.**
  See "What was still live after the first close" below; both are now closed and pinned.
- **Closed by:** (1) `measuredCountLabel` (`src/lib/performance/telemetryDisplay.ts`) gates
  every count on the telemetry watermark, so a tag that has never reported renders "—" —
  applied to marketing's Views-today tile, to the two sibling surfaces telling the same
  lie (`_WebsiteWorkspace`, `_PerformanceWorkspace`), and (2026-08-22, second pass) to the
  **third and fourth**: the client workspace's monitoring tiles
  (`src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx`) and
  `_PerformanceWorkspace`'s own "Live errors" tile; (2) all THREE "not read in a demo
  session" claims now say "were not read in this session … a demo session or a failed read
  — not zero enquiries" (the third was `marketing/page.tsx:907`, not in the original
  report); (3) `taxPosition()` replaces `Math.max(0, outputTax - inputTax)` and labels a
  reclaim as a reclaim — **in `ReportsPage` AND, since 2026-08-22, in `FounderDashboardPage`
  (Overview), which the first pass missed**; (4) `FounderDashboardPage` resolves currency
  through `resolveFinanceDefaultCurrency`. Deposits (1c) also formats through `formatMoney`
  and names the client. Pinned by `scripts/smoke-truthful-surfaces.test.ts`.

- **Severity:** medium
- **Where:** `marketing?view=channels&channel=website · marketing?view=demand · agency-finance (Overview, Reports)`
- **Found:** 22 Aug 2026

## What was still live after the first close

Written down rather than quietly amended, because a findings board that says "fixed"
when it is not is worse than one that is behind. A regression verifier drove both.

- **The tax clamp was fixed on Reports and left on Overview.**
  `agency-finance/src/pages/FounderDashboardPage.tsx:253` still rendered
  `Math.max(0, outputTaxCents - inputTaxCents)` — the same two inputs, the same row, on
  the screen that gets looked at most. **Why it survived:** item 3 above named
  `ReportsPage.tsx` and the fix was applied to the file the finding named.
- **A THIRD unmeasured-count sibling was never gated.**
  `src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx:224` rendered
  `summary.pageviews24h` raw, three lines below its own "Waiting for first signal"
  banner. **Why it survived:** the same habit — item 1 named two siblings, so two were
  fixed. Closing it turned up a **fourth**, `_PerformanceWorkspace`'s "Live errors" tile,
  which no report had ever named.

**What changed so it does not happen a third time.** The pins are no longer
file-by-file. `smoke-truthful-surfaces.test.ts` now asserts the CLASS: no finance page
may contain a `Math.max(0, output… - input…)` of any spelling, and no surface in the
telemetry list may render `pageviews24h` / `errors24h` into a value slot ungated. The
fourth sibling was found by that check, not by a person reading the file.

## What I saw
Four separate places where the screen asserts something the system does not know, or
knows to be false. Grouped because they are one habit, not four bugs: **a value that was
never measured is being rendered as if it were.**

**1. A measured "0" for a site that has never reported.**
`marketing/page.tsx:479` renders `String(ownWebsiteSummary.pageviews24h)` unguarded.
On an agency whose Aqua Tag has never reported, the panel renders
`Views today = "0"` directly beside `Tag = "Waiting"` — it *knows* the tag is waiting and
still prints a measured-looking zero. `summarizeAgencyWebsite`
(`src/server/agencyWebsite.ts:244`) returns raw counts with no unmeasured channel.
Invisible on Ed's own data (his tag is connected, so his zero is truthful) — it lies to
every new brand and every future agency buyer before their tag is live. This is the same
rule Radar is held to: **unmeasured is "—", never 0.**

**2. A real founder told they are "in a demo session".**
`_MarketingCommandSurfaces.tsx:295` and `:366` hardcode the demo explanation for
`available: false` — but `marketingIntelligence.ts:121` defines that flag as "the caller
did not read them", for *any* reason. Confirmed at runtime with a genuine non-demo owner
session whose `listWebsiteEnquiries` call failed (Supabase unreachable — precisely what a
production outage looks like): both panels rendered *"Website enquiries are not read in a
demo session…"*. The copy asserts a false cause and sends the operator hunting for the
wrong problem. The pulse spine tile already handles this state honestly with "Not read in
this session" — copy that wording.

**3. A tax reclaim displayed as £0.00.**
`ReportsPage.tsx` uses `Math.max(0, outputTax - inputTax)` in both the metric and the
"Recorded tax balance" row. When recoverable tax exceeds charged tax — money owed *back*
— the truthful state is clamped to zero. Show the reclaim.

**4. Every total pinned to the currency of whatever record sorts first.**
`FounderDashboardPage.tsx:38`:
`invoices[0]?.currency ?? expenses[0]?.currency ?? plans[0]?.currency ?? "gbp"`, then
every aggregate filters to that currency and silently drops the rest. One stray USD
invoice sorting first flips the whole dashboard to USD and hides all GBP money with no
indicator. ReportsPage already does this honestly with a per-currency switcher, and
`resolveFinanceDefaultCurrency` exists — Overview just ignores it.

**Tests to pin them**
- `scripts/smoke-marketing-view-consolidation.test.ts` — render the website channel with
  `telemetryLastSeenAt: null`; assert "Views today" renders "—"/"Waiting", never "0".
- `scripts/smoke-marketing-intelligence.test.ts` — render both panels with
  `enquiries.available=false` and a **non-demo** session; assert the copy never claims a
  demo session.
- Finance smoke — a reports unit with `inputTax > outputTax` asserting the rendered value
  is not £0.00; and a mixed-currency fixture asserting Overview aggregates on the
  configured default, not on `invoices[0]`.

---
_Captured from the Dev Team portal. Findings are the input side: review them, turn them into a plan, hand the plan to a worker._
