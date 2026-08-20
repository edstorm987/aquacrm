# Handoff — Finance command surface (the whole build)

← [finance-command-surface.md](plans/finance-command-surface.md) (the plan) ·
[updates.md](updates.md) · [status.md](status.md) · [development.md](../development.md)

**Who this is for:** the next person (AI or human) who touches Finance. It's the
one place that records *what was built, why, what broke, what's tested, what's
NOT done, and what to do next* — so nothing lives only in a chat.

**Date:** 2026-08-19 · **Author:** the Finance worker · **Plan:**
[finance-command-surface.md](plans/finance-command-surface.md)

---

## 0. TL;DR

The [finance-command-surface plan](plans/finance-command-surface.md) is **fully
built — P1 through P5 plus the You-Deserve-It wire.** Finance went from a
real-but-**manual + sprawling** `agency-finance` plugin to a coherent
**visibility + orchestration layer across every payment channel**, with Stripe
wired for the online channel and a flagship **one-button close**.

**The safety line held the whole way, and is the single most important thing to
preserve:** the app **never holds or moves funds.** It records, routes,
reconciles, and surfaces. Money always flows client → **Ed's own**
Stripe/bank/cash directly. **Stripe keys are Ed's**, entered via the plugin
settings; they are never hardcoded, never logged, and were never handled by me
(dev/test used TEST mode or a mock).

**State of play:** full suite **1696 pass / 0 fail / 1 skip** (the skip is a
pre-existing `DATABASE_URL`-gated test, not finance). `tsc --noEmit` clean for
finance code. **~26 new finance unit/logic tests.** Everything remaining is
**non-code** (see §8).

---

## 1. How the finance system works now (mental model)

```
                      ┌──────────────────────────────────────────────┐
   A SALE  ─────────► │  ONE-BUTTON CLOSE                            │
   (client or lead)   │  contract + issued invoice + routed payment │
                      └──────────────┬───────────────────────────────┘
                                     │  (channel chosen at close)
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
   STRIPE (online)            BANK / CASH / OTHER            (invoice issued)
   pay-link ─► webhook        recorded intent,                 InvoiceService
   ─► auto-mark-paid          reconciled by hand
   ─► auto-reconcile          (mark-paid + income sheet)
        │
        ├─ charge.refunded  ─► invoice → refunded  (+ event/activity)
        └─ charge.dispute   ─► chargeback surfaced (+ event/activity)

   MONEY-IN VIEW: every receipt (payment / paid invoice / other income),
   grouped by CHANNEL, per currency  (the Income sheet)

   AGING: unpaid invoices (receivables) + approved-unpaid costs (payables),
   bucketed by days overdue  (the Reports page)

   You-Deserve-It: a delivered gift's cost ─► an approval-gated finance expense
```

