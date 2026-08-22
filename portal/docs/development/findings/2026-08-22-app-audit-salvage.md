# App audit — salvaged findings, 22 August 2026

**Status: PARTIAL. 2 of 8 clusters reported; 6 walkers died.** The audit sent eight
agents to walk the app in the browser; the shared pane sits at a 9-tab cap and the
surviving two could never open a tab, so **there is no visual evidence anywhere in this
report** — no screenshots, no console/network capture, no dark-mode or mobile checks.

What follows was verified the hard way instead: by driving the **real route handlers and
page components in-process** (`scripts/dev-console-request-scope.ts` `withSession` +
`renderToStaticMarkup`) over an **isolated copy** of live state. Ed's real
`.data/portal-state.json` was verified untouched (mtime and size unchanged).

**Clusters covered:** Finance · Marketing-and-Operations.
**Clusters with NO findings at all:** Command Centre · Inbox-and-People ·
Fulfilment-and-clients · Company-Tools-Account · Dev-Team-and-docs · Customer-and-public.

**Re-run design note:** do NOT give each walker its own tab. Have them share ONE tab
sequentially, or run the browser layer as a single walker over all clusters.

---

## 🔴 BROKEN

### 1. `agency-staff` can read FINANCE_ADMIN pages — including salaries — by typing the URL

**Severity: highest in this report. Access control.**

- **Where:** `/portal/agency/agency-finance/{budgets,operations,planning,settings}`
- **Cause:** the manifest `pages` entries in
  `src/built-ins/modules/agency-finance/index.ts` carry no `visibleToRoles`/`roles`, so
  `pluginPageAllowedRoles(page)` returns `undefined` and the host's only gate is
  `requireRole(AGENCY_ROLES)` (`src/app/portal/agency/[...rest]/page.tsx:134`).
  The nav *hides* the tabs (`sections.ts` `FINANCE_ADMIN_ROLES`) — the pages do not.
- **Worst case:** `OperationsPage.tsx` loads `listCompensationProfiles` / `listPayments`
  (salaries, bonuses) server-side and ships them as **initial props**. The admin-only 403
  on `/api/portal/agency-finance/operations` blocks a client-side refresh, not the SSR
  payload.
- **Also inconsistent:** as staff, `GET budgets` → **200** (`routes.ts` declares it
  `AGENCY_VIEWERS`) while `GET pnl` and `operations/*` → 403.
- **Contract violated:** "budgets/operations/planning/settings are FINANCE_ADMIN only".
- **Test to pin:** new `scripts/smoke-finance-section-gates.test.ts` — for every
  FINANCE_ADMIN section in `FINANCE_SECTIONS`, assert
  `pluginPageAllowedRoles(resolveAgencyPluginPage(...).page)` excludes `agency-staff`;
  and drive the dispatcher `GET budgets` as staff expecting 403.

### 2. Stripe can never be configured — the whole card-payment leg is dead, and the error messages point at a surface that does not exist

- **Where:** `/portal/agency/agency-finance/settings`; invoice "take card"; close-deal
  stripe channel.
- **Cause:** the manifest declares `stripeSecretKey` / `stripeWebhookSecret`, but **no
  component renders plugin `settings.groups`**, and the only `patchInstall` caller in
  `src/app` (`/api/portal/settings/route.ts`) writes just currency/terms/tax/prefix.
  `readStripeKeysFromInstall` reads only `install.config.stripeSecretKey`; the vault's
  stripe mapping (`integrationConnections.ts:311`) is never consulted by agency-finance.
- **Effect:** `stripeConfigured()` is permanently false → no pay-links,
  `invoices/checkout` and `payments/refund` unreachable, and the user is told
  *"Set up Stripe in Finance settings"* (`closeDeal.ts:64`, `stripe.ts:132`) — a dead end.
- **Test to pin:** extend `src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts`
  — every field declared in manifest `settings.groups` must be writable through a real
  settings write path (currently red for both stripe fields).

### 3. Deposits page: unformatted money and raw client ids

- **Where:** `/portal/agency/agency-finance/lock-in`
- **Evidence:** `LockInPage.tsx` prints `(cents/100).toFixed(2)` with no currency symbol
  — rendered header reads *"0 clients with deposits · 0.00 / 0.00 collected"*. The Client
  column prints the raw `cli_…` id instead of the client name. Every other finance
  surface uses Intl currency formatting.
- **Test to pin:** render assertion in the finance plugin smoke — deposit rows must carry
  Intl-formatted currency and the client display name, never a `cli_` id.

---

## 🟠 CONTRACT VIOLATIONS (runtime-proven; latent on Ed's data today)

### 4. The website channel prints a measured "0" for a site that has never reported

- **Where:** `/portal/agency/marketing?view=channels&channel=website`
- **Evidence:** on an agency whose Aqua Tag has never reported —
  `Views today = "0" | Tag = "Waiting"`. The panel *knows* the tag is waiting and prints
  a measured-looking zero one tile away. `page.tsx:479` renders
  `String(ownWebsiteSummary.pageviews24h)` unguarded; `summarizeAgencyWebsite`
  (`src/server/agencyWebsite.ts:244`) returns raw counts with no unmeasured channel.
