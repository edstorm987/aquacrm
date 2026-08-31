# TODO — the one list

**This is the only task list.** `checklist.md` and `todo.md` are retired; they held the
same work in two wordings, **130 of ~145 issue ids appeared in both**, and **7 issues were
marked done in one file while still open in the other** — so neither could be trusted on
its own. Nothing was dropped: every open row from both files is here, and a script
checked that afterwards.

Detail, evidence and reproduction for every `#N` stays in [`issues.md`](issues.md), which
remains the backing store. This file is the index over it.

| | meaning |
| --- | --- |
| `[ ]` | not started |
| `[~]` | part done, remainder named in `issues.md` |
| `⚠ disputed` | the retired files disagreed; the **less complete** status was taken. Verify against source before trusting it. |

---

## 🔒 Blocked on you — 8

Nothing here moves without an account, a credential or a decision from you. Taken from
the retired files' own Ed-only sections, minus one they had mis-filed (`#1`, RLS, whose
own note reads *"NOT Ed's task"* — it is engineering, and sits below). The questions
behind several of these are [`ED-QUESTIONS.md`](ED-QUESTIONS.md) Q1–Q24.

- [ ] Walk the onboarding chain  <sub>from checklist.md, no issue number</sub>
- [ ] Stripe live-account walkthrough  <sub>from checklist.md, no issue number</sub>
- [ ] Meta Developer app  <sub>from checklist.md, no issue number</sub>
- [ ] Deployment env verification  <sub>from checklist.md, no issue number</sub>
- [ ] Apply the pending Supabase migrations before production rollout  <sub>from checklist.md, no issue number</sub>
- [ ] DPO sign-off  <sub>from checklist.md, no issue number</sub>
- [ ] Aqua Tag form-capture consent → [#2](issues.md)
- [ ] Mounted browser acceptance of the isolated preview lifecycle (2026-08-27, isolated `sandbox:fork` lane on port 3047; port 3032 untouched throughout) → [#161](issues.md) `⚠ disputed`

## P0 — before any production use — 1

- [~] Ecommerce Checkout is server-authoritative; finish public-route and live acceptance → [#69](issues.md)

## P1 — before broader launch — 60

- [~] Editor AI database coordination is implemented; live DB proof remains → [#18](issues.md)
- [ ] Complete Editor dirty-state browser acceptance → [#19](issues.md) `⚠ disputed`
- [ ] Public showcase capability boundary and shared fixture are repaired → [#21](issues.md) `⚠ disputed`
- [~] Keep the repaired production build as a release gate → [#27](issues.md) `⚠ disputed`
- [ ] Repair the website-editor API contract before calling the editor complete → [#28](issues.md)
- [ ] Website Editor commerce contracts are unified; finish public-route and browser acceptance → [#29](issues.md) `⚠ disputed`
- [ ] Repair website export before offering it as a backup or migration path → [#30](issues.md)
- [ ] Remove or integrate the browser-local Website Editor stations → [#31](issues.md)
- [ ] Stop reporting queued campaign mail as sent → [#32](issues.md)
- [ ] Finish the paid Memberships foundation adapter → [#33](issues.md)
- [ ] Make plugin health a real monitored lifecycle → [#35](issues.md)
- [ ] Make Build custom portal reach a real service → [#36](issues.md)
- [ ] Make project provision, GitHub publish and Vercel deploy retry-safe → [#37](issues.md)
- [ ] Make all private uploads/deletes transactional and retryable → [#38](issues.md)
- [ ] Make Close the deal issue a reviewable, truthfully delivered contract → [#39](issues.md)
- [ ] Make commercial proposal/receipt delivery truthful → [#40](issues.md)
- [ ] Bind proposal acceptance and payment to an immutable sent version → [#41](issues.md)
- [ ] Make installment subscriptions stop exactly and verifiably → [#42](issues.md)
- [ ] Make Email Sender production setup reachable and real → [#43](issues.md)
- [ ] Wire Affiliate Stripe Connect or stop offering it → [#45](issues.md)
- [~] Code/behaviour resolved — browser-accept the canonical client lifecycle → [#46](issues.md)
- [ ] Finish live visual acceptance for convergent client phase transitions → [#55](issues.md)
- [ ] Preserve unavailable read state instead of manufacturing emptiness → [#57](issues.md)
- [ ] Lead archive is destructive and leaves a hidden card → [#62](issues.md) `⚠ disputed`
- [ ] Membership/Affiliate deletion strands active dependants → [#63](issues.md)
- [ ] SOP deletion silently removes live operating instructions → [#64](issues.md)
- [ ] The authoritative Company capital/governance register accepts contradictory records → [#65](issues.md)
- [ ] Battle Table saves can erase another executive change, and “locked” reviews are mutable → [#66](issues.md)
- [ ] Legal-document deletion strands compliance and governance evidence → [#67](issues.md)
- [~] Code/behaviour resolved — complete mounted/live-provider acceptance for transactional gift-card and custom-code value → [#70](issues.md)
- [~] Code/behaviour resolved — browser-accept versioned Product/Variants authoring → [#71](issues.md)
- [~] Code/behaviour resolved — browser-accept the Ecommerce inventory ledger → [#73](issues.md)
- [~] Code/behaviour resolved — live-accept Ecommerce shipping/tax quotes → [#74](issues.md)
- [~] Code/behaviour resolved — live-accept the Ecommerce provider ledger → [#75](issues.md)
- [~] Public Funnel capture visibility and ordinary retry are repaired; exact cross-process side-effect delivery remains → [#79](issues.md)
- [~] Canonical lead identity is conflict-safe inside one application process; database-native uniqueness remains → [#80](issues.md)
- [~] Opportunity money is safe under same-process races; distributed provider delivery remains → [#81](issues.md)
- [ ] Mounted Marketing records are isolated and stale-safe in one process; distributed compare-and-set remains → [#82](issues.md) `⚠ disputed`
- [~] Agency Marketing lead identity is canonical and race-safe in one process; distributed uniqueness remains → [#83](issues.md)
- [~] Aqua Tags stop-routing is non-destructive; mounted click acceptance remains → [#85](issues.md)
- [~] Make Aqua Tag form ingestion durable and order-independent → [#87](issues.md)
- [~] Finish crash-coherent Dev Team truth writes → [#88](issues.md)
- [~] Client schedules and Finance Plans are converged; mounted browser acceptance remains → [#121](issues.md)
- [~] Membership changes now share one durable provider-backed command; mounted/live acceptance remains → [#122](issues.md)
- [~] Membership webhooks now use a retryable scoped inbox; live-provider acceptance remains → [#123](issues.md)
- [~] Affiliate commissions now have one recoverable payout owner; mounted/live-provider acceptance remains → [#124](issues.md)
- [~] Affiliate currency/refund accounting is code- and behaviour-complete; mounted/live acceptance remains → [#125](issues.md)
- [~] Membership/Affiliate runtime validation is code- and behaviour-complete; mounted acceptance remains → [#126](issues.md)
- [~] Performance report history is code- and behaviour-repaired; mounted acceptance remains → [#128](issues.md)
- [~] Performance experiment integrity is code- and behaviour-repaired; mounted acceptance remains → [#129](issues.md)
- [~] Aqua Advisor turns are code/domain-behaviour durable; mounted provider acceptance remains → [#130](issues.md)
- [ ] Mount and prove real application observability → [#132](issues.md)
- [ ] Make every true modal keyboard-contained and restore focus → [#135](issues.md)
- [ ] Name every important action and published-form field for assistive technology → [#139](issues.md)
- [~] Make date-only business values local-calendar safe → [#140](issues.md)
- [ ] Harden voice and call recording across browser formats and failures → [#145](issues.md)
- [~] Relative countdown deadline code/service behaviour is repaired; mounted acceptance remains → [#146](issues.md)
- [~] Team Chat and notification response-order code is repaired; mounted acceptance remains → [#147](issues.md)
- [~] Named core storage/provider waits are bounded; finish mounted/live acceptance → [#148](issues.md)
- [ ] Free a server + verify the critical flows for real  <sub>from todo.md, no issue number</sub>

## P2 — quality and correctness — 19

- [~] File-backend persistence is truthful and atomic → [#16](issues.md) `⚠ disputed`
- [~] Reference validation remains a broad open class; the audited client-route slice is fixed → [#20](issues.md)
- [~] Reconcile staff capability policy → [#25](issues.md)
- [ ] Make Stripe refund/dispute event handling durably idempotent → [#26](issues.md)
- [ ] Most plugin settings schemas are not user-operable → [#44](issues.md)
- [~] Stop mutation controls swallowing non-success responses → [#47](issues.md)
- [ ] Finish Notepad autosave browser acceptance → [#54](issues.md)
- [ ] Mounted acceptance remains for settled utility controls → [#61](issues.md)
- [~] Agency Marketing campaign writes and reports are truthful in one process; distributed mutation safety remains → [#84](issues.md)
- [~] Finance settings now control new invoices/documents; browser acceptance remains → [#120](issues.md)
- [ ] Make Radar scheduling match its taxonomy → [#131](issues.md)
- [ ] Expose a real loading status for the Command Centre → [#136](issues.md) `⚠ disputed`
- [ ] Standardise tabs, menus and listboxes or remove their specialised roles → [#138](issues.md)
- [ ] Provide and prove the real global error fallback → [#141](issues.md)
- [ ] Make the customer portal genuinely installable in Chromium → [#142](issues.md)
- [ ] Remove render-time `window` from published current-page blocks → [#143](issues.md)
- [ ] Stream private audio/video with a real byte-range contract → [#144](issues.md)
- [~] Finish production-durable Dev Team authoring and live signals  <sub>from checklist.md, no issue number</sub>
- [~] Finish production-durable Dev Team authoring/signals  <sub>from todo.md, no issue number</sub>

## Unprioritised — 36

- [~] DB Row-Level Security — ⚠ NOT Ed's task, and no longer a 🔴 decision. CORRECTED 2026-08-23 → [#1](issues.md)
- [ ] Meta / Instagram inbox — self-serve "Connect now" → [#11](issues.md)
- [ ] Governance's company selector mixes other brands into scoped evidence and erasure → [#68](issues.md)
- [ ] Finish role-aware account and portal recovery navigation → [#133](issues.md)
- [ ] Keep customer installation help revisitable → [#134](issues.md)
- [~] Customer Bookings code/behaviour is capability-driven; mounted proof remains → [#149](issues.md)
- [~] Social Inbox's inert More control is removed; mounted confirmation remains → [#150](issues.md)
- [~] The bounded Dev Team/Agency speed implementation, production benchmark and representative browser acceptance are complete → [#151](issues.md) `⚠ disputed`
- [~] Client-workspace 404 bootstrap code is repaired; browser console recheck remains → [#152](issues.md)
- [~] Staff, Fulfilment and broad exact-client runtime adoption  <sub>from checklist.md, no issue number</sub>
- [~] Combined verification is settling  <sub>from checklist.md, no issue number</sub>
- [ ] Release browser gate  <sub>from checklist.md, no issue number</sub>
- [ ] Application-wide parity  <sub>from checklist.md, no issue number</sub>
- [~] Aqua Editor AI distributed replay code is complete; deployment proof is open  <sub>from checklist.md, no issue number</sub>
- [~] Editor unsaved-work source bypasses are closed  <sub>from checklist.md, no issue number</sub>
- [ ] Stripe refund/dispute event deduplication is process-local  <sub>from checklist.md, no issue number</sub>
- [~] Aqua Editor AI multi-instance claim  <sub>from checklist.md, no issue number</sub>
- [~] Aqua Editor AI reply replay guard  <sub>from checklist.md, no issue number</sub>
- [ ] Full browser authoring round trip  <sub>from checklist.md, no issue number</sub>
- [ ] Unsaved-work and project-prefill browser matrix  <sub>from checklist.md, no issue number</sub>
- [~] Reusable Dev Workspace is mounted; client-facing completion remains  <sub>from checklist.md, no issue number</sub>
- [ ] Engine widening + assistant proposals  <sub>from checklist.md, no issue number</sub>
- [ ] Stages hold elements  <sub>from checklist.md, no issue number</sub>
- [ ] Wizard engine  <sub>from checklist.md, no issue number</sub>
- [~] Aqua Tag backbone remainders  <sub>from checklist.md, no issue number</sub>
- [ ] Env-only audit  <sub>from checklist.md, no issue number</sub>
- [ ] Backfill phase ticks  <sub>from checklist.md, no issue number</sub>
- [ ] Re-enter the Aqua Tag routing config  <sub>from checklist.md, no issue number</sub>
- [~] Complete behavioural browser acceptance  <sub>from todo.md, no issue number</sub>
- [ ] Battle Table overhaul → live war-room  <sub>from todo.md, no issue number</sub>
- [ ] Operations / System surface — the KNOW side (governance)  <sub>from todo.md, no issue number</sub>
- [ ] Advisor omega upgrade  <sub>from todo.md, no issue number</sub>
- [~] Marketing workspace overhaul  <sub>from todo.md, no issue number</sub>
- [ ] "You Deserve It" upgrade  <sub>from todo.md, no issue number</sub>
- [ ] Two inbox surfaces  <sub>from todo.md, no issue number</sub>
- [ ] The rest  <sub>from todo.md, no issue number</sub>

---

## Done — 57 issue ids

Ids only. The account of each is in `issues.md`; the running narrative is in
`updates.md` and `CAMPAIGN-LEDGER.md`.

#4 #5 #8 #10 #17 #22 #23 #24 #34 #48 #49 #50 #51 #52 #53 #56 #58 #59 #60 #76 #78 #86 #89 #90 #91 #92 #93 #94 #95 #96 #97 #98 #99 #100 #101 #102 #103 #104 #105 #106 #107 #108 #109 #110 #111 #112 #113 #114 #115 #116 #117 #118 #119 #127 #137 #153 #154