**The channel axis** (`bank-transfer | stripe | cash | other`) is the spine.
Stripe is the automated channel; the rest are manual (recorded + reconciled by
hand — "manual-first", per Ed's decision).

---

## 2. Phase-by-phase — what shipped

Each phase was: **reuse-first discovery → build simple-first → unit-test the
logic → full suite + tsc → docs.** Verification honesty is in §6/§7.

### P1 — Cohere the sprawl  ✅ (browser-verified)
The nav was defined **twice** and had drifted; the founder dashboard was
**double-mounted**; a latent metadata-key bug silently broke a resolution flow.
- **One nav source:** new [`sections.ts`](../../src/built-ins/modules/agency-finance/src/lib/sections.ts)
  (`FINANCE_SECTIONS`) — both the in-page tabs
  ([`FinanceNav.tsx`](../../src/built-ins/modules/agency-finance/src/components/FinanceNav.tsx))
  and the plugin manifest `navItems` ([`index.ts`](../../src/built-ins/modules/agency-finance/index.ts))
  now derive from it. Can't drift again.
- **Double-mount killed:** `FounderDashboardPage` was mounted at both `""` and
  `/founder`; collapsed to one root mount (the `agency/[...rest]` catch-all
  already redirects stale `/founder` links).
- **Sidebar:** confirmed Finance renders **once** (the hardcoded `finance` item
  in `lib/chrome/sidebarLayout.ts`); the plugin's `agency-finance.*` navItems are
  filtered out of the canonical agency sidebar by the AquaOasis-Web
  `canonicalMainIds` allow-list — see hazards.
- **Bug fixed:** [`resolutionPlans.ts`](../../src/lib/server/resolutionPlans.ts)
  read `client.metadata.paymentPlans` — a key **nothing writes** (canonical is
  `clientPaymentPlans`) — at two sites, so missed-instalment resolution plans +
  evidence **silently returned null.** Fixed both; regression-locked (proven to
  fail pre-fix).
- **Browser-verified on `:3032`:** 11 tabs single-sourced + correctly ordered,
  Finance once in the sidebar, all derived hrefs correct in the live DOM,
  `/founder`→root redirect, zero console errors.

### P2 — Channel model + "money in across everything"  ✅ (browser-verified)
- [`channels.ts`](../../src/built-ins/modules/agency-finance/src/lib/channels.ts):
  `PAYMENT_CHANNELS` — the canonical 4, each with its own **receipt reference
  label** + `kind` (automated/manual). `normaliseChannel()` folds the legacy
  `PaymentMethod` value `"manual"` (and anything unknown) onto `"other"`. The
  stored type stays `PaymentMethod` — **no data migration.**
- [`moneyIn.ts`](../../src/built-ins/modules/agency-finance/src/lib/moneyIn.ts):
  `summariseMoneyInByChannel()` — groups every money-in record by channel, **per
  currency** (never summed across), always all four channels (never hides a £0).
- [`IncomeSheet.tsx`](../../src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx):
  a "Money in by channel" strip + channel badges + a Channel filter + record
  forms with a channel-appropriate reference label.
- Reuse win: the Income sheet **already** unified payments + paid invoices
  (`paidVia`) + non-invoice income — P2 made the channel first-class on top.

### P3 — Stripe wired (online channel)  ✅ (unit-tested; Ed verifies live)
Reused the **ecommerce plugin's Stripe pattern**, per-plugin.
- [`stripe.ts`](../../src/built-ins/modules/agency-finance/src/lib/stripe.ts):
  `createInvoiceCheckout`, `verifyStripeWebhook`, `createStripeRefund`,
  `readStripeKeysFromInstall`/`stripeConfigured`. **Injectable client** so the
  logic is testable and a Stripe-less env fails cleanly.
- [`stripeReconcile.ts`](../../src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts):
  the testable core. `checkout.session.completed` → record a Stripe payment
  (`externalRef` = PaymentIntent) → **auto-settle** the invoice, **idempotent**
  on the PaymentIntent (a redelivered webhook never double-charges);
  `charge.refunded` → **paid → refunded**; `charge.dispute.created` → chargeback
  surfaced (status left — a dispute is contested).
- [`handlers-stripe.ts`](../../src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts) +
  routes: `POST invoices/checkout` (admin), `POST stripe/webhook` (**public** —
  see §4), `POST payments/refund` (admin).
- `PaymentService` gained `findByExternalRef` / `markRefunded` / `markDisputed`
  (the refund/dispute logic lives there — the service holds the ports; see §6).
- Config: an "Online payments (Stripe)" settings group (Ed's keys, TEST-first).
- UI: a gated **"Pay by card"** button on the invoice detail.

### P4 — The one-button close  ✅ (both flavours)
- **P4a (existing client):** [`closeDeal.ts`](../../src/lib/server/closeDeal.ts)
  (`closeDealForClient`) — one action → sent contract (`ClientContract`) +
  issued invoice (`InvoiceService`, draft→sent) + routed payment (Stripe pay-link
  / bank / cash / other; **pay-link failure is non-fatal**). Route
  [`api/tenants/close-deal`](../../src/app/api/tenants/close-deal/route.ts) + a
  "Close the deal" card in the per-client Finance tab
  ([`_FinanceTabClient.tsx`](../../src/app/portal/clients/[clientId]/_FinanceTabClient.tsx)).
- **P4b (lead → client):** a "Close the deal" action on the **post-convert**
  banner in the pipeline
  ([`_LeadsPipelineWorkspace.tsx`](../../src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx))
  → chains the existing convert flow → the same `close-deal` engine. **Journey
  UI only — no leads-pipeline server change** (Ed cleared the coordination).

### P5 — Reconciliation & hygiene  ✅
- **AR/AP aging:** [`aging.ts`](../../src/built-ins/modules/agency-finance/src/lib/aging.ts)
  (`summariseAging` — 5 buckets by days overdue + `overdueCents`) surfaced in the
  **Reports page** as a Receivables/Payables panel.
- **Reconciliation** was already in place (Stripe auto-settles P3; bank/cash via
  mark-paid + the income sheet).
- **Dead `expense.*` events:** confirmed emitted but unconsumed — documented as
  an unconsumed **event contract** (not dead code), see hazards.

### + You-Deserve-It → Finance wire  ✅ (Ed cleared coordination)
A delivered client delight with a cost becomes an **approval-gated ("pending")
finance expense**. Hook in
[`api/tenants/client-delight/route.ts`](../../src/app/api/tenants/client-delight/route.ts);
bridge [`clientDelightExpense.ts`](../../src/lib/server/clients/clientDelightExpense.ts).
**`server/clientDelight.ts` and `server/types.ts` are untouched.** Idempotent via
the expense `reference` (`delight:<id>`); a **no-op when Finance isn't
connected** (never fails the delight save).

---

## 3. Tests — what, where, how to run

**Run the full suite (the gate before anything is "done"):**

```bash
cd aquaCRM/portal
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
```

**Typecheck:** `npx tsc --noEmit`

New finance tests (all pure/logic or in-memory-container — no live server, no
`stripe` package, no live Stripe needed):

| File | Tests | Covers |
|---|---|---|
| `scripts/smoke-finance-channels.test.ts` | 4 | catalogue, `normaliseChannel` (manual→other), per-channel aggregation, empty world |
| `scripts/smoke-finance-stripe.test.ts` | 9 | checkout→settle, **idempotent** redelivery, refund→status-back, dispute→chargeback, safe ignores, checkout params (mock), refund call, webhook-refuses-without-secret, config reading |
| `scripts/smoke-finance-close-deal.test.ts` | 6 | Stripe/bank/cash/other routing, **non-fatal** pay-link failure, validation |
| `scripts/smoke-finance-aging.test.ts` | 3 | bucketing, empty world, boundary days (30→1–30, 31→31–60) |
| `scripts/smoke-finance-delight-expense.test.ts` | 3 | pending expense created, **idempotent** re-record, safe no-op |

Extended (existing tests): `scripts/smoke-operational-notifications.test.ts`
(the resolutionPlans **regression** test — drives the real
`resolutionPlanFor`/`resolutionEvidenceFor` on a seeded client);
`scripts/smoke-nav-audit.test.ts` + `scripts/smoke-finance-operations.test.ts`
(source-shape pins retargeted to `FINANCE_SECTIONS` — the asserted strings
legitimately moved into `sections.ts`).

**The testing pattern used throughout (worth copying):** separate the *logic
core* (pure, or driven over an in-memory finance container via
`containerWithDeps`) from the *thin HTTP/SDK edge*. Inject the Stripe client /
pay-link / contract-save so the core is unit-testable without a live server or
the `stripe` package. Every "did it fail before the fix?" regression was
**proven by temporarily reverting** and watching it go red.

---

## 4. Two non-obvious mechanics to know

1. **The Stripe webhook is a `public: true` plugin route.** Stripe has no
   session, so the plugin-API dispatcher (`app/api/portal/[module]/[...rest]/route.ts`)
   skips auth for `public` routes and resolves the agency from **`?agencyId=`**
   in the URL. Ed configures his Stripe webhook endpoint as
   `…/api/portal/agency-finance/stripe/webhook?agencyId=<his agency id>`. Keys +
   signature verification come from that agency's install config. **Gotcha
   found:** the **ecommerce** plugin's own `stripe/webhook` is **NOT** marked
   `public`, so it would not actually receive live Stripe calls — I did the
   finance one right. (Flagged in hazards as a latent bug there.)

2. **The finance sidebar entry is the single hardcoded `finance` item** in
   `lib/chrome/sidebarLayout.ts`. The plugin's `agency-finance.*` navItems are
   computed into a "discovered" panel that the AquaOasis-Web override
   (`canonicalMainIds`) then **discards** — so they render nowhere in the agency
   chrome. They exist as the plugin's section metadata (single-sourced from
   `FINANCE_SECTIONS`). Don't "fix" this by adding a third registration.

---

## 5. Design decisions & thoughts (the "why")

- **Reuse over rebuild, per-plugin.** The Stripe wrapper mirrors ecommerce's
  (this codebase **vendors utilities per-plugin** rather than sharing), plus
  refunds + an injectable client. Logged in hazards so the two stay in sync.
- **Testable core + thin edge + injectable dependencies.** Every risky piece
  (Stripe reconcile, close-deal, delight wire) has a pure/in-memory core with the
  external system injected, and a thin route/SDK wrapper that isn't unit-tested.
  This is *why* Stripe could be fully covered without keys.
- **Idempotency by a stable reference.** Stripe reconcile dedups on the
  PaymentIntent; the delight wire dedups on the expense `reference`
  (`delight:<id>`). No new "already processed?" state needed.
- **Non-fatal side-effects.** A pay-link failure doesn't fail the close (contract
  + invoice already landed); a delight→expense failure doesn't fail the delight
  save. The primary action always completes; the secondary is best-effort with a
  clear message.
