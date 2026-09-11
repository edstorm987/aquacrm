# TODO — the one list

> **Current evidence checkpoint: 8 September 2026.** Read
> [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) before interpreting this
> backlog. Committed `main` is clean at `a808bb3f`, but the **working tree carries
> uncommitted local work** (the doc reconciliation + a 2026-09-08 engineering
> pass). With that work: typecheck 0, isolated production build 247/247, and
> **6,800/6,802 canonical Node tests** green (0 fail, 2 skip — was 6,772/6,774 at
> `a808bb3f`); the full browser matrix is **1,326/1,326, 0 serious/critical** (the
> earlier repeated contrast defect is fixed locally, #189). **Still open / not
> live:** the fixes are uncommitted and undeployed; the deployed app still reports
> `readyForProduction:false`, the apex domain fails TLS, CI is authored but never
> run on GitHub, and operational/provider gates remain open. A green source suite —
> and an uncommitted local fix — is not a production approval.

**This is the only task list.** `checklist.md` and `todo-retired.md` are retired; they held the
same work in two wordings, **130 of ~145 issue ids appeared in both**, and **7 issues were
marked done in one file while still open in the other** — so neither could be trusted on
its own. Nothing was dropped: every open row from both files is here, and a script
checked that afterwards.

Detail, evidence and reproduction for every `#N` stays in [`issues.md`](issues.md), which
remains the backing store. This file is the index over it.

> **10 September 2026 security overlay (current, unmerged/undeployed):** the
> security gate-repair baseline `72acac90`, the public-media correction and
> Claude's template-security commit are isolated lanes, not production state.
> Before any real-client onboarding: (1) correct the remaining template stored
> XSS/safe-mode/Shopify/preview findings at `c87e6874`; (2) keep public remote
> writes and delete ownership-blocked until a durable atomic page/object saga and
> recall ledger exist; (3) resolve the scanner 1 MiB-vs-8 MiB egress/product-limit
> decision; (4) apply and verify the containment migrations and direct Storage
> policies; (5) integrate all corrected lanes on a temporary branch and rerun
> canonical, Website Editor, typecheck, production build, browser/accessibility,
> migration/RLS, recovery and provider gates. Do not promote any isolated green
> suite into a production-ready claim.

| | meaning |
| --- | --- |
| `[ ]` | not started |
| `[~]` | part done, remainder named in `issues.md` |
| `⚠ disputed` | the retired files disagreed; the **less complete** status was taken. Verify against source before trusting it. |

---

## 🔒 Owner-controlled gates — 14 records (8 open, 3 partial, 3 resolved)

Nothing here moves without an account, a credential or a decision from you. Taken from
the retired files' own Ed-only sections, minus one they had mis-filed (`#1`, RLS, whose
own note reads *"NOT Ed's task"* — it is engineering, and sits below). The questions
behind several of these are [`ED-QUESTIONS.md`](ED-QUESTIONS.md) Q1–Q24.

