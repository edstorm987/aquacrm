# Plan — Finance: multi-channel money visibility + one-button close ⭐

← [todo.md](../todo.md) · [development.md](../../development.md) · **[HANDOFF »](../finance-command-surface-HANDOFF.md)** (build record — problems, tests, decisions, what's left)

**Status: ✅ COMPLETE — P1–P5 + the You-Deserve-It wire all shipped (2026-08-19)** — coherence,
channel model + money-in view, Stripe (TEST-mode, unit-tested), one-button close (client + lead),
AR/AP aging, and delight-spend → Finance. **Remaining is non-code:** Ed's **live Stripe
verification** (`npm i stripe` + TEST keys + a webhook endpoint), and a `finance:refund`/
`finance:chargeback` alert in `operationalAlerts.ts` (the client-health worker's file). See
[updates.md](../updates.md) + [status.md](../status.md).
Turn Finance from a real-but-sprawling *manual* money
tracker into a **visibility + orchestration layer across every payment channel** —
bank transfer, Stripe, cash, other — that **never holds money**, with the flagship
**one-button "close in the meeting"** flow (contract + routed payment + invoice,
auto-handled) and Stripe wired for the online channel incl. **refunds + chargebacks**.

## Core principles (Ed's vision, 2026-08-19) — the spine of the plan
1. **Not custody.** AquaCRM **never holds or moves funds.** Money always flows client →
   Ed's own Stripe / bank / cash **directly**. The app generates pay-links, records
   receipts, reconciles, and surfaces — it is the *visibility + orchestration* layer,
   never the wallet. (This is both the intent AND the safe design.)
2. **Multi-channel, not one gateway.** Payments arrive by **bank transfer, Stripe, cash,
   other** — no channel forced, each first-class. Stripe is automated; the rest are
   recorded/reconciled.
3. **Visibility with layers on top.** One unified money picture across all channels,
   feeding the intelligence already wired (KPI, Radar `finance` domain, client health).

## Where we are (from the read-only audit)
- `agency-finance` plugin (alpha v0.1) is **genuinely real**: invoices (create/send/
  mark-paid/HTML/templates), payments (already carry `PaymentMethod` + `externalRef`),
  expenses + approvals, budgets + runway, obligations/payroll, planning, computed P&L
  (MRR/ARR/churn, honest empty-state flags). **Both macro + micro** (agency-wide + a real
  per-client finance tab). Deeply wired into battle-table / Command Centre / KPI / Radar
  finance domain / client-health overdue.
- **Gaps:** getting paid is **manual** — no payment integration *in* Finance (`stripeLink`
  is a pasted URL); **no refunds/chargebacks**; **no cash reality** (no bank balance /
  reconciliation / AR-AP aging); profitability blind to labour. **Sprawl:** 13 pages, two
  drifting nav defs, a double-mounted dashboard, "Finance" registered twice in the sidebar,
  3 half-landed tail pages (Plans, Deposits, Settings). Finance is **absent from the docs
  map** (no feature-index/hazards row).
- **Reuse (don't reinvent):** **real Stripe already ships** in `ecommerce` /
  `leads-pipeline` / `memberships` plugins (checkout, webhooks, refunds) — a proven pattern
  to lift. **Contracts/proposals** exist in `leads-pipeline` (Journey: `commercial.ts`,
  `_CommercialPackModal.tsx`, `app/proposal/[token]/`). A **payment-request** route exists
  (`app/api/portal/journey/payment-request/route.ts`). `InvoiceService`/`PaymentService`
  are real. `Payment.method`/`externalRef` already model channel + external id.

## Phases (simple-first)
1. ✅ **Cohere the sprawl.** One nav (kill the drifting second def, the double-mounted
   dashboard, the double sidebar registration), **finish or cut** Plans / Deposits /
   Settings, and **add Finance to `feature-index.md` + `hazards-and-duplication.md`**.
   Clean base + instant de-spin. Also fix the latent `paymentPlans` vs `clientPaymentPlans`
   key mismatch in `resolutionPlans.ts`.
2. ✅ **Channel model + unified money-in visibility.** Make payment **channel** first-class —
   `bank-transfer | stripe | cash | other` — each with its own receipt handling; a unified
   **"money in across everything"** view (all channels, statuses, per-invoice channel).
   **No custody — record + surface only.** (Substrate exists: `Payment.method`/`externalRef`.)
3. ✅ **Wire in Stripe (online channel) + refunds/chargebacks.** Ed's Stripe (keys via secure
   config/env — **Ed supplies + verifies; workers never handle live keys**): per-invoice
   **pay-link/checkout**, **webhook → auto-mark-paid + auto-reconcile**, and **refunds +
   chargebacks** captured → status flows back to the invoice/payment + a Radar/alert.
   **Reuse the existing plugin Stripe pattern.**
4. ✅ **The one-button close (flagship).** In a sale, **one action** →
   **contract** (reuse the leads-pipeline proposal/commercial-pack) +
   **routed payment** (Stripe pay-link, or bank details, or cash-expected — per chosen
   destination) + **invoice**, all stitched, sent, and tracked. Spans **Journey (contract)
   + Finance (payment+invoice)**.
5. ✅ **Reconciliation + hygiene.** Manual match for bank/cash, auto for Stripe; **AR/AP
   aging**; refund/chargeback surfaced everywhere; wire **You-Deserve-It spend → Finance**;
   give the dead `expense.*` events a job (or retire them).

## Reuse (name-checked)
Existing Stripe in `ecommerce`/`leads-pipeline`/`memberships`; leads-pipeline
proposals/contracts + `app/proposal/[token]`; `journey/payment-request`; `InvoiceService` /
`PaymentService`; `Payment.method`/`externalRef`; the `agency-finance` container.

## Decisions (Ed) — baked defaults, redline welcome
- **Bank transfers:** manual-first (show your bank details on the request + reconcile/
  mark-paid). Open-banking bank-feed = **later/optional** (heavy). [default: manual-first]
- **Payment destination at close:** choose channel at close-time (Stripe link / bank /
  cash-expected); default **Stripe** for online. [confirm]
- **Stripe account:** your own, keys via secure config, **you verify in your Stripe**.
  [locked by your ask]
- **Profitability + labour** (P-later): allocate people-cost per client — depends on Staff
  time data. [flag, not this plan's core]

## Coordination / collision (for the commander)
- ⚠ **Stripe keys are Ed's, entered by Ed via secure config; commander + workers NEVER
  handle live payment keys, and the app NEVER holds funds.** (Safety + credential boundary.)
- ⚠ **The one-button flow spans Journey (`leads-pipeline` contracts/proposals) + Finance** —
  coordinate; `leads-pipeline` is currently free (erasure done).
- ⚠ **`operationalAlerts.ts` is owned by the client-health worker** → Finance stays out of
  it for now; route new finance alerts through client-health or after it lands.
- ⚠ **You-Deserve-It → Finance wire (P5)** overlaps the you-deserve-it plan → sequence.
- Owns the `agency-finance` plugin (now free — erasure done) + the per-client finance tab.
  `types.ts` additive only (shared, different regions).

## Done when (runtime-verified)
On a local dev server: **one action** sends a contract + routed payment + invoice; a **Stripe
test payment auto-marks-paid + reconciles**; a **refund/chargeback flows back** to the record;
**bank/cash receipts record + reconcile manually**; the **unified money view** shows every
channel in one place — and the **app never holds funds** (money → Ed's Stripe/bank directly).
Ed verifies the Stripe path against his **real Stripe** account.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/built-ins/modules/agency-finance/`
- `src/lib/server/closeDeal.ts`
- `src/app/api/tenants/close-deal/route.ts`
- `src/lib/server/resolutionPlans.ts`
- `src/lib/server/clients/clientDelightExpense.ts`
- `src/app/portal/clients/[clientId]/_FinanceTabClient.tsx`
- `src/lib/chrome/sidebarLayout.ts`
- `scripts/smoke-finance-channels.test.ts`
- `scripts/smoke-finance-stripe.test.ts`
- `scripts/smoke-finance-close-deal.test.ts`
- `scripts/smoke-close-deal-route.test.ts`
- `scripts/smoke-finance-aging.test.ts`
- `scripts/smoke-finance-delight-expense.test.ts`
- `scripts/smoke-finance-idempotency.test.ts`
- `scripts/smoke-finance-operations.test.ts`
- `scripts/smoke-finance-budget-control.test.ts`
- `docs/development/plans/finance-command-surface.md`
- `docs/development/finance-command-surface-HANDOFF.md`