- **The two-contract fork (P4).** There are **two** contract systems:
  `clientContracts.ts` (client-scoped, what close-deal uses) and the
  leads-pipeline **proposal/commercial-pack** (lead-scoped). The plan
  name-checked the leads-pipeline one; I surfaced the fork to Ed rather than
  guess. Ed chose "both — client now, lead next." (There's also a *third*
  contract concept — staff `PeopleContract`. No shared key. In hazards.)
- **Surfacing coordination, not guessing.** Three cross-domain touches were each
  flagged before touching: **leads-pipeline** (P4b UI), **clientDelight** (the
  wire), and **operationalAlerts** (the refund/chargeback alert — still NOT
  touched, it's the client-health worker's). Ed cleared the first two.
- **`types.ts` additive-only** was respected throughout (the delight wire needed
  no type change at all).

---

## 6. Problems found + fixed (and gotchas)

| Problem | Fix |
|---|---|
| `resolutionPlans.ts` read the never-written `metadata.paymentPlans` → missed-instalment resolution silently returned null (2 sites). | Read the canonical `clientPaymentPlans`; regression test proven to fail pre-fix. |
| ecommerce's `stripe/webhook` isn't `public` → wouldn't receive live Stripe. | Finance webhook is `public: true` + `?agencyId=`. Flagged ecommerce's as a latent bug (hazards). |
| First reconcile draft used `container.events` / `container.activity` — **undefined** (the `AgencyFinanceContainer` exposes services, not the raw ports). | Moved the refund/dispute event+activity into `PaymentService.markRefunded`/`markDisputed` (the service already holds the ports). Cleaner encapsulation. |
| `stripe` npm package is **not installed**. | Dynamic-string import fails gracefully with a clear message; tests use an **injected mock** client. Ed runs `npm i stripe` to go live. |
| `Currency` is 14 codes, wider than the narrow `"gbp"|"usd"|"eur"` I first typed on the checkout input. | Widened the adapter's `currency` to the app `Currency` type (all 14 are valid Stripe currencies). |
| The delight route is **async** but `updateClientDelight` is **sync** → couldn't `await` a finance write inside it. | Hooked the wire in the **route** (async), not in `clientDelight.ts`. Kept `clientDelight.ts` untouched. |
| Stale `.next/dev/types` errors for `carddemo` / `cardsim` routes. | **Not mine** — throwaway routes other chats created + deleted to verify UI, leaving stale generated types. Filtered them out of every tsc check. |

