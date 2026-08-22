# Finding — four surfaces state something untrue: a measured zero, a demo session, a clamped reclaim, a guessed currency

- **Status:** open
- **Severity:** medium
- **Where:** `marketing?view=channels&channel=website · marketing?view=demand · agency-finance (Overview, Reports)`
- **Found:** 22 Aug 2026

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
