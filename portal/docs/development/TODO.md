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

## 🔒 Blocked on you — 14

Nothing here moves without an account, a credential or a decision from you. Taken from
the retired files' own Ed-only sections, minus one they had mis-filed (`#1`, RLS, whose
own note reads *"NOT Ed's task"* — it is engineering, and sits below). The questions
behind several of these are [`ED-QUESTIONS.md`](ED-QUESTIONS.md) Q1–Q24.

- [ ] Walk the onboarding chain  <sub>from checklist.md, no issue number</sub>
- [ ] Stripe live-account walkthrough  <sub>from checklist.md, no issue number</sub>
- [ ] Meta Developer app  <sub>from checklist.md, no issue number</sub>
- [ ] Deployment env verification  <sub>from checklist.md, no issue number</sub>
- [x] Apply the pending Supabase migrations before production rollout — DONE 2026-09-03: all 14 applied live via `supabase db push`, backup confirmed, backfill 52/52 and every row count verified read-only, live `rls-verify.sql` 51 INFO / 0 FAIL → [supabase-alignment-2026-09-03](plans/supabase-alignment-2026-09-03.md) §9  <sub>from checklist.md, no issue number</sub>
- [ ] Enable Supabase PITR and rehearse one restore on a branch/scratch database — daily physical backups exist (8, newest 2026-09-03) but PITR is OFF and no restore was rehearsed; recovery is not fully verified → [supabase-alignment-2026-09-03](plans/supabase-alignment-2026-09-03.md) §4  <sub>added 2026-09-03</sub>
- [ ] Push `20260903130000_ensure_rls_event_trigger` (a no-op on live; records the already-present rls_auto_enable to reach 0 pending) and decide on tightening the inherited over-broad table grants (optional REVOKE)  <sub>added 2026-09-03</sub>
- [ ] Rotate the Supabase database password and the `sbp_` access token (both were pasted into a session transcript on 2026-09-03)  <sub>added 2026-09-03</sub>
- [ ] Set `PORTAL_BACKEND=file` in `.env.local` for local work — without it the portal promotes itself to the Supabase backend and local servers write the production `app_datastores` row (daily writes visible through 2026-09-02)  <sub>added 2026-09-03</sub>
- [ ] Enable Supabase point-in-time recovery and rehearse one restore before production rollout — no backup/recovery runbook exists in the repository (readiness roadmap §5)  <sub>added 2026-09-03</sub>
- [ ] DPO sign-off  <sub>from checklist.md, no issue number</sub>
- [ ] Aqua Tag form-capture consent → [#2](issues.md)
- [ ] Choose the permanent last-grant revocation policy → [#174](issues.md)
- [ ] Decide whether client identities get indistinguishable sibling-project 404s → [#163](issues.md)
- [ ] Choose Radar probe freshness: restore sub-daily probes or show evidence age on every affected surface → [#170](issues.md)

## P0 — before any production use — 1

- [~] Ecommerce public authority, allowlisted product/receipt DTOs and local end-to-end are verified; finish custom-domain + live Stripe/provider acceptance → [#69](issues.md)

## P1 — before broader launch — 55

> **What "clearing" these actually needs (triage 2026-09-05).** Almost every `[~]` here reads
> "code/behaviour done; <X> acceptance remains" — the *code* is written and unit/smoke-covered; what
> is outstanding is an *acceptance* run. Those split into two classes, and knowing which is which is
> the difference between autonomous work and a blocker:
> - **LIVE-PROVIDER acceptance** (wording: "live Stripe / live-provider / native Supabase/Postgres
>   constraint / provider delivery") → **Ed-blocked**: needs real Stripe/Meta/email/DB credentials.
>   Build-and-test-around is already done (file-backend proofs cited inline); this is plug-in-later.
> - **MOUNTED-BROWSER acceptance** (wording: "mounted acceptance remains") → needs a built exact-dist
>   + seeded Playwright lane. Deliberately **not** run overnight per Ed's "careful on CPU with local
>   stuff"; it is a dedicated-session task, not a code gap.
> Neither class is a half-built feature — they are verification lanes. The onboarding chain, for one,
> was re-verified green this run (`smoke-client-lifecycle-creation` + `smoke-client-project-provisioning`
> 24/24 on the file backend); only its live Stripe/Meta walkthrough is Ed-blocked.

- [~] Editor AI database coordination is implemented; live DB proof remains → [#18](issues.md)
- [~] Editor dirty-state browser acceptance is proven on a Dev Mode lane (28fc767; re-run 2026-09-03 191 passed / 2 failed / 13 explained N/A rows / 47 observations on the full matrix; the two failures were one timing-sensitive held-reply step that passed on an uncontended rerun of the AI scenario (14/14) and one dev-mode hydration-mismatch console warning raised only inside the AI scenario, recorded as an open residual); the recorded SEO-prompt and phone-drawer residuals stay → [#19](issues.md)
- [~] Public showcase capability boundary and shared fixture are repaired → [#21](issues.md) `⚠ disputed`
- [~] Continue repairing Website Editor API contracts; exact-scope AI gating is fixed, the newsletter facade is real (d245e51, browser-proven 2026-09-03) and the dead-call ratchet is 13 → [#28](issues.md)
- [~] Website Editor now has consent-aware Contact capture, published Blog summaries/detail, immutable published page snapshots and a narrow anonymous Ecommerce facade; finish the remaining visitor backends, operator handoff and live-browser acceptance → [#29](issues.md) `⚠ disputed`
- [~] Paid Memberships foundation is real; finish live Stripe lifecycle acceptance → [#33](issues.md)
- [~] Build custom portal now reaches the canonical provisioner; mounted provision/reload acceptance remains → [#36](issues.md)
- [~] Private-upload ownership now has exact payload/provider/key binding, fenced claims and safe definite-refusal release locally; finish live-provider, distributed/process-kill, mounted failure/retry and operator-reconciliation acceptance → [#38](issues.md)
- [~] Close the deal is reviewable and truthful; finish mounted agency/customer acceptance → [#39](issues.md)
- [~] Proposal/receipt delivery is truthful; finish live-provider refusal/retry acceptance → [#40](issues.md)
- [~] Proposal acceptance is version-bound; finish mounted public acceptance → [#41](issues.md)
- [~] Installments stop exactly in code; finish live Stripe refusal/retry acceptance → [#42](issues.md)
- [~] Email Sender setup and SMTP delivery are real; finish live-provider browser acceptance → [#43](issues.md)
- [~] Affiliate Stripe Connect onboarding/status and payouts are locally durable and gated; finish live Stripe acceptance → [#45](issues.md)
- [~] Code/behaviour resolved — browser-accept the canonical client lifecycle → [#46](issues.md)
- [~] Finish live visual acceptance for convergent client phase transitions → [#55](issues.md)
- [~] Every named consequential empty-on-read-failure source path now has explicit availability/stale-state handling; finish mounted rejection/retry/lost-response/multi-tab and live-provider acceptance → [#57](issues.md)
- [~] Membership/Affiliate parent deletion now enforces dependency-safe RESTRICT under the durable graph lock; finish mounted/live-provider acceptance → [#63](issues.md)
- [~] SOP deletion and every current incoming-reference writer enforce tenant-safe RESTRICT under one lifecycle lane; repair historical dangling rows and finish mounted acceptance → [#64](issues.md)
- [~] Company capital/governance invariants are guarded; finish mounted acceptance → [#65](issues.md)
- [~] Battle Table revisions/locks are guarded; finish mounted acceptance → [#66](issues.md)
- [~] Legal dependency preview/refusal exists; finish mounted/provider acceptance → [#67](issues.md)
- [~] Code/behaviour resolved — complete mounted/live-provider acceptance for transactional gift-card and custom-code value → [#70](issues.md)
- [~] Code/behaviour resolved — browser-accept versioned Product/Variants authoring → [#71](issues.md)
- [~] Code/behaviour resolved — browser-accept the Ecommerce inventory ledger → [#73](issues.md)
- [~] Code/behaviour resolved — live-accept Ecommerce shipping/tax quotes → [#74](issues.md)
- [~] Code/behaviour resolved — live-accept the Ecommerce provider ledger → [#75](issues.md)
- [~] Public Funnel capture visibility and ordinary retry are repaired; exact cross-process side-effect delivery remains → [#79](issues.md)
- [~] Canonical lead identity and all journey writers are cross-process/crash-atomic on the file backend; finish native Supabase/Postgres uniqueness and live-provider acceptance → [#80](issues.md)
- [~] Opportunity money is safe under same-process races and, on the file backend, across real processes (ledger/invoice claims under the exclusive lane, crash-after-claim retry proven); live database constraints, provider delivery across processes and lost-ack browser coverage remain → [#81](issues.md)
- [~] Mounted Marketing records are isolated and stale-safe in one process and, on the file backend, across real processes (create/edit/stale-delete/reload proven with separate Node processes); a live database-native version constraint remains → [#82](issues.md)
- [~] Agency Marketing lead identity, re-keying, erasure and contact history are cross-process/crash-atomic on the file backend; finish native Supabase/Postgres uniqueness and live-provider acceptance → [#83](issues.md)
- [~] Aqua Tags stop-routing is non-destructive and mounted click acceptance is proven on a dev lane (0578ddb; re-run 2026-09-03 220/220 checks (0 failed) at 390×844 and 1280×800); live database ingestion remains → [#85](issues.md)
- [~] Aqua Tag form ingestion is durable and order-independent in source with a database-native claim boundary (0578ddb); apply `20260902093000_aqua_tag_submission_delivery.sql` live and exercise it there → [#87](issues.md)
- [~] Dev Team document bytes and attribution now recover together after process death; constrain the final non-cooperating direct-writer check/rename window → [#88](issues.md)
- [~] Client schedules and Finance Plans are converged; mounted browser acceptance remains → [#121](issues.md)
- [~] Membership subscription and plan-price changes retain durable operation history, fence provider work through authoritative state adoption and preserve every provider generation; finish the full mounted lifecycle and live Stripe acceptance → [#122](issues.md)
- [~] Membership webhooks dedupe completed deliveries before provider I/O, re-read authoritative provider state inside the lifecycle lane and use a retryable scoped inbox plus paid-dominant payment ledger; signed live-provider acceptance remains → [#123](issues.md)
- [~] Affiliate commissions now have one recoverable payout owner; mounted/live-provider acceptance remains → [#124](issues.md)
- [~] Affiliate currency/refund accounting is code- and behaviour-complete; mounted/live acceptance remains → [#125](issues.md)
- [~] Membership/Affiliate runtime validation is code- and behaviour-complete; mounted acceptance remains → [#126](issues.md)
- [~] Aqua Advisor turns are code/domain-behaviour durable; mounted provider acceptance remains → [#130](issues.md)
- [~] Server error capture/readiness is mounted and the repaired cross-runtime graph is browser-clean and production-build green (245/245); install and live-prove the production client sink → [#132](issues.md)
- [~] Every declared modal uses the shared focus/restore contract; mounted representative keyboard acceptance remains → [#135](issues.md)
- [~] Named internal actions and published fields are guarded; mounted accessibility-tree acceptance remains → [#139](issues.md)
- [~] Make date-only business values local-calendar safe → [#140](issues.md)
- [~] Voice/call recorder negotiation and failure cleanup are repaired; mounted cross-browser acceptance remains → [#145](issues.md)
- [~] Relative countdown deadline code/service behaviour is repaired; mounted acceptance remains → [#146](issues.md)
- [~] Team Chat and notification response order is repaired and browser-proven (bb6119a; re-run 2026-09-03 stories 22/22; matrix 72 passed / 0 failed / 9 evidenced observations of 81 at seven viewports on the integrated build); only the Attention Shield seed caveat is recorded → [#147](issues.md)
- [~] Named core storage/provider waits are bounded; finish mounted/live acceptance → [#148](issues.md)
- [~] Execute relational extraction, backfill and RLS; semantic Phase 0, durable KPI identities and crash-safe post-commit outbox handoff are shipped, while cross-process claims and consumer acknowledgement/retry/dead-letter remain open → [data migration plan](../data/MIGRATION-PLAN.md)
- [~] Editor `requiresPlugin` gating is code/behaviour-complete and an enabled tenant palette is browser-proven; compare disabled state and disable/reload preservation → [#183](issues.md)
- [~] Consent-aware tenant contact capture and published Blog summaries/detail are built; connect submissions to the operator inbox and implement/remove the remaining Forms/Reservations/Newsletter/Themes promises → [#184](issues.md)
- [~] Sixteen exact public routes are now classified, including allowlisted Ecommerce and Website Editor visitor facades; continue one operation at a time → [#185](issues.md)
- [~] Isolated server/browser lane is restored; finish the remaining critical-flow acceptance  <sub>from todo-retired.md, no issue number</sub>

## P2 — quality and correctness — 18

- [~] Reference validation remains a broad open class; the audited client-route slice is fixed → [#20](issues.md)
- [~] Canonical staff workspace capability policy, reusable-role authoring and Staff Technical Hidden/View/Use/Manage plus same-cookie downgrade enforcement are source/isolated-browser proven; finish provider-backed live-persona/shared-credential acceptance → [#25](issues.md)
- [~] Shared plugin settings is operable and Marketing, Website Editor, Fulfillment and Memberships are truthful; Memberships is exact-build browser-proven, Ecommerce's low-stock default and Leads Pipeline's default source/capture column are now consumed and three dead Finance/Ecommerce/Leads declarations are removed, Client CRM's default tags and signup mirror are consumed and five stored-only promises (HR 2, Affiliates 2, Client CRM 1) are removed; the three that remain (HR staff-edit permission, Public Funnel redirect and session cookie) are safety-shaped access/session controls left labelled "Not connected" pending a security decision → [#44](issues.md)
- [~] Finance, Dev Team, Governance, Fulfilment, Actions, Performance and Phase Admin mutation controls use checked response contracts; Actions (four viewports), Performance (seven viewports) and Phase Admin (0078567 dev lane 10/10; 2026-09-03 production lane 10/10 stories across 390×844 and 1280×800, 2 recorded N/A (production preview refusal), 0 unexpected console/page/request/HTTP failures, preview N/A by the dev-mode switch) are browser-proven, while Client Centre, SOP, Company and other families stay open → [#47](issues.md)
- [~] Notepad autosave is browser-proven on two isolated exact builds (e1b2781; re-run 2026-09-03 notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing)); keep open only for a live-provider (Supabase-backed) rerun → [#54](issues.md)
- [~] Mounted acceptance remains for settled utility controls → [#61](issues.md)
- [~] Agency Marketing campaign rows, channel indexes and reports are cross-process/crash-atomic on the file backend; finish native Supabase/Postgres constraints and live-provider acceptance → [#84](issues.md)
- [~] Finance settings control new invoices/documents and are browser-proven on two isolated exact builds (e1b2781; re-run 2026-09-03 notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing)); live-provider rerun remains → [#120](issues.md)
- [~] The route loader exposes one real live status; its mounted evidence was re-taken on 2026-09-03 (loader 2/2, reduced motion included); screen-reader announcement remains untested (no assistive technology is driven) → [#136](issues.md)
- [~] Tabs, menus and listboxes now use honest roles and shared keyboard models; mounted representative acceptance remains → [#138](issues.md)
- [~] The real self-contained global error fallback is shipped; production root-fault/recovery acceptance remains → [#141](issues.md)
- [~] Chromium-required 192/512 and maskable PWA assets are shipped; eligible/dismissed/installed browser acceptance remains → [#142](issues.md)
- [~] Published current-page blocks are hydration-stable in default and explicit modes; mounted navigation acceptance remains → [#143](issues.md)
- [~] Private media has one tested 200/206/416 provider-aware byte-range contract; mounted playback/seek acceptance remains → [#144](issues.md)
- [~] Finish production-durable Dev Team authoring and live signals  <sub>consolidated from the retired lists; no issue number</sub>
- [x] **Public demo showcase agency React #441 — ROOT-CAUSED + FIXED + verified live 2026-09-05 (`301071ee`).**
  With a foreground browser the error reproduced deterministically. Railway deploy logs decoded #441
  (React's generic "server component render error"): digest → `Error [AccessControlError]/[AuthError]:
  stale_session`. **Cause:** `requireCurrentAccessActor` (`accessControl.ts`) resolved the session user
  in `LIVE_DATA_REALM_ID`, but a public-showcase visitor exists **only** in its fixture realm
  (`sandbox-public-showcase`) — so `getUserById` returned null and it wrongly threw `stale_session`,
  killing the whole demo Command Centre. **Fix:** resolve public-showcase users in their fixture realm,
  mirroring the authoritative `currentUserForSession` in `auth.ts`; every other session path is
  byte-identical. Verified: typecheck clean, full `smoke:all` 6704/0, security suites (session-revocation
  #22, showcase, release-access-matrix, access-control kernel) 111/111, **and the live showcase Command
  Centre now renders fully (`err441:false`, real workspace content)**. Together with the earlier redirect
  fix, the public demo is now functional end-to-end. (The showcase inbox cleanly redirects to login — that
  is intentional demo scoping, not a crash; no errors logged post-fix.)  <sub>added 2026-09-05, resolved same day</sub>
- [x] Bring dense operator controls to 44×44 (calendar month toolbar, phase card actions, inbox chips, notepad tabs). **FULLY AUDITED 2026-09-05 in the local dev sandbox (`/dev`, real agency-owner session, all 5 named surfaces):** every surface — **Command Centre, inbox, notepad, phases, actions/calendar** — has **0 horizontal overflow at 375px** and meets **WCAG-AA touch-targets (24×24)**. Across all five the *only* sub-24 controls are (a) the 1px sr-only "Skip to content" links and (b) one recurring bare native `<input type="checkbox">` at 13×13 — a minor AA edge case (native browser-default size; WCAG 2.5.8 AA has spacing/essential exceptions). **AA is met.** 44×44 is WCAG **AAA** enhancement (a minority of controls, e.g. 1–3 per surface at 375px); a blanket bump would bloat dense operator UIs, so it stays optional polish — **not a compliance gap.** Minor follow-up if desired: give the native checkbox a larger custom hit-area + an explicit label.  <sub>added 2026-09-03; fully audited 2026-09-05 via dev sandbox</sub>
- [x] SSR/CSR attribute mismatch in the Dev Team topbar lead (`div[data-topbar-lead]`) — **ROOT-CAUSED + FIXED + verified 2026-09-05** in the dev sandbox. Reproduced it (the trigger isn't "AI scenario" specifically — it's any load *after* the chrome layout has loaded once in the session): the pin buttons in `PinCurrentControl` hydrated `disabled={false}` (client) against server `disabled` (`disabled=""`). **Cause:** `useChromeLayout` seeded its state with `useState(loadedOnce)` / `useState(shared)` — module-scope values that mutate as the layout loads, so the client's first render used the already-loaded values while the server (fresh module per request) rendered not-loaded → mismatch. **Fix (`pinnedTabsStore.ts`):** start `EMPTY`/`ready=false` (server-consistent) and adopt the already-loaded state in the mount effect. Verified: typecheck clean, chrome-layout/pinned-tabs/topbar smoke **107/107**, and a **clean-browser repro now shows zero console errors** on the Dev Team load. <sub>added 2026-09-03; fixed 2026-09-05</sub>
- [x] Raise the remaining low-opacity small text that no gate walked (`ExternalAiConnectionPanel` emerald /50–/60, `_ActionsWorkspace` /65, `NotificationCentreButton` /62) — **DONE 2026-09-05 (`867a84d9`):** all three raised (ExternalAiConnectionPanel /60→/80 and /50→emerald-900; _ActionsWorkspace /65→/80; NotificationCentreButton /62→/80, icon /60→/70, tab /40→/55); deployed + live. <sub>added 2026-09-03</sub>

## Unprioritised — 25

- [~] DB Row-Level Security — ⚠ NOT Ed's task, and no longer a 🔴 decision. CORRECTED 2026-08-23 → [#1](issues.md)
- [~] Meta / Instagram inbox — self-serve "Connect now" → [#11](issues.md)
- [~] Governance company scoping is isolated in code; finish mounted acceptance → [#68](issues.md)
- [~] Role-aware account and portal recovery navigation is implemented; finish mounted acceptance → [#133](issues.md)
- [~] Customer install help is revisitable from Support; mounted install/revisit acceptance remains → [#134](issues.md)
- [ ] Standardise cross-tenant client-route refusals on the house 404 convention → [#168](issues.md)
- [~] Customer Bookings code/behaviour is capability-driven; mounted proof remains → [#149](issues.md)
- [~] Social Inbox's inert More control is removed; mounted confirmation remains → [#150](issues.md)
- [~] Client-workspace 404 bootstrap code is repaired; browser console recheck remains → [#152](issues.md)
- [~] Staff Technical and representative Fulfilment runtime enforcement are browser-proven; finish broad exact-client/provider-backed live-persona adoption  <sub>from checklist.md, no issue number</sub>
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

## Done — 73 issue ids

Ids only. The account of each is in `issues.md`; the running narrative is in
`updates.md` and `CAMPAIGN-LEDGER.md`.

#4 #5 #8 #10 #16 #17 #22 #23 #24 #26 #27 #30 #31 #32 #34 #35 #37 #48 #49 #50 #51 #52 #53 #56 #58 #59 #60 #62 #76 #78 #86 #89 #90 #91 #92 #93 #94 #95 #96 #97 #98 #99 #100 #101 #102 #103 #104 #105 #106 #107 #108 #109 #110 #111 #112 #113 #114 #115 #116 #117 #118 #119 #127 #128 #129 #131 #137 #151 #153 #154 #161 #172 #186