- **Why it is invisible to Ed:** his tag IS connected, so his zero is truthful. It lies
  for every new brand and every future agency buyer pre-tag.
- **Violates:** the standing rule that unmeasured is "—", never 0 — the same rule Radar
  is held to.
- **Test to pin:** `scripts/smoke-marketing-view-consolidation.test.ts` — render the
  website channel with `telemetryLastSeenAt: null`; assert "Views today" is "—"/"Waiting".

### 5. A real founder is told "not read in a demo session" when the enquiry read fails

- **Where:** `/portal/agency/marketing?view=demand` and `?view=customers`
- **Evidence:** with a genuine non-demo owner session whose `listWebsiteEnquiries` failed
  (Supabase unreachable — exactly what a production outage produces), both panels
  rendered *"Website enquiries are not read in a demo session…"*. The copy asserts a
  false cause. The pulse tile handles the same state honestly ("Not read in this
  session"). Cause: `_MarketingCommandSurfaces.tsx:295` and `:366` hardcode the demo
  explanation for `available: false`, which `marketingIntelligence.ts:121` defines as
  "the caller did not read them" — any reason.
- **Test to pin:** `scripts/smoke-marketing-intelligence.test.ts` — render both panels
  with `enquiries.available=false` and a non-demo session; assert the copy never claims
  a demo session.

### 6. Funnel Results renders hand-typed figures as measured metrics, including "Rate 0%"

- **Where:** `/portal/agency/marketing?view=funnels` → Results
- **Evidence:** `_FunnelsWorkspace.tsx:698-711` — `rate = leads ? … : 0`, then headline
  tiles `Spend / Leads / Conversions / Rate ${rate}%`. An empty funnel shows "Rate 0%".
  The "manual until the tag supplies them" admission sits *below* the tiles, not on them.
- **Test to pin:** `scripts/smoke-marketing-funnel-builder.test.ts` — render `ResultsView`
  with an empty draft; assert Rate shows "—" and hand-typed tiles carry a manual marker.

---

## 🟡 IMPROVE

7. **Viewer roles see admin-only controls that will 403.** `InvoicesList` renders "Create
   invoice"/"Mark paid" for all viewers; NewPlanForm and budget-pot creation likewise,
   while the POST/PATCH routes are `AGENCY_ADMINS`. Security holds at the API; the UX is
   a dead button and an error toast. Plumb the session role into the plugin pages.
8. **Reports "Tax balance" clamps a reclaim to £0.00.** `ReportsPage.tsx` uses
   `Math.max(0, outputTax - inputTax)` — when recoverable tax exceeds charged tax, money
   owed *back* displays as zero.
9. **Overview pins every total to the currency of whatever record sorts first.**
   `FounderDashboardPage.tsx:38` — `invoices[0]?.currency ?? … ?? "gbp"`, then filters to
   it and silently drops the rest. ReportsPage does this honestly with a per-currency
   switcher; Overview ignores `resolveFinanceDefaultCurrency`.
10. **Payables aging overstates.** Aging uses `dueAt: expense.incurredAt`
    (`ReportsPage.tsx:56`), so a cost incurred yesterday lands in "1–30 days overdue".
11. **Operations hub cards carry no attention state.** The sidebar aggregates
    finance+fulfilment+marketing attention, but `operations/page.tsx` has zero attention
    imports — Ed sees "Operations · 3", clicks through, and finds ten unlit cards.
    Extend `scripts/smoke-operations-attention-rollup.test.ts`.

---

## ✅ VERIFIED HEALTHY (honest negatives — real handlers, isolated state)

**Finance.** Close-deal idempotency holds (same key twice → one contract, one invoice, no
duplicated money). Macro/micro integrity holds — the same invoice `INV-2026-0001` appears
identically in the agency ledger and the `?clientId=` scope. Totals reconcile across
Overview, Reports aging, Invoices and Planning. Bank transfer correctly records *no*
payment until money lands. The Plans native-form bug stays fixed (form-encoded POST → 400
`invalid_body`). Exactly one Finance sidebar entry. No NaN/undefined/Infinity rendered
anywhere. No secret material rendered — Stripe surfaces receive a boolean.

**Marketing/Operations.** No broken routes: all 6 live views, the demoted
`client-services`, every retired `?view=` value and junk fallbacks render, with the old
block landing first (anchor order verified at runtime). `/portal/agency/automations`
redirects correctly. The Operations hub has exactly 10 cards in delegation order, all
hrefs resolving. Pulse renders "—" plus "Nothing is connected to measure this yet" for
unmeasured KPIs and never recomputes numbers on-page. Attribution is genuinely
guess-then-confirm ("Matched on source key" vs "Suggested match — confirm"). The
data-source roster separates "Reading back" from "Sending only" — it states its own
blindness. Governance holds: non-owner/manager redirected; GDPR has no off-switch. No
stale copy ("portal studio", "Team chat", "four modes") anywhere in the cluster.

---

## What still needs a browser

Everything visual, for every cluster: console and network cleanliness, hydration
warnings, dark-mode contrast, mobile-width overflow, focus states, and the six clusters
that produced no report at all. Re-run with a **single** browser walker.