---

## 7. Verification — what's proven, and the honest gaps

- **P1 + P2 were browser-verified** on the shared `:3032` (via `/dev` to mint a
  founder session): the finance nav, the money-in-by-channel view, the channel
  filter, and the record form's dynamic reference label all render correctly with
  zero console errors.
- **P3, P4, P5, the wire:** logic is **unit-tested** (in-memory / mock);
  **`tsc` clean**; **full suite green**. Route reachability confirmed by **curl**
  where relevant (e.g. `POST /api/tenants/close-deal` returns my 400 validation,
  not a 404). But the **shared `:3032` kept dropping** (another chat controls it)
  and the in-app browser tooling was flaky this session (`read_page` often empty;
  client links are button-based; the server went down mid-session more than
  once). So several **UI renders were not browser-walked** — they are tsc-verified
  server/client renders reusing tested endpoints. This is called out per-feature
  in [status.md](status.md), honestly.
- **Stripe was never run live** — I don't handle keys and the package isn't
  installed. **Ed verifies the live path** (see §8).

Verification approach that *did* work reliably: unit/logic tests over the
in-memory finance container, `tsc`, the full suite, and `curl` for route
existence. When you can't reach a live server, that combination is the fallback —
plus in-process route-handler drives (see other workers' `issueSession +
NextRequest` pattern) where a session is needed.

---

## 8. What's NOT done — remaining (all non-code, none mine to do solo)

1. **Ed's live Stripe verification** (the P3 "Done when"):
   - `npm i stripe` (optional peer dep).
   - Enter **TEST** keys (`sk_test_…`, `whsec_…`) in **Finance settings →
     Online payments (Stripe)**.
   - In the Stripe dashboard, add a webhook endpoint at
     `<origin>/api/portal/agency-finance/stripe/webhook?agencyId=<agency id>`,
     subscribed to `checkout.session.completed`, `charge.refunded`,
     `charge.dispute.created`.
   - Issue an invoice → "Pay by card" → pay with a Stripe test card → confirm it
     **auto-marks-paid + reconciles**; then issue a refund → confirm the invoice
     flows to **refunded**. Flip to live keys once happy.
2. **A `finance:refund` / `finance:chargeback` operational alert** in
   `operationalAlerts.ts` — refunds/chargebacks currently surface via finance
   **events + activity** only. That file is the **client-health worker's**;
   flagged for the commander, not touched here.
3. **(Optional) the dead `expense.*` events** — documented as an unconsumed
   event contract. Retire or give them a consumer if desired; nothing depends on
   them today, and AR/AP aging reads state directly, not events.

---

## 9. Coordination log (cross-domain touches)

| Touch | Domain | Status |
|---|---|---|
| `_LeadsPipelineWorkspace.tsx` (P4b close-lead UI) | Journey / leads-pipeline | **Flagged → Ed cleared.** UI only; no leads-pipeline server change. |
| `api/tenants/client-delight/route.ts` (the wire hook) | You-Deserve-It / clientDelight | **Flagged → Ed cleared.** Route hook only; `clientDelight.ts` untouched. |
| `operationalAlerts.ts` (refund/chargeback alert) | client-health worker's file | **NOT touched.** Flagged for the commander (see §8.2). |
| `lib/chrome/sidebarLayout.ts` | shared chrome | Left untouched; the single hardcoded `finance` item is already the sole render. The dead `DISCOVERED_PANEL_LABELS["agency-finance"]` line is a foundation cleanup candidate, flagged not edited. |
| `src/server/types.ts` | shared | **Additive-only respected** — in the end, no change was needed. |

---

## 10. Known limitations / risks

- **AR/AP aging sums a single currency.** The Reports panel filters to the
  selected currency so totals are honest, but there's no cross-currency roll-up
  (fine for a mostly-GBP solo founder; note it if that changes).
- **AP aging = approved-unreimbursed expenses** only. Obligations + due
  compensation payments (which also have amounts/dates) are a reasonable future
  addition to "payables".
- **Webhook idempotency cache is single-process/in-memory** (mirrors ecommerce).
  For HA, swap to a durable `processed_webhook_events` table. The reconcile is
  *also* idempotent on the PaymentIntent, so a restart can't double-charge.
- **The delight wire records at "delivered".** If a delight's cost is edited
  after delivery, the expense isn't updated (it's created once, idempotently).
  Acceptable for v1; revisit if costs change post-delivery.
- **Live-data reminder:** this app's Supabase admin client hits **real** data
  even in dev. None of the finance work writes to Supabase (finance state is
  plugin/PortalState, file/memory backend in dev), but keep it in mind.

---

## 11. Where everything lives (file map)

**Created**
- `built-ins/modules/agency-finance/src/lib/sections.ts` (P1 nav source)
- `built-ins/modules/agency-finance/src/lib/channels.ts` (P2)
- `built-ins/modules/agency-finance/src/lib/moneyIn.ts` (P2)
- `built-ins/modules/agency-finance/src/lib/stripe.ts` (P3 adapter)
- `built-ins/modules/agency-finance/src/server/stripeReconcile.ts` (P3 core)
- `built-ins/modules/agency-finance/src/api/handlers-stripe.ts` (P3 routes)
- `built-ins/modules/agency-finance/src/lib/aging.ts` (P5)
- `lib/server/closeDeal.ts` (P4a engine)
- `app/api/tenants/close-deal/route.ts` (P4a route)
- `lib/server/clientDelightExpense.ts` (You-Deserve-It wire)
- `scripts/smoke-finance-{channels,stripe,close-deal,aging,delight-expense}.test.ts`

**Changed**
- `built-ins/modules/agency-finance/index.ts` (P1 navItems derive; P3 Stripe settings)
- `built-ins/modules/agency-finance/src/components/FinanceNav.tsx` (P1)
- `built-ins/modules/agency-finance/src/components/IncomeSheet.tsx` (P2)
- `built-ins/modules/agency-finance/src/api/routes.ts` (P3 routes registered)
- `built-ins/modules/agency-finance/src/server/payments.ts` (P3: `findByExternalRef`/`markRefunded`/`markDisputed`)
- `built-ins/modules/agency-finance/src/components/InvoiceDetailClient.tsx` + `pages/InvoiceDetailPage.tsx` (P3 "Pay by card")
- `built-ins/modules/agency-finance/src/pages/ReportsPage.tsx` (P5 aging panel)
- `lib/server/resolutionPlans.ts` (P1 bug fix)
- `app/portal/clients/[clientId]/_FinanceTabClient.tsx` (P4a "Close the deal" card)
- `app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx` (P4b close-lead)
- `app/api/tenants/client-delight/route.ts` (wire hook)
- tests: `scripts/smoke-{operational-notifications,nav-audit,finance-operations}.test.ts`

**Docs kept current** (the discipline): [updates.md](updates.md) (an entry per
phase), [status.md](status.md) (honest per-feature verification), the
[feature-index](../workspace/feature-index.md) "Money & finance" section,
[hazards-and-duplication.md](../workspace/hazards-and-duplication.md) (channel
single-source, per-plugin Stripe wrapper, public-webhook, two/three contract
systems, dead expense events), [api-reference](../workspace/api-reference.md)
(`/api/tenants/close-deal`), and the regenerated symbol reference.

---

## 12. If you pick this up next

- **Start here**, then [the plan](plans/finance-command-surface.md) and
  [status.md](status.md).
- **Before editing anything finance:** search
  [`docs/reference/`](../reference/00-index.md) + the feature-index, and read the
  finance rows in [hazards](../workspace/hazards-and-duplication.md).
- **Preserve the safety line** (§0): never hold funds; keys are Ed's; TEST mode
  until Ed says otherwise; record + surface + reconcile only.
- **Run the full suite before calling anything done** (§3), and be honest in
  status.md about what's browser-verified vs unit-tested.
