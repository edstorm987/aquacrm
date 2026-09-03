# Production-readiness roadmap — 3 September 2026

**Status:** living register, written at the release baseline of the commit that adds this document (parent 06abeb9 on `main`) on `main`.
Every row is labelled **VERIFIED**, **PARTIAL**, **BLOCKED**, **NOT TESTED** or
**POST-RELEASE**, and every VERIFIED/PARTIAL row names the exact evidence. Code or
documentation that merely *exists* is never counted as acceptance here; a row
without an evidence pointer is NOT TESTED by definition.

Evidence labels are the house ones: **focused-test** (a named smoke suite),
**canonical-suite** (`npm run smoke:all`), **isolated-production** (an exact
`next build` served by `next start` on a private file-backend lane), **local-dev-lane**
(a private `next dev` lane), **static** (source read). None of these is
deployed-live, live-provider, live-PostgreSQL or cold-machine evidence.

The one ordered blocker list that needs Ed remains
[`launch-order-and-blockers.md`](launch-order-and-blockers.md) (⚡ DO THIS). This
document does not re-derive it; it places it.

---

## 1. Release blockers

| Item | State | Evidence |
| --- | --- | --- |
| Deploy with `NEXT_PUBLIC_PORTAL_SECURITY=strict` and an https `NEXT_PUBLIC_PORTAL_BASE_URL` | **BLOCKED (Ed)** | `inspectProductionReadiness()` with `.env.local` loaded: required 3/4 → 4/4 with the two variables (2026-08-28, `launch-order-and-blockers.md`). No deployment has been made since. |
| Supabase account reconciliation (1 portal user without Auth, 2 Auth users without portal record) | **BLOCKED (Ed)** | `node scripts/supabase-cutover-preflight.mjs` (read-only, hashes only). Creating/deleting accounts is not automated by policy. |
| Privacy-notice sentence, three retention numbers, embed-token distribution, DSAR intake | **BLOCKED (Ed)** | Drafts in `supabase-cutover-and-policy-drafts.md`; tripwire test pins both halves of the notice contradiction. |
| Apply the pending Supabase migrations before rollout | **VERIFIED (live) — DONE 2026-09-03** | All 14 pending migrations applied to live via `supabase db push` after a backup was confirmed; `migration list --linked` 27/27, 0 pending; `brand_enquiries.agency_id` backfilled 52/52 with every row count preserved; live `rls-verify.sql` 51 INFO / 0 FAIL. See `supabase-alignment-2026-09-03.md` §9. |
| Ecommerce public authority + custom domain + live Stripe acceptance (#69, the only P0) | **PARTIAL** | Local end-to-end verified per `issues.md` #69; live Stripe/provider half BLOCKED on credentials. |
| Release baseline commit | **VERIFIED** | the commit that adds this document (parent 06abeb9 on `main`) — the tree this document describes; every gate below was run against its exact build bCDk8GQ5KJFAZVYNDvwvq. |

## 2. Automated verification

| Item | State | Evidence |
| --- | --- | --- |
| Canonical suite on the release baseline | **VERIFIED** | Node phase 6693 tests across 1135 suites: 6691 passed / 0 failed / 2 skipped in 115621.124792ms; Website Editor gate 49/49 files (uncontended run at the end of the acceptance cycle; `final/smoke-all.log`). |
| TypeScript and whitespace | **VERIFIED** | `npm run typecheck` exit 0; `git diff --check` clean on the same tree. |
| Production build of the baseline | **VERIFIED** | webpack build bCDk8GQ5KJFAZVYNDvwvq: compiled in 87s, TypeScript 44s, 246/246 static pages in 522ms (isolated lane env, provider variables blanked, so the static-generation Supabase warnings of earlier builds do not appear and are not evidence either way). |
| The 2026-09-03 integration's own focused suites (19 suites) | **PARTIAL → VERIFIED** | 128/128 at integration, but that claim never ran the canonical suite: the untouched 06abeb9 had 40 failing tests across 30 files (reproduced by name in a throwaway worktree). Thirty-two stale pins were re-pointed with reasons and the real gaps closed (governed People search, origin-template classification, metadata catalogue, directory cards, read-path inventory, route census, request-scoped task tests); see the 2026-09-03 update entry. |
| Release-gate accounting pinned | **VERIFIED** | `scripts/smoke-release-acceptance-gate.test.ts` 4/4 pins the story matrix, the nine viewports and the missing-key rule of `browser-release-acceptance.mjs`. |
| Optional live-Postgres checks (2 skips) | **NOT TESTED** | Skipped by design without `DATABASE_URL`. |

## 3. Browser and responsive acceptance

All rows are **isolated-production** unless marked, on build bCDk8GQ5KJFAZVYNDvwvq, Chromium 151 via
playwright-core 1.62.1, private file-backend state seeded by the lane (`scratchpad/lane-3201/seed.mjs`).

| Item | State | Evidence |
| --- | --- | --- |
| House matrix: 13 pages × 17 viewports (six primary sizes, 320×568, 200% zoom ×2, eight Tailwind boundary probes), render/overflow/console/network/focus/axe | **VERIFIED** | 1326 checks: 1171 passed / 0 failed / 155 evidenced observations / 0 missing (`final/matrix/records.json`). The first run on the untouched baseline failed 9 axe serious colour-contrast checks on `/portal/agency/fulfilment` (12px `text-black/43` on the attention rows, 3.08:1); fixed in this cycle and re-run green. |
| Release gate: roles/gates, Radar split, Calendar linked records, My Tools folders/icons, newsletter facade, and 12 pages × 9 viewports with modal measurement | **VERIFIED** | 163 stories: 163 passed / 0 failed / 0 missing (roles 18/18, radar 10/10, calendar 12/12, tools 12/12, newsletter 3/3, layout 108/108) (`final/release2/records.json`). Two stories are explicit N/As on this target: the private icon upload (see §6) and nothing else. The visitor facade is driven as `http://localhost:<port>` because Next reports `req.url` with that host for an IP-literal binding, which is what its same-origin check compares against. |
| My Tools private icon upload on a production build | **BLOCKED (provider)** | Under `NODE_ENV=production` the icon route stores bytes only through the Supabase private bucket; the lane has none, so the documented refusal ("Private file storage is not connected…") is announced, the prepared icon is kept until undone and no half-saved asset reaches the record (release gate T3). Upload/read/replace/race/refusal/delete bytes are proven by `smoke-my-tools-icon-route` (11 tests) on the file backend. |
| Notepad autosave + Finance settings + loader (#54, #120, #136 evidence) | **VERIFIED** | notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing) (`final/ux/records.json`). |
| Team Chat and notification response ordering (#147) | **VERIFIED** | stories 22/22; matrix 72 passed / 0 failed / 9 evidenced observations of 81 at seven viewports on lane 3202 (same build, the gate's own minimal seed: with the richer seed the Attention Shield's five-item window holds the sixth alert, which is the product behaving, not a defect). |
| Phase Admin checked mutations (#47, Phase Admin portion) | **VERIFIED (production half)** | 10/10 stories across 390×844 and 1280×800, 2 recorded N/A (production preview refusal), 0 unexpected console/page/request/HTTP failures; "Preview as demo client" is refused 404 "Not available." on a production build by the dev-mode switch and is recorded as an explicit N/A — its navigation is proven on a Dev Mode lane (commit 0078567, 10/10). |
| Aqua Tag stop-routing mounted acceptance (#85) | **VERIFIED (local-dev-lane)** | 220/220 checks (0 failed) at 390×844 and 1280×800 (`final/aqua-tag.log`, lane 3203, `next dev --webpack` from the baseline tree). |
| Dev Editor dirty-transition contract (#19) | **VERIFIED (local-dev-lane)** | 191 passed / 2 failed / 13 explained N/A rows / 47 observations on the full matrix; the two failures were one timing-sensitive held-reply step that passed on an uncontended rerun of the AI scenario (14/14) and one dev-mode hydration-mismatch console warning raised only inside the AI scenario, recorded as an open residual (`final/editor-gate.log`, lane 3204, Dev Mode). |
| Keyboard operation and modal behaviour | **VERIFIED** | Calendar editor and both My Tools confirmations trap Tab, close on Escape and restore focus; the two topbar quick looks are non-modal popovers whose Escape now returns focus to the control (Business Radar aligned with My Radar in this cycle). Screen-reader announcement is **NOT TESTED** (no assistive technology is driven). |
| 44×44 touch targets | **PARTIAL** | Recorded as observations per page (e.g. calendar month controls 36px, phase card actions 28–30px, inbox chips 36px); not a release blocker under the existing house gates, listed in §9. |
| Deployed/CDN browser acceptance | **NOT TESTED** | No deployment exists. |

## 4. Authentication, tenancy, roles and permissions

| Item | State | Evidence |
| --- | --- | --- |
| Central session revocation on every read (#22) | **VERIFIED** | `smoke-session-revocation` 16/16; unchanged by the integration. |
| Role landings: owner → Command Centre, manager → Command Centre (legacy), staff → My Work, client-owner/end-customer → customer portal, anonymous → login | **VERIFIED** | Release gate R1–R7 at 390×844 and 1280×800. |
| Personal vs business Radar gates (staff.overview leaf; Business Radar composite; workload requires owner/manager + business capability) | **VERIFIED** | Release gate R3, R4, R9, D1–D5: sales seat gets My Radar without any Business Radar control/link; un-granted staff keeps the legacy my-day station but is refused Calendar; a governed narrow seat is refused both by the personal gates (`notice=staff-overview-required`, `notice=calendar-required`). |
| Calendar link authority (participants need `staff.people`, client links go through the client-association element, linked tasks must be visible to the actor, only the owner edits) | **VERIFIED** | Release gate R8: PATCH of another owner's item 404, another client's task 403, naming another person 403, own linked item 201/200; visibility lists exclude private items both ways. |
| Workspace element visibility in chrome (sidebar rows and topbar controls follow the actor's elements) | **VERIFIED** | Release gate chrome facts per persona (My Radar row/control, Business Radar control, Tools). |
| Release access matrix (create role → grant → request → approve/deny/cancel/revoke, positive and negative) | **VERIFIED** | `smoke-release-access-matrix` 22/22 (2026-08-27). |
| Last-grant revocation widening to legacy access (#174) | **BLOCKED (Ed decision)** | Pinned exactly; policy choice open. |
| Supabase-backed password login, MFA doors, end-customer password vs magic link (Q1) | **PARTIAL / BLOCKED** | Login route traced (`supabase-cutover-and-policy-drafts.md`); no live Supabase in any lane, so every lane attaches a seeded HMAC session (`AQUA_SESSION_COOKIE`) proven against `/api/auth/me`. |
| Provider-backed live persona / shared-credential acceptance (#25) | **NOT TESTED** | Needs live Supabase identities. |

## 5. Database migrations, RLS, backup and recovery

| Item | State | Evidence |
| --- | --- | --- |
| File backend cross-process atomicity (commercial, marketing, leads, uploads) | **VERIFIED** | `smoke-commercial-durable-processes` 3/3, `smoke-marketing-records-durable-processes` 3/3 and siblings (2026-09-02). |
| Live schema vs repository (drift) | **VERIFIED — closed 2026-09-03** | Was 11 migrations behind; after `db push` the drift tool reports 0 missing objects (1 no-op: `20260903130000_ensure_rls_event_trigger`, already present live, records on next push). The build's Supabase hydrate/write RPCs are now live. Pinned by `smoke-supabase-schema-status` 4/4. |
| Ordered application of all pending migrations | **VERIFIED (live)** | Rehearsed in isolation first (idempotent, backfill 52/52, RPC contracts, Aqua Tag cross-process 7/7), then applied to live 2026-09-03: `db push` ran all 14 in order; the `agency_id` backfill and every row count verified read-only afterward. |
| Explicit table grants (`20260903120000`, new) | **VERIFIED (isolated)** | The older tables inherited cloud default grants and would `42501` on a rebuilt/local project; the new migration writes them down (a no-op subset of the live inherited grants). Reviewed by an independent 3-lens adversarial pass; two findings fixed (audit_events tightened to SELECT+INSERT, rollback doc qualified). Applied on the local stack; RLS audit 51 INFO/0 FAIL. |
| RLS policy coverage | **PARTIAL** | Static `smoke-rls-policy-coverage`; live `rls-verify.sql` run on 2026-08-28 showed protected tables; three then-empty tables need re-checking once populated (`launch-order-and-blockers.md`). |
| Backup and point-in-time recovery | **PARTIAL — backups confirmed, restore not rehearsed** | The Management API shows 8 daily physical backups, newest 2026-09-03 05:55 UTC (newer than the last write) — the gate that let the migration proceed. **PITR is OFF.** A restore was not rehearsed, so recovery is not fully verified; runbook in `supabase-alignment-2026-09-03.md` §4. |
| Relational extraction / backfill (MIGRATION-PLAN Phases 1–7) | **PARTIAL** | Phase 0 shipped; later phases are engineering work, not blocked. |

## 6. Live providers, payments and webhooks

| Item | State | Evidence |
| --- | --- | --- |
| Stripe live account walkthrough; Memberships/Affiliates/Installments/Ecommerce live acceptance (#33, #42, #45, #69, #122, #123) | **BLOCKED (Ed credentials)** | Local lifecycle and webhook dedupe proven by focused suites; no live key in any lane. |
| Resend sending domain (Q2), Twilio (Q3), Meta developer app | **BLOCKED (Ed)** | Sandbox sender only delivers to Ed; documented in `ED-QUESTIONS.md`. |
| Newsletter visitor facade (#28/#29/#184/#185) | **VERIFIED (local)** | Release gate W1–W3: preview mount inert, 201 receipt, exact replay 200, drifted reuse 409, wrong consent 400, honeypot 200 "accepted", missing Origin 403, operator read session/tenant gated. No email is sent by design. |
| Aqua Tag database-native ingestion (#87) | **PARTIAL** | Source-verified with the unapplied migration above; live claim table NOT TESTED. |
| Post-deploy smoke (`npm run smoke:post-deploy`) | **BLOCKED** | Needs a deployment URL. |

## 7. Performance, accessibility and observability

| Item | State | Evidence |
| --- | --- | --- |
| Fresh-process production timings and first-load station bytes | **VERIFIED (local)** | 2026-09-02 benchmark in `tests.md`; not re-run in this cycle (no source change on the hot paths). Deployed geo/CDN timing **NOT TESTED**. |
| axe serious/critical = 0 on every walked page and viewport | **VERIFIED** | Matrix + release gate after four contrast fixes (`text-black/43`→`/60` in seven files, `text-emerald-950/58`→`/75` in two, the sidebar empty-workspace label now a swatch beside dark text). |
| Remaining low-opacity small text not walked by any gate (`ExternalAiConnectionPanel` `text-emerald-950/50–60`, `_ActionsWorkspace` `/65`, `NotificationCentreButton` `/62`) | **POST-RELEASE** | Static observation only; no axe finding was produced because the elements were not rendered on the walked pages. |
| Dev Team layout topbar-lead hydration mismatch (Dev Mode lane, AI scenario only) | **PARTIAL** | One React hydration warning with a component stack ending in `DevTeamLayout › header › div[data-topbar-lead]`, raised only inside the Dev Editor gate's AI scenario; plain loads are clean; production console of `/portal/dev-team` NOT TESTED (no gate walks it). TODO row added. |
| Server error capture / readiness (#132) | **PARTIAL** | Mounted locally; production client sink not installed. |
| Radar probe freshness (#170) | **BLOCKED (Ed decision)** | Daily cron; no surface shows evidence age. |

## 8. Documentation and deployment

| Item | State | Evidence |
| --- | --- | --- |
| Update log, TODO, issues, status and tests reconciled to this cycle | **VERIFIED** | `updates.md` entries dated 2026-09-03 (this session plus the seven previously unlogged integration commits); TODO rows and issue entries carry the evidence pointers. |
| Generated references and consolidated volumes regenerated | **VERIFIED** | `node scripts/generate-symbol-reference.mjs` and `node scripts/consolidate-authored-docs.mjs` run after the edits (see the update entry). |
| Deployment runbook | **PARTIAL** | `DEVELOPMENT-HANDOFF.md` + `launch-order-and-blockers.md` cover the two variables and the cutover; a Vercel deployment has not been executed since the last recorded one. |
| Known-good release baseline commit | **VERIFIED** | the commit that adds this document (parent 06abeb9 on `main`) (pushed to `origin/main`). |

## 9. Post-release UX and product improvements

All **POST-RELEASE**, none blocks the baseline:

- 44×44 targets on dense operator controls (calendar month toolbar, phase cards, inbox chips, notepad tabs) — recorded per viewport by the release gate.
- The `INTERNAL_WORKSPACE_NAME` sidebar label ("AquaOasis-Web") is a product constant, not the agency's name; a multi-tenant deployment should read it from the agency.
- End-customer chrome layout API answers 200 (their own record) — harmless, noted for the per-role element configuration work.
- The Dev Editor gate's recorded, unrepaired items (SEO-field over-asking, silent SEO draft discard on phone drawer close, two axe patterns on the editor doors) from commit 28fc767.
- The product roadmap in [`product-roadmap-2026-09.md`](product-roadmap-2026-09.md) (personal vs business Command Centre and Radar, semantic KPI definitions, data interfaces, configurable topbars, per-workspace/per-role navigation, overrides and permission-request workflows).
