# Plan — "You Deserve It" upgrade (recognition, gifting & experiences)

← [todo.md](../TODO.md) · [development.md](../../development.md)

**Status: PLAN — one slice of Phase 3 already landed under the Finance plan (P5, 2026-08-19); see the File map before starting.**
gifting tracker into a **recognition & experiences hub**: who deserves something
(from health/reputation + meaningful dates), plan + self-curate it, buy it via
suppliers, and have the cost flow into finance behind sign-off — for clients
**and** staff. **Human-curated — no AI guessing what to send.**

## Audit — where we are (verified — richer than it feels)
`_YouDeserveItWorkspace` (712L) over the **`clientDelight`** model already has:
- **Views:** catalogue · live · **staff** · **health** · brands · **delivered**.
- **Occasions:** welcome · **birthday** · christmas · milestone · event · **trip/retreat** · just-because · **signature moment** · other.
- **Audience:** staff **and** client. **Lifecycle:** idea → planned → ordered → sent → delivered → cancelled.
- **Fields:** supplier · **costCents** · recipient · included items · due date · experience package · fulfilment steps.
- Plus: `experiencePackages` catalogue, and agency-finance's **expense approval flow** (`expense.approved`, approve-before-reimburse).

**So the bones are strong.** The gaps are the *connective tissue*:
1. **No meaningful-date capture** — the *occasions* exist (birthday, etc.) but the **dates to trigger them don't** (no birthday / contract-signed / relationship-start stored). So nothing tells you "it's their birthday."
2. **"Who deserves something" isn't driven** — the health view exists but isn't wired to *surface* who's doing great (reward) or struggling (morale lift), with **indicators**; reputation isn't mixed in.
3. **Gift cost doesn't flow to finance** — `costCents` is recorded but doesn't create an **approval-gated expense** that loads into finance.
4. **Suppliers are just text** — no ordering hook-up ("press a button to buy"), no multi-supplier packaging.
5. **Trips / networking / retreats** planning is thin (the occasion exists; the planning doesn't).
6. **The "why" ledger** — "delivered" lists what, not a full *what-we-sent-whom-and-why* record.

## Goals
1. **Know the moments** — birthdays, contract-signed, relationship-start → reminders + "deserves something" nudges.
2. **See who deserves it** — client **health + reputation** indicators → good = reward, struggling = morale; staff too.
3. **Plan + self-curate** — gifts, experiences, **trips / networking / client retreats**, for clients + staff; packages from **multiple suppliers**, assembled at the office. **No AI guessing.**
4. **Buy it** — supplier hook-up to order with a button (honest constraint below).
5. **Money flows right** — a planned gift → an **expense awaiting sign-off** → on approval, loads into finance.
6. **Remember** — a recognition ledger: what we sent, to whom, when, **why**.

## The gaps → what to build
### A. Meaningful dates (the trigger layer)
Capture **birthday** (Person), **contract-signed / relationship-start** (Client, from `clientContracts`/first record), staff birthdays/anniversaries (HR). Surface upcoming ones + auto-suggest the matching occasion (birthday → "birthday" gift). Feeds operational reminders.

### B. Deserve indicators (health + reputation)
Wire the **health view** to the [Client Health](client-health.md) signal + a **reputation** signal (sentiment/reviews) → indicators on each client/staff: *thriving → reward*, *at-risk → morale lift*. Human decides **what**; the system only says **who + why**.

### C. Plan + curate experiences
Extend beyond single gifts: **trips, networking events, client retreats** with multiple recipients + logistics; **multi-supplier packages** (items from different suppliers, "assemble at office" fulfilment step). Reuse `experiencePackages` + the fulfilment-steps model.

### D. Gift → approval-gated expense → finance
On plan/order, create an **expense awaiting approval** (reuse agency-finance's `expense.approved` flow) tagged to the delight record; on approval it loads into finance + reimbursement. Cost, supplier, occasion carried through. Status stays in sync (approved expense → gift can proceed to ordered).

### E. Supplier ordering (the button)
Hook up suppliers so Ed can **order from the record**. **Honest constraint:** the app *prepares* the order (basket, supplier, address, cost) and Ed **confirms the purchase** — spending money is a deliberate, confirmed human action, not something automated. Multi-supplier packages = several prepared orders under one gift.

### F. Recognition ledger
Extend "delivered" into a full ledger — **what · whom · when · why · cost · occasion · outcome** — so there's a defensible, warm record of every gesture (per client + staff).

### G. Wire into the client internal workspace + Radar (Ed)
- **Client internal workspace** — surface a client's recognition context **inside their workspace** (`clients/[clientId]`): upcoming dates, their gift/delight **history** (the ledger scoped to them), the **deserve indicator**, and a "plan something" action — so you can reward a client *without leaving their workspace*. A panel/tab reading the same `clientDelight` records. Fits naturally next to the relationship/record tab.
- **Radar** — the deserve-**moments** (birthday approaching, relationship anniversary, thriving → reward, at-risk → morale lift) become **Radar nudges / operational alerts**, surfaced in **Command Centre *and* the client workspace**, each with a resolution path straight into You Deserve It. So **Radar tells you *when*** someone deserves something; **you curate *what*.** Reuses the operational-alert / attention model (honest, actionable, human-accept — never auto-sends).

## Phases (simple-first)
1. **Meaningful dates + reminders** — capture birthdays/contract-signed/relationship-start; surface upcoming → "deserves something" nudges.
2. **Deserve indicators** — wire health + reputation into the who-deserves view.
3. **Gift → expense sign-off → finance** — the approval-gated expense wiring.
4. **Experiences** — trips/networking/retreats + multi-supplier packages.
5. **Supplier ordering** — the prepare-order + confirm-purchase button.
6. **Recognition ledger** — the full what/whom/why record.
7. **Client workspace + Radar wiring** — the per-client recognition panel in `clients/[clientId]`, and the deserve-moment nudges as Radar/operational alerts (Command Centre + client workspace). *(Weave the Radar nudges in as the date/indicator phases land — phases 1–2 produce the moments, this surfaces them.)*

## Reuse
`clientDelight` + `experiencePackages` (the core — extend, don't replace) · agency-finance **expense approval** flow · [Client Health](client-health.md) (the indicators) · `clientContracts` + record ledger (relationship dates) · HR/people (staff dates) · the marketing **reputation** concept · the **client internal workspace** (`clients/[clientId]` — a recognition panel) · the **Radar/operational-alert** model (deserve-moment nudges).

## Decisions (Ed)
- **Reputation source** — reviews/sentiment from where (Google/Trustpilot integration, or manual for now)?
- **Supplier ordering** — real integrations (which suppliers) vs. a "prepare + confirm + mark ordered" flow first (no integration, still one-button)?
- Staff recognition — same surface as clients, or a staff-specific lens?

## Non-goals
- **No AI curation** — the system surfaces *who + why + when*; **Ed chooses what to send**.
- **The app never spends money on its own** — it prepares orders; the purchase is Ed's confirmed action.

## Ties
[Client Health](client-health.md) (deserve indicators), agency-finance (the
expense flow), the marketing **reputation** view, `clientContracts` + HR (dates),
the **client internal workspace** (per-client recognition panel), and **Radar**
(deserve-moment nudges → Command Centre + client workspace).

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/server/clientDelight.ts`
- `src/server/types.ts`
- `src/server/storage.ts`
- `src/app/portal/agency/you-deserve-it/page.tsx`
- `src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx`
- `src/app/api/tenants/client-delight/route.ts`
- `src/lib/server/clients/clientDelightExpense.ts`
- `scripts/smoke-finance-delight-expense.test.ts`
- `src/server/persons.ts`
- `src/lib/server/inbox/operationalAlerts.ts`
- `src/app/portal/clients/[clientId]/_tabs.ts`
- `src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx`
- `docs/development/plans/you-deserve-it-upgrade.md`
