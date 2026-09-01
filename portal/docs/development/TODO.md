# TODO — the one list

**This is the only task list.** `checklist.md` and `todo-retired.md` are retired; they held the
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

## 🔒 Blocked on you — 9

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
- [ ] Choose the permanent last-grant revocation policy → [#174](issues.md)
- [ ] Decide whether client identities get indistinguishable sibling-project 404s → [#163](issues.md)

## P0 — before any production use — 1

- [~] Ecommerce public authority, allowlisted product/receipt DTOs and local end-to-end are verified; finish custom-domain + live Stripe/provider acceptance → [#69](issues.md)

## P1 — before broader launch — 57

- [~] Editor AI database coordination is implemented; live DB proof remains → [#18](issues.md)
- [~] Complete Editor dirty-state browser acceptance → [#19](issues.md) `⚠ disputed`
- [~] Public showcase capability boundary and shared fixture are repaired → [#21](issues.md) `⚠ disputed`
- [~] Continue repairing Website Editor API contracts; exact-scope AI gating is fixed and the dead-call ratchet is 14 → [#28](issues.md)
- [~] Website Editor now has a narrow anonymous Ecommerce facade and Product Search is publishable; finish the remaining visitor backends and browser acceptance → [#29](issues.md) `⚠ disputed`
- [~] Paid Memberships foundation is real; finish live Stripe lifecycle acceptance → [#33](issues.md)
- [~] Build custom portal now reaches the canonical provisioner; mounted provision/reload acceptance remains → [#36](issues.md)
- [~] Private-upload attach, post-storage replay/concurrency, rollback, anonymous failure redaction and client-file delete recovery are repaired; finish staged abandonment and legal/SOP/development delete finalisation → [#38](issues.md)
- [~] Close the deal is reviewable and truthful; finish mounted agency/customer acceptance → [#39](issues.md)
- [~] Proposal/receipt delivery is truthful; finish live-provider refusal/retry acceptance → [#40](issues.md)
- [~] Proposal acceptance is version-bound; finish mounted public acceptance → [#41](issues.md)
- [~] Installments stop exactly in code; finish live Stripe refusal/retry acceptance → [#42](issues.md)
- [~] Email Sender setup and SMTP delivery are real; finish live-provider browser acceptance → [#43](issues.md)
- [~] Affiliate Stripe Connect is wired and gated; finish live Stripe payout acceptance → [#45](issues.md)
- [~] Code/behaviour resolved — browser-accept the canonical client lifecycle → [#46](issues.md)
- [~] Finish live visual acceptance for convergent client phase transitions → [#55](issues.md)
- [~] Portal Editor, attention, expense-field, KPI, completed-history and phase-catalogue reads are truthful; finish the remaining communications/Finance/search/governance fallbacks and mounted fault acceptance → [#57](issues.md)
- [~] Membership/Affiliate dependency inventories exist; choose and enforce safe deletion policy → [#63](issues.md)
- [~] SOP dependency inventory exists; choose and enforce safe deletion policy → [#64](issues.md)
- [~] Company capital/governance invariants are guarded; finish mounted acceptance → [#65](issues.md)
- [~] Battle Table revisions/locks are guarded; finish mounted acceptance → [#66](issues.md)
- [~] Legal dependency preview/refusal exists; finish mounted/provider acceptance → [#67](issues.md)
- [~] Code/behaviour resolved — complete mounted/live-provider acceptance for transactional gift-card and custom-code value → [#70](issues.md)
- [~] Code/behaviour resolved — browser-accept versioned Product/Variants authoring → [#71](issues.md)
- [~] Code/behaviour resolved — browser-accept the Ecommerce inventory ledger → [#73](issues.md)
- [~] Code/behaviour resolved — live-accept Ecommerce shipping/tax quotes → [#74](issues.md)
- [~] Code/behaviour resolved — live-accept the Ecommerce provider ledger → [#75](issues.md)
- [~] Public Funnel capture visibility and ordinary retry are repaired; exact cross-process side-effect delivery remains → [#79](issues.md)
- [~] Canonical lead identity is conflict-safe inside one application process; database-native uniqueness remains → [#80](issues.md)
- [~] Opportunity money is safe under same-process races; distributed provider delivery remains → [#81](issues.md)
- [~] Mounted Marketing records are isolated and stale-safe in one process; distributed compare-and-set remains → [#82](issues.md) `⚠ disputed`
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
- [~] Server error capture/readiness is mounted and the repaired cross-runtime graph is browser-clean and production-build green (244/244); install and live-prove the production client sink → [#132](issues.md)
- [~] Every declared modal uses the shared focus/restore contract; mounted representative keyboard acceptance remains → [#135](issues.md)
- [~] Named internal actions and published fields are guarded; mounted accessibility-tree acceptance remains → [#139](issues.md)
- [~] Make date-only business values local-calendar safe → [#140](issues.md)
- [~] Voice/call recorder negotiation and failure cleanup are repaired; mounted cross-browser acceptance remains → [#145](issues.md)
- [~] Relative countdown deadline code/service behaviour is repaired; mounted acceptance remains → [#146](issues.md)
- [~] Team Chat and notification response-order code is repaired; mounted acceptance remains → [#147](issues.md)
- [~] Named core storage/provider waits are bounded; finish mounted/live acceptance → [#148](issues.md)
- [~] Execute relational extraction, backfill, RLS and atomic-outbox phases; semantic Phase 0 and durable KPI identities are shipped, while outbox consumer acknowledgement/retry/dead-letter remains open → [data migration plan](../data/MIGRATION-PLAN.md)
- [~] Editor `requiresPlugin` gating is code/behaviour-complete and an enabled tenant palette is browser-proven; compare disabled state and disable/reload preservation → [#183](issues.md)
- [~] Build missing visitor backends, starting with consent-aware tenant contact capture → [#184](issues.md)
- [ ] Classify and expose visitor-safe public module operations one route at a time → [#185](issues.md)
- [~] Isolated server/browser lane is restored; finish the remaining critical-flow acceptance  <sub>from todo-retired.md, no issue number</sub>

## P2 — quality and correctness — 15

- [~] Reference validation remains a broad open class; the audited client-route slice is fixed → [#20](issues.md)
- [~] Reconcile staff capability policy → [#25](issues.md)
- [~] Shared plugin settings is operable across eight families and Marketing is truthful; wire/remove the remaining 27 unconsumed fields → [#44](issues.md)
- [~] Stop mutation controls swallowing non-success responses → [#47](issues.md)
- [~] Finish Notepad autosave browser acceptance → [#54](issues.md)
- [~] Mounted acceptance remains for settled utility controls → [#61](issues.md)
- [~] Agency Marketing campaign writes and reports are truthful in one process; distributed mutation safety remains → [#84](issues.md)
- [~] Finance settings now control new invoices/documents; browser acceptance remains → [#120](issues.md)
- [~] The route loader and Visual Builder boot expose one real live status, and the visual handoff is browser-proven; screen-reader announcement/removal/focus acceptance remains → [#136](issues.md)
- [~] Tabs, menus and listboxes now use honest roles and shared keyboard models; mounted representative acceptance remains → [#138](issues.md)
- [~] The real self-contained global error fallback is shipped; production root-fault/recovery acceptance remains → [#141](issues.md)
- [~] Chromium-required 192/512 and maskable PWA assets are shipped; eligible/dismissed/installed browser acceptance remains → [#142](issues.md)
- [~] Published current-page blocks are hydration-stable in default and explicit modes; mounted navigation acceptance remains → [#143](issues.md)
- [~] Private media has one tested 200/206/416 provider-aware byte-range contract; mounted playback/seek acceptance remains → [#144](issues.md)
- [~] Finish production-durable Dev Team authoring and live signals  <sub>consolidated from the retired lists; no issue number</sub>

## Unprioritised — 24

- [~] DB Row-Level Security — ⚠ NOT Ed's task, and no longer a 🔴 decision. CORRECTED 2026-08-23 → [#1](issues.md)
- [~] Meta / Instagram inbox — self-serve "Connect now" → [#11](issues.md)
- [~] Governance company scoping is isolated in code; finish mounted acceptance → [#68](issues.md)
- [~] Role-aware account and portal recovery navigation is implemented; finish mounted acceptance → [#133](issues.md)
- [~] Customer install help is revisitable from Support; mounted install/revisit acceptance remains → [#134](issues.md)
- [~] Customer Bookings code/behaviour is capability-driven; mounted proof remains → [#149](issues.md)
- [~] Social Inbox's inert More control is removed; mounted confirmation remains → [#150](issues.md)
- [~] Client-workspace 404 bootstrap code is repaired; browser console recheck remains → [#152](issues.md)
- [~] Staff, Fulfilment and broad exact-client runtime adoption  <sub>from checklist.md, no issue number</sub>
- [~] One consolidated release/browser/parity gate remains across the critical journeys  <sub>consolidated from the retired lists; no issue number</sub>
- [~] Full browser authoring round trip  <sub>from checklist.md, no issue number</sub>
- [~] Unsaved-work and project-prefill browser matrix  <sub>from checklist.md, no issue number</sub>
- [~] Reusable Dev Workspace is mounted; client-facing completion remains  <sub>from checklist.md, no issue number</sub>
- [~] Engine widening + assistant proposals  <sub>from checklist.md, no issue number</sub>
- [ ] Stages hold elements  <sub>from checklist.md, no issue number</sub>
- [ ] Wizard engine  <sub>from checklist.md, no issue number</sub>
- [~] Aqua Tag backbone remainders  <sub>from checklist.md, no issue number</sub>
- [~] Env-only audit  <sub>from checklist.md, no issue number</sub>
- [~] Backfill phase ticks  <sub>from checklist.md, no issue number</sub>
- [ ] Re-enter the Aqua Tag routing config  <sub>from checklist.md, no issue number</sub>
- [~] Operations / System surface — the KNOW side (governance)  <sub>from todo-retired.md, no issue number</sub>
- [ ] Advisor omega upgrade  <sub>from todo-retired.md, no issue number</sub>
- [~] Marketing workspace overhaul  <sub>from todo-retired.md, no issue number</sub>
- [~] "You Deserve It" upgrade  <sub>from todo-retired.md, no issue number</sub>

---

## Done — 70 issue ids

Ids only. The account of each is in `issues.md`; the running narrative is in
`updates.md` and `CAMPAIGN-LEDGER.md`.

#4 #5 #8 #10 #16 #17 #22 #23 #24 #26 #27 #30 #31 #32 #34 #35 #37 #48 #49 #50 #51 #52 #53 #56 #58 #59 #60 #62 #76 #78 #86 #89 #90 #91 #92 #93 #94 #95 #96 #97 #98 #99 #100 #101 #102 #103 #104 #105 #106 #107 #108 #109 #110 #111 #112 #113 #114 #115 #116 #117 #118 #119 #127 #131 #137 #151 #153 #154 #161 #186