- [ ] Walk the onboarding chain  <sub>from checklist.md, no issue number</sub>
- [ ] Stripe live-account walkthrough  <sub>from checklist.md, no issue number</sub>
- [ ] Meta Developer app  <sub>from checklist.md, no issue number</sub>
- [~] Deployment environment verification — read-only live checks on 2026-09-08 prove Railway serves `www`, database/security/uploads report ready, but required email is `needs-setup`, `readyForProduction:false`, deployment `sha:null`, and apex TLS fails; finish configuration and acceptance → [current readiness](PRODUCTION-READINESS.md)
- [~] Apply the pending Supabase migrations before production rollout — the 14 migrations pending on 2026-09-03 were applied and verified live then, but that historical green state does **not** include the later, currently unmerged containment chain `20260908210000` + `20260908220000` or public-bucket hardening `20260910010000`. After a fresh backup and explicit owner approval, apply those forward-only migrations in order and re-run `rls-verify.sql`; none was applied to a remote/shared database by the 2026-09-10 security lanes → [supabase-alignment-2026-09-03](plans/supabase-alignment-2026-09-03.md) §9 · [current security gate](../../../SECURITY-GATE-REPAIR-REPORT.md)  <sub>from checklist.md, no issue number</sub>
- [ ] Activate and prove recovery — the self-managed encrypted backup/runbook exists and was locally rehearsed, but scheduled activation, durable off-Supabase delivery, one downloaded live-artifact restore, timing and missed-backup alert proof remain; PITR is OFF and should be reconsidered → [current readiness](PRODUCTION-READINESS.md) · [backup evidence](plans/production-readiness-roadmap-2026-09-03.md#5-database-migrations-rls-backup-and-recovery)
- [ ] Apply `20260903130000_ensure_rls_event_trigger` as the first of the **four** currently local migrations, then the three security migrations named above. The event-trigger migration was a no-op on the 2026-09-03 live schema, but applying it alone no longer reaches 0 pending. Separately decide whether to tighten inherited over-broad table grants (optional REVOKE).  <sub>added 2026-09-03; corrected 2026-09-10</sub>
- [ ] Rotate the Supabase database password and the `sbp_` access token (both were pasted into a session transcript on 2026-09-03)  <sub>added 2026-09-03</sub>
- [ ] Set `PORTAL_BACKEND=file` in `.env.local` for local work — without it the portal promotes itself to the Supabase backend and local servers write the production `app_datastores` row (daily writes visible through 2026-09-02)  <sub>added 2026-09-03</sub>
- [ ] DPO sign-off  <sub>from checklist.md, no issue number</sub>
- [~] Aqua Tag form-capture consent → [#2](issues.md) — DECIDED (transparency, not gate) + DRAFT notice wired into the Aqua contact form (React + static export) + pinned, 2026-09-05; pending DPO sign-off on final wording (drop-in via `consentNotice` prop)
- [x] Choose the permanent last-grant revocation policy → [#174](issues.md) — DECIDED (narrows) + FIXED + pinned, 2026-09-05
- [x] Decide whether client identities get indistinguishable sibling-project 404s → [#163](issues.md) — DECIDED (yes) + FIXED + pinned, 2026-09-05
- [~] Choose Radar probe freshness: restore sub-daily probes or show evidence age on every affected surface → [#170](issues.md) — BOTH addressed 2026-09-05: evidence-age/blind already honest; sub-daily self-scheduler BUILT (flag-gated OFF, `RADAR_PROBE_INTERVAL_MINUTES`). Left: set that env var on Railway (or point a cron at `/api/cron/radar-probes`)

## P0 — before any production use — 1

- [~] Ecommerce public authority, allowlisted product/receipt DTOs and local end-to-end are verified; finish custom-domain + live Stripe/provider acceptance. Current evidence: `www` serves but apex TLS validation fails, and live Stripe settlement/delivery is not proven → [#69](issues.md)

## P1 — before broader launch — 59

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

- [x] **Pre-hydration lost click on SSR primary controls (UI Wave 9) — FIXED + PROVEN
  (uncommitted).** Confirmed on a clean production build (~251 ms silent-loss window @ 1×), then Ed
  approved the accessible boundary: new `src/lib/a11y/useHydrated.ts` gates the "New client"
  (`_NewClientButton.tsx`, both call sites) and "Add contact" (`_PeopleHub.tsx`) CTAs
  `disabled`+`aria-busy` until their handlers are live. Proven on a rebuilt prod dist: pending state
  is visible+announced (132 ms @ 1× — barely a flash) and the FIRST click once enabled opens the
  modal. Pinned by `scripts/smoke-hydration-boundary.test.ts`. Other SSR CTAs can adopt the same
  hook as they're touched. `.artefacts/ui-wave9/04-prehydration-FINDING.md`. → UI [#191](issues.md)
- [x] **Non-owner production role coverage (UI Wave 9) — DONE.** All four roles (owner/staff/
  customer/freelancer) render on a clean isolated production build ×Chromium/WebKit/Firefox
  (11/12 harness cells clean, 12th a benign WebKit RSC-prefetch), using the app's own
  `seedDemoAgency()` + real `issueSession()` payloads; no live data touched. The clean-prod-build
  recipe (Supabase left unconfigured → file backend) is what unblocked it. The Supabase login
  handshake itself stays covered by existing smoke tests + the live app; a full real-login prod
  matrix would still want a dedicated staging Supabase, but is not required for UI coverage.
  `.artefacts/ui-wave9/10-item7-prod-role-matrix.md`. → UI [#191](issues.md)
- [~] Make the deep production health probe truthful on Railway and expose deployment provenance — **FIXED + INDEPENDENTLY VERIFIED LOCALLY 2026-09-08; UNCOMMITTED + UNDEPLOYED:** substrate-aware `deployment.ts` (production classification now separate from the health-enforcement flag, so a false override can never disable the production storage guard); `/healthz/full` enforces readiness (Railway/generic, not Vercel-only), both routes expose a real SHA; runtime-verified 200 local / **503** unready on a Railway-equivalent server. Not closed until deployed to Railway → [#187](issues.md)
- [~] Add a required pull-request/release CI pipeline — **AUTHORED LOCALLY 2026-09-08; UNCOMMITTED, NEVER RUN ON GITHUB:** `.github/workflows/ci.yml` (valid YAML; verify + bounded browser gate; secretless; live lanes excluded). **Not closed** until committed/pushed, first green GitHub run, and required in `main` branch protection (Ed) → [#188](issues.md)
- [~] Fix and re-run the serious Command Centre contrast regression — **FIXED + AXE-VERIFIED LOCALLY 2026-09-08; UNCOMMITTED + UNDEPLOYED:** legacy `[class*="-button"]` scoped off the `mm-*` design system (CommandMoreButton 1.18→7.6:1) + a second finding, the login `.mm-auth-brand-foot` (4.07→≈6:1); full 13×17 matrix 1,326/1,326 + axe-core scan of `/login`+`/portal/agency` at 1280/1920 = 0 violations. Not closed until deployed → [#189](issues.md)
- [~] Restore `npm run dev:verify` — **FIXED + RUNTIME-VERIFIED LOCALLY 2026-09-08; UNCOMMITTED:** `NEXT_RUNTIME !== "edge"` DCE guard in `instrumentation.ts` keeps the Node-only radar/email graph out of the Edge bundle (+ lazy nodemailer); compiles and serves public + authenticated routes → [#190](issues.md)
- [~] UI/UX·responsive·accessibility acceptance — **WAVES 1–2 DONE 2026-09-08 (uncommitted); open P1s CLOSED; pilot UI gate not FULLY passed (coverage).** Wave 1 built the 124-route inventory + reusable harness (`scripts/ui-acceptance.mjs`) and fixed `select-name`/404-contrast/chart-`aria-prohibited-attr`/a `<dl>` defect. **Wave 2 closed every remaining P1 + re-scanned 0:** colour-contrast (9 surfaces, 41 nodes — workflow-proposed + adversarially-verified AA fixes), `aria-required-attr` (portals/editor), marketing `<dl>`, and dev-team overflow at ≤768px. **Still open = COVERAGE (wave 3):** dynamic-route fixtures, customer/staff/freelancer roles, the full 18-viewport + 200% zoom set, end-to-end journeys, modal focus-trap/return, and a production-build visual pass → [#191](issues.md), [UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08](UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08.md)

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
- [~] Code/behaviour resolved — canonical client lifecycle **browser-accepted 2026-09-05 in the dev sandbox**: New client → form → submit → **persisted** (`cli_98ac…` in `portal-state.json`) → the client workspace renders (`/portal/clients/<id>`, shows "Acme Ltd", account overview + contact actions, **0 overflow + 0 real AA violations at 375px**). Live-provider client comms (WhatsApp/Email send) remain Ed-gated. → [#46](issues.md)
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
- [~] Aqua Tag form ingestion is durable and order-independent in source with a database-native claim boundary (0578ddb); the repository records the migration as applied in the 2026-09-03 live alignment, but a current live delivery/concurrency exercise remains → [#87](issues.md)
- [~] Dev Team document bytes and attribution now recover together after process death; constrain the final non-cooperating direct-writer check/rename window → [#88](issues.md)
- [~] Client schedules and Finance Plans are converged; mounted browser acceptance remains → [#121](issues.md)
- [~] Membership subscription and plan-price changes retain durable operation history, fence provider work through authoritative state adoption and preserve every provider generation; finish the full mounted lifecycle and live Stripe acceptance → [#122](issues.md)
- [~] Membership webhooks dedupe completed deliveries before provider I/O, re-read authoritative provider state inside the lifecycle lane and use a retryable scoped inbox plus paid-dominant payment ledger; signed live-provider acceptance remains → [#123](issues.md)
- [~] Affiliate commissions now have one recoverable payout owner; mounted/live-provider acceptance remains → [#124](issues.md)
- [~] Affiliate currency/refund accounting is code- and behaviour-complete; mounted/live acceptance remains → [#125](issues.md)
- [~] Membership/Affiliate runtime validation is code- and behaviour-complete; mounted acceptance remains → [#126](issues.md)
- [~] Aqua Advisor turns are code/domain-behaviour durable; mounted provider acceptance remains → [#130](issues.md)
- [~] Server error capture/readiness is mounted and the 2026-09-08 production build is green (247/247); install and live-prove the production client sink. The separate current Webpack `dev:verify` import-graph failure is tracked in #190 → [#132](issues.md)
- [x] Every declared modal uses the shared focus/restore contract — **browser-accepted 2026-09-05 in the dev sandbox**: the New-client modal opened with `role="dialog"` + `aria-modal="true"`, **trapped focus inside**, and returned focus to its trigger; form modals deliberately keep themselves open on Escape (anti-data-loss), which is correct. → [#135](issues.md)
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

## P2 — quality and correctness — 19

- [~] Reference validation remains a broad open class; the audited client-route slice is fixed → [#20](issues.md)
- [~] Canonical staff workspace capability policy, reusable-role authoring and Staff Technical Hidden/View/Use/Manage plus same-cookie downgrade enforcement are source/isolated-browser proven; finish provider-backed live-persona/shared-credential acceptance → [#25](issues.md)
- [~] Shared plugin settings is operable and Marketing, Website Editor, Fulfillment and Memberships are truthful; Memberships is exact-build browser-proven, Ecommerce's low-stock default and Leads Pipeline's default source/capture column are now consumed and three dead Finance/Ecommerce/Leads declarations are removed, Client CRM's default tags and signup mirror are consumed and five stored-only promises (HR 2, Affiliates 2, Client CRM 1) are removed; the three that remain (HR staff-edit permission, Public Funnel redirect and session cookie) are safety-shaped access/session controls left labelled "Not connected" pending a security decision → [#44](issues.md)
- [~] Finance, Dev Team, Governance, Fulfilment, Actions, Performance and Phase Admin mutation controls use checked response contracts; Actions (four viewports), Performance (seven viewports) and Phase Admin (0078567 dev lane 10/10; 2026-09-03 production lane 10/10 stories across 390×844 and 1280×800, 2 recorded N/A (production preview refusal), 0 unexpected console/page/request/HTTP failures, preview N/A by the dev-mode switch) are browser-proven; **Client Centre checked-mutation browser-accepted 2026-09-05 in the dev sandbox** (client "Mark contacted" → truthful state change, no false success, **persisted** to backend); SOP, Company and other families still open → [#47](issues.md)
- [~] Notepad autosave is browser-proven on two isolated exact builds (e1b2781; re-run 2026-09-03 notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing)); keep open only for a live-provider (Supabase-backed) rerun → [#54](issues.md)
- [~] Mounted acceptance remains for settled utility controls → [#61](issues.md)
- [~] Agency Marketing campaign rows, channel indexes and reports are cross-process/crash-atomic on the file backend; finish native Supabase/Postgres constraints and live-provider acceptance → [#84](issues.md)
- [~] Finance settings control new invoices/documents and are browser-proven on two isolated exact builds (e1b2781; re-run 2026-09-03 notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing)); live-provider rerun remains → [#120](issues.md)
- [~] The route loader exposes one real live status; its mounted evidence was re-taken on 2026-09-03 (loader 2/2, reduced motion included); screen-reader announcement remains untested (no assistive technology is driven) → [#136](issues.md)
- [~] Tabs, menus and listboxes now use honest roles and shared keyboard models; mounted representative acceptance remains — **partly verified 2026-09-05 (dev sandbox):** menus expose honest `aria-haspopup="menu"` and the earlier a11y-name audit was clean; a full pass over every tab/listbox surface remains. → [#138](issues.md)
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
- [x] Standardise cross-tenant client-route refusals on the house 404 convention → [#168](issues.md) — RESOLVED: every route (tenant client-*/customer-*/product-workspaces, contracts/templates, performance/*) is tenancy-first; exhaustive source sweep + 10-route pin, verified 2026-09-05
- [~] Customer Bookings code/behaviour is capability-driven; mounted proof remains → [#149](issues.md)
- [~] Social Inbox's inert More control is removed; mounted confirmation remains → [#150](issues.md)
- [x] Client-workspace 404 bootstrap — **browser-accepted 2026-09-05 in the dev sandbox**: a nonexistent client id renders a clean "404 — that portal page isn't here" (no crash, no app console errors; only dev-HMR WebSocket noise). → [#152](issues.md)
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
