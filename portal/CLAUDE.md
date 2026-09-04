@AGENTS.md

# AquaCRM Claude Handoff

## 🚨 CURRENT CONTINUATION BRIEF — refreshed 2 September 2026

**Read this section before dispatching a worker or editing anything.** It is the
current operational handoff and supersedes the stale status sentences at the
bottom of this file. It does not supersede source code or
`docs/development/TODO.md`: source is the final authority and **`TODO.md` is the one
current task list** (`checklist.md` and `todo-retired.md` were retired into it on 2026-08-31).

> ### 🔴 LATEST — 4 September 2026: deployment moved Vercel → Railway; storage incident
> **AquaCRM is no longer on Vercel serverless. It runs on an always-on Railway
> persistent server in EU-West, at `www.aqua-crm.com`** (GitHub-deployed from
> `edstorm987/aquacrm@main`, service `aquacrm`, root dir `portal`,
> `PORTAL_SINGLE_INSTANCE=true`). Any doc below that says "Vercel", "serverless",
> or "15s function timeout" is describing the OLD substrate — treat it as history.
>
> A performance outage was diagnosed and largely fixed the same day. Root causes:
> one 2.9 MB `app_datastores` row that Postgres rewrites in full on every write;
> five page renders that `await`ed the durable write; a `person.updated` outbox
> flood that was 40% of the blob; and a US↔EU app/DB split. Fixes shipped: EU
> region move, `flushPendingWritesForRender()` (`42f83c44`), the person.updated
> `substantive` gate (`4d1b8415`), and the login-redirect/base-URL fixes
> (`59ec0037`). **The durable fix — splitting the one row into per-domain
> clusters via the existing sidecar machinery (never applied to live data) — plus
> the full architecture, incident analysis, blob composition, peel order and the
> non-negotiable rehearse-first migration procedure, is documented in
> `docs/development/plans/storage-architecture-and-2026-09-04-incident.md`. Read
> it before touching `storage.ts`, the sidecars, or any state migration.** Still
> open: apex `aqua-crm.com` DNS (public login links `NXDOMAIN`), clearing the
> 2,809 stale outbox events, and the cluster migrations themselves.

### First five minutes: preserve the working state

- Work in `aquaCRM/portal`. At this documentation refresh the checkout was
  **`main` at `ffd9110`** with **272 status entries**, but active work makes both
  facts a moving snapshot. **Run `git branch --show-current`, `git rev-parse
  --short HEAD` and `git status --short` first, always** — commands supersede this
  paragraph.
- The tree carries extensive concurrent work across source, tests and docs. Use
  narrowly scoped patches and diffs. Do not reset, rebase, checkout,
  clean, blanket-regenerate, stash, commit, push, deploy, or rewrite history
  unless Ed explicitly asks.
- Preserve the intentional deletion of the retired
  `docs/reference/files/**` stub tree and `src/app/manifest.ts`. The former is
  replaced by consolidated reference volumes; the latter is replaced by
  `public/manifest.webmanifest`. Preserve the new `docs/00-START-HERE.md` through
  `docs/08-HISTORY-AND-ARCHIVE.md` volumes and their manifest.
- Never assume an old documented port is still running or owns the current source.
  Inspect the listener/build first and use `npm run sandbox:fork` for an isolated
  browser/server lane. Do not kill or reuse another worker's server, and do not
  delete ignored `.next*` outputs without resolving the exact owner and target.
- Do not brief from `docs/context/state.md`,
  `docs/context/commander-handoff.md`, or anything in `docs/context/archive/`.
  Those records are history and contain stale persistence, Showcase, erasure,
  and implementation claims. Start from `docs/development.md`, then
  `docs/development/TODO.md`, and verify every claim in current source.

### Finished work — do not reopen or rebuild it

- **The bounded speed phase is complete locally.** Pristine fresh-process
  production timings, first-load station boundaries, Library/Logs extraction,
  provider deadlines, realm/access-aware caches, and representative responsive
  browser acceptance are recorded. Remaining speed work is deployed geo/CDN and
  live-provider measurement, not another speculative local rewrite.
- **The slow-load presentation is complete.** Slow portal routes use a small
  workspace-themed loader: luxury navy for normal Agency, cyan/near-black for
  Command, gold/midnight for Dev Team, and deep marine for client/customer. It
  preserves sidebar/topbar for route loads, uses full viewport only for a whole
  workspace handover, waits 110 ms to avoid flashing, exits with a bounded 460 ms
  split curtain, keeps cinematics above it, and removes motion for reduced-motion
  users. Do not restore skeleton blocks.
- **The human access kernel exists.** Persisted reusable role templates, direct
  per-person grants, requests/approval/denial/cancellation/revocation, exact
  agency/workspace/client/project plus Live/Sandbox scopes, expiry, and stable
  `element.<key>.view|use|manage` capabilities are implemented. Settings,
  People, and Fulfilment mount the shared manager. Representative Staff,
  Fulfilment, client and exact-project Dev boundaries enforce it.
- **The exact-project Dev Workspace and trusted preview supervisor exist.** The
  editor, code/AI/explorer/publish gates, and loopback Start/Status/Logs/Stop/
  Restart control are present. A project grant must never reveal internal
  `/portal/dev-team` control-plane data.
- The authored docs are consolidated into nine volumes from the authored sources
  recorded in `docs/consolidation-manifest.json`, with 20 canonical Library
  documents. Regenerate them; do not re-create thousands
  of retired one-file Markdown stubs.

### Exact continuation order

*This sequence originated on 2026-08-27 and was reconciled on 2026-09-02. Items
1, 3, 4 and 5 are complete; 2 and 6 retain explicit residuals. Verify in source
and the current TODO before acting on any line here.*

1. ✅ **P0 security — central session revocation. DONE.** `resolveFreshSessionUser()`
   (`src/lib/server/auth/auth.ts`) runs on every `getSession()` /
   `getSessionFromRequest()` read, so existence, `sessionRev`, current role and
   live agency membership are prerequisites for every authenticated request and
   all `requireRole()` callers inherit it. The exploit is dead: the old owner
   cookie now gets 403 with no token from `POST /api/portal/settings/external-ai`
   after downgrade, password rotation, explicit rotation and deletion.
   `npm run smoke:session-revocation` (16/16). → issues #22 RESOLVED.
2. 🟡 **Dev Workspace phase 17 — preview half complete, dirty-transition browser half
   proven (28fc767, re-run 2026-09-03), authoring half blocked on credentials.** Built and proven: the isolated per-project branch/worktree on
   `aqua-editor/<projectId>`, declared dependency-install readiness with an
   `installing` state, and the named failure paths (dependency/start failure,
   occupied port, crash, CSP, stale preview, rejected AI change, cross-project
   denial). **Browser-accepted** on a `sandbox:fork` lane: Start → healthy on
   loopback → an uncommitted edit **retained across Restart** onto a new port →
   `/aqua-tag.js` 200 → Stop, with the edit still on disk. **Remaining:**
   the authoring walk (edit → save → diff → commit → PR) needs **Ed's GitHub
   credentials — promised, not yet supplied** (see TODO.md); plus
   clone-from-remote and the dirty-transition browser matrix (issues #19).
3. ✅ **Phase 18 client embedding — DONE 2026-08-27, browser-accepted.**
   `/portal` now sends `client-owner`/`client-staff` to **`/portal/customer`**, and all
   seven customer-portal gates name one list, `CUSTOMER_PORTAL_ROLES`
   (`src/server/types.ts`). Deliberately NOT widened:
   `SURFACE_ROLE_CEILING.customer` stays `["end-customer"]` — an undeclared plugin
   page inherits the WHOLE ceiling, so widening it would open every unclassified
   customer plugin page at once; those are shopper surfaces owned by the client's
   own customers. Two lockouts were closed with it: `customer/setup` (the layout
   sends an unfinished account there, and it refused non-end-customers — a fresh
   client would have been stranded) and `customer/connections`. The chrome's
   hardcoded `role="end-customer"` now passes the real role, so a client-owner is
   not labelled an "End customer". Pinned by `npm run smoke:client-portal-placement`
   (9/9), both halves verified by breaking them.
   **Browser-accepted** on a `sandbox:fork` lane (port 3047; 3032 untouched). A real
   `client-owner` session goes `/portal` → `/portal/customer` and renders their portal;
   the profile menu reads "Client owner"; setup answers them 400-on-validation while an
   agency session still gets 403. Seven viewports plus 200%-zoom equivalents down to
   188×406: zero horizontal overflow, no console errors, every request 200.
   **The walk earned its keep** — it found an infinite redirect loop
   (`/portal → /portal/customer → /setup → /portal`) that locked a NEW client out
   entirely, which no unit test caught because all three gates were individually
   correct (issues #171). The regression now walks the redirect GRAPH, layout included.
   *Two things the harness cannot prove:* keyboard ACTIVATION (a plain `<button>` records
   zero activations from a synthetic Enter — tab order and focus rings are proven), and
   repeat in-place navigation (the known in-pane HMR stall, issues #162).
   *Superseded description below:* A real `client-owner` with an exact project grant lists only that
   project and is refused siblings, previews and Aqua's own tree
   (`npm run smoke:client-dev-workspace`, 26/26 including the internal-workspace
   boundary). `clientProjectAccess.ts` is the one place that provisions a client's
   access, refusing a project not attached to that client. **Ed decided the
   placement:** the internal workspace is for employees, and *"for clients
   anything they touch is inside their portal"* — and **the existing customer
   portal IS that portal**. **Remaining:** re-point `client-owner`/`client-staff`
   (`src/app/portal/page.tsx:20`) at `/portal/customer` and widen that layout's
   `requireRole("end-customer")`, then browser-prove a real client session.
   Full reasoning in `docs/development/notes.md`.
4. ✅ **Application-wide access adoption — DONE 2026-08-27.**
   `/api/portal/<moduleId>/<...>` now resolves which `client.*` element owns a
   client-scoped call; every built-in module is classified as mapped or
   explicitly-unmapped-with-a-reason (`npm run smoke:plugin-client-element`).
   **The association half is DONE 2026-08-27.** `clientAssociationElement.ts`
   classifies the three agency records that name a client — generic task and task
   template → `client.overview` (the "may you see this client at all" element,
   because a generic task belongs to no single one), freelancer job →
   `client.fulfilment` — and all three routes now enforce it. An explicit
   alternative-authority list preserves the contractor's own `FreelancerAccessConfig`
   view rather than forcing the wrong client gate. `npm run smoke:client-association-element`
   (13/13), issues #172.
   **The convergence half is DONE 2026-08-27 (issues #173).** Most of the old
   wording was stale — People already consumed the evaluator and no custom-role or
   client-assignment records remain. A sweep of every HR/freelancer/customer route
   found twelve deciding without the evaluator, nine of them legitimately (public
   signup, the portal's own account routes, the contractor's `FreelancerAccessConfig`
   surfaces). The three genuinely competing agency-side routes — `freelancers`,
   `freelancer-access`, `people/cv` — now use the same `staff.people` element the
   rest of People uses. `npm run smoke:hr-policy-convergence` (7/7) pins both what
   must consume the evaluator and what must deliberately not, with a sweep so a NEW
   HR route cannot decide access on its own unnoticed.
   **Item 4 is complete.** What remains application-wide is the whole app's other
   legacy pages/APIs, which is item 6's residue rather than this item.
5. ✅ **Release access matrix — DONE 2026-08-27.** Two people, two projects, two
   clients and two environments driven through the real kernel: create role →
   grant → request → narrow/approve/deny/cancel/revoke, with every positive paired
   to the negative that a merely-permissive kernel would pass — the other person,
   the other project, the other environment, the other client, and the same person
   after revocation. Hidden/View/Use/Manage are proven **as reads and writes**
   against a real gated route (`api/tenants/client-notes`), not only as capability
   lookups, and the store is checked so a 200 cannot mean "answered without
   writing". Live/Sandbox revoke independently and immediately.
   `npm run smoke:release-access-matrix` (22/22).
   **Verified two-sided:** a kernel stubbed to answer `true` fails 11, one stubbed
   to answer `false` fails 6. Neither degenerate kernel passes.
   **It surfaced one thing for Ed — issues #174:** revoking an identity's LAST
   grant returns them to un-migrated legacy access, so revocation WIDENS instead of
   narrowing. Documented behaviour followed to its conclusion, pinned exactly, and
   left as a decision rather than changed unilaterally.
6. 🟡 **Close the recorded runtime residue.** Stale preview is closed (issues #19).
   Still open: live two-instance Editor-AI database coordination (needs
   `DATABASE_URL`), unapplied owned-sidecar PostgreSQL migrations, dirty-editor
   browser transitions, provider-backed Staff persona/shared-credential acceptance,
   unresolved references, dependency-safe retirement and hidden render-time
   mutation. Use issues/TODO, not memory.

### Also decided on 27 August — read before touching Fulfilment

Ed set a product direction that now has a plan and working code:
**`docs/development/plans/fulfilment-template-system.md`**. The Portals library is
consolidated into Fulfilment (one home; `/portal/agency/portals` is a redirect
stub — **do not re-create the second address**), a portal template's changes are
offered to each client through an **Update button showing changes and conflicts**
where *a client left on an older version is a supported state, not drift*, and the
cross-tenant **origin template** ("the agency for everyone") has its boundary,
projection and seed built. All four phases are code-complete; what remains is a
review-and-seed screen. His answers on what transfers are recorded verbatim in
`docs/development/notes.md`.

### Required verification and truth labels

- During iteration: run the nearest focused test under the correct runtime,
  `npm run typecheck`, and `git diff --check`.
- Canonical full suite before calling a behaviour complete is `npm run smoke:all`.
  Its exact expansion is:

  ```bash
  PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' \
    node --import tsx --test scripts/*.test.ts \
    'src/built-ins/modules/!(website-editor)/src/__smoke__/*.test.ts' && \
    npm run smoke:website-editor
  ```

  The first gate covers every script test plus every non-Website-Editor module
  smoke suite. The separate Website Editor gate intentionally runs without the
  server-only React condition required by the first gate.

  > ### ✅ The suite is green — 27 August, first time since 23 August
  > **4,482 tests / 4,480 pass / 0 fail / 2 skip**, and it stayed green across the
  > Phase 18 behaviour change. It started the day at
  > **4,356 / 4,278 / 76 / 2**. Triage took the count from 76 to 0 and introduced
  > **zero** new failures at any point — every run was diffed against the previous
  > failure list **by test name**, not by count, which is the only way that claim
  > means anything. The 2 skips are the optional live-Postgres checks.
  >
  > **Five real defects came out of that triage**, every one of them hiding behind
  > a failure that had been written off as a stale test pin:
  > `#164` demo-flag leak suppressing the Supabase identity cross-check ·
  > `#165` the 2026-08-19 live blocker returned through the dropped sandbox
  > envelope · `#166` a client-element ceiling refusal answered with legacy
  > `manage`, including for another agency's client · `#167` an internal access
  > fault reported as a 400 with the internal message in the body ·
  > `#169` a MISSING date rendering as TODAY, including the "Issued" date on the
  > invoice export.
  >
  > **Green is not the same as finished.** Two items are open and recorded rather
  > than closed: `#168` (28 routes answer 403 where the house convention is 404 —
  > consistency, not a hole) and `#170` (Ed's decision: the Radar probe cron is now
  > daily, so evidence can be 24h stale with no surface saying so).
  >
  > **Do not brief the 23 August "3,621 pass / 0 fail" result as current** — it is
  > history, and it was green over a smaller suite. When you change behaviour, diff
  > your failure list against this one by name and say which failures are yours.
- Browser acceptance must exercise 375×812, 812×375, 768×1024, 1024×768,
  1280×800 and 1920×1080, plus 320×568, 200% zoom and exact breakpoint
  probes where relevant. Require no overflow/content flash, 44×44 targets,
  keyboard-complete operation, focus containment/restoration, zero serious or
  critical accessibility findings, and a clean console/network log.
- Run `npm run build` for a significant release boundary. Production timing is
  available through `npm run perf:production:preflight` followed by
  `npm run perf:production`; its fresh processes still share host filesystem
  cache and are not a cold-machine/CDN claim.
- After code changes, update the owning canonical docs and newest-first update
  log, run `node scripts/generate-symbol-reference.mjs` when source signatures or
  paths change, then `node scripts/consolidate-authored-docs.mjs`. Keep evidence
  labels exact: static, focused-test, local-browser, isolated-production, and
  deployed-live are not interchangeable.

### Latest trustworthy evidence

*3 September 2026 — Supabase migrations APPLIED to live.* The one Supabase project
(`dghzbsxbdatskserctgt`, eu-west-1) is development, staging AND production — there is no second
project. It **was** eleven migrations behind the repository (`node portal/scripts/supabase-schema-status.mjs`, read-only), so the
current build cannot hydrate against it. Every live probe was a GET/HEAD or PostgREST OpenAPI read with
the service-role key; nothing live was changed (byte-identical before/after). All 26+1 migrations were
rehearsed on an isolated local stack (Docker): ordered apply, the 52-row `brand_enquiries.agency_id`
backfill, idempotency, clean `rls-verify.sql` (51 INFO/0 FAIL), the cross-process Aqua Tag proof 7/7, and
the full browser suite against `PORTAL_BACKEND=supabase` (release 163/163, matrix 1169/0, Notepad/Finance
77/77, Phase Admin 10/10). Two migrations were added — `20260903120000_explicit_service_role_grants.sql` (the older tables
inherited cloud default grants and would 42501 on a rebuilt project) and
`20260903130000_ensure_rls_event_trigger.sql` (codifies the live-only auto-RLS trigger). **On
2026-09-03 Ed provided the DB password + `sbp_` token and all 14 pending migrations were applied to
live via `supabase db push`** after a same-day backup was confirmed: `migration list --linked` 27/27,
the `agency_id` backfill 52/52 and every row count verified read-only, live `rls-verify.sql` 51 INFO /
0 FAIL. **Still open:** enable PITR + rehearse a restore (backups exist, PITR off), push the no-op
`20260903130000`, decide on tightening the inherited over-broad grants, account reconciliation, and
rotate the pasted DB password + token. Full register + recovery runbook:
`docs/development/plans/supabase-alignment-2026-09-03.md`. **Local hazard:** with `.env.local` loaded and
no `PORTAL_BACKEND`, the portal promotes itself to the Supabase backend and writes the production state
row — set `PORTAL_BACKEND=file` for local work.

*3 September 2026 — release baseline.* The integrated `main` (six worker lanes, My Tools
folders/icons, the personal/business Radar split with linked Calendar records) was built
fresh as an exact production dist and every browser gate ran against it on isolated lanes:
house matrix 1326 checks: 1171 passed / 0 failed / 155 evidenced observations / 0 missing, the new release gate `browser-release-acceptance.mjs` 163 stories: 163 passed / 0 failed / 0 missing (roles 18/18, radar 10/10, calendar 12/12, tools 12/12, newsletter 3/3, layout 108/108),
Notepad/Finance notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing), Team Chat stories 22/22; matrix 72 passed / 0 failed / 9 evidenced observations of 81 at seven viewports, Phase Admin 10/10 stories across 390×844 and 1280×800, 2 recorded N/A (production preview refusal), 0 unexpected console/page/request/HTTP failures, Aqua Tag 220/220 checks (0 failed) at 390×844 and 1280×800, Dev Editor
191 passed / 2 failed / 13 explained N/A rows / 47 observations on the full matrix; the two failures were one timing-sensitive held-reply step that passed on an uncontended rerun of the AI scenario (14/14) and one dev-mode hydration-mismatch console warning raised only inside the AI scenario, recorded as an open residual, canonical suite Node phase 6693 tests across 1135 suites: 6691 passed / 0 failed / 2 skipped in 115621.124792ms; Website Editor gate 49/49 files. Four contrast defects and one focus-return defect were
fixed first. The labelled register is `docs/development/plans/production-readiness-roadmap-2026-09-03.md`;
the post-baseline product plan is `plans/product-roadmap-2026-09.md`. Isolated lanes attach a
seeded session cookie (`AQUA_SESSION_COOKIE`) because the login route needs Supabase. Everything
below this paragraph is older evidence.

*Refreshed 2 September 2026. These are local/source-freeze and isolated-
production-browser measurements. They are not deployed geo/CDN, live-provider,
live-PostgreSQL-migration, cold-machine or broad human-usability proof.*

- **Canonical `npm run smoke:all` is green.** Its Node phase executed **6,417
  tests across 1,093 suites: 6,415 passed / 0 failed / 2 skipped in
  94,027.354917ms**; the subsequent Website Editor runner passed **49/49 files
  in 11.8s**.
- **Later on 2 September 2026 — five further checkpoints landed on `main`** (read
  `docs/development/updates.md` for each): `a25ebf1` Performance checked-mutation
  cohort (fifth #47 cohort; #128 and #129 closed on exact build
  `H-vbnKm_hrkDkN8fgxwqF`, **119/119** Playwright stories at seven viewports);
  `44a594d` settings truthfulness slice one plus opportunity money across real
  processes (#81 file-backend half) and a load-safe lease pin; `2f5fea9` Leads
  Pipeline settings consumed; `fdba9c7` settings truthfulness final pass
  (**12 manifests / 35 fields: 32 consumed, 3 unwired** — the three that remain are
  safety-shaped controls awaiting a security decision); `141f46f` Marketing record
  compare-and-set proven across real processes (#82 file-backend half). The final
  uncontended canonical `npm run smoke:all` on that tree executed **6,529 tests
  across 1,115 suites: 6,527 passed / 0 failed / 2 skipped**, then the Website Editor
  gate passed **49/49 files**. Two canonical pins are load-sensitive
  (`smoke-product-workspace-lease-fencing`, now elapsed-time aware, and the
  close-deal true-race assertion): rerun a lone timing failure in isolation before
  treating it as yours. Retained `.data` (37 files) was byte-identical throughout.

- The latest isolated production benchmark built in **158,476.1ms** with a
  **1,584,943,643-byte** dist. Fresh-process first HTTP / repeat max was auth
  **765.9/9.2ms**, public **641.4/6.0ms**, Agency **949.4/53.1ms**, Dev Team
  **869.2/38.9ms**, Library **803.6/30.4ms** and Logs **892.8/30.7ms**; readiness
  was **304.3–309.1ms** and every failure list was empty. Shared host caches make
  this fresh-process, not cold-machine or deployed-CDN, evidence.
- Fresh cacheless, service-worker-blocked station measurement passed **8/8**.
  Agency Day transferred **674,535B** of first-navigation JS/CSS; extra transfer
  versus Day was Executive **4,473B**, Battle **36,102B**, Calendar/Actions
  **42,174B**, Advisor **12,528B**, Dev Team **21,059B** and Radar Inspector
  **34,731B**. These are transfer bytes, not execution or paint timings.
- The broad production-target browser matrix accounts for all **1,326** checks as
  **1,177 passed / 0 failed / 149 evidenced aborted speculative RSC-prefetch
  observations / 0 missing**. The reusable-auth Settings matrix is **102 = 92 / 0
  / 10 / 0**. The corrected exact-width probe is **6/6**: Settings Environment at
  768px, Studio at 390/1024/1440 and Fulfilment Roles at 390/1280, all HTTP 200
  with zero console, page, request or HTTP errors; the recorded source hash was
  unchanged.
- The role browser roundtrip created a reusable role, persisted Projects Manage,
  reloaded, downgraded it to View, reloaded and archived it. Fulfilment exposes
  **11** element radiogroups and 11 each Hidden/View/Use/Manage plus Projects,
  Portals and Aqua Tags. A separate isolated-production Staff Technical matrix
  passed **50/50** through six same-cookie Hidden → View → Use → Manage → View →
  Hidden transitions with zero failures, errors or overflow. Hidden routes use
  valid streamed Next not-found content (document HTTP 200 or 404), and the exact
  API downgrade was refused with HTTP 403.
- Fulfilment checked-mutation acceptance passed at **390px and 1280px**: injected
  failure produced an alert, no reload or false success, retained or rolled back
  state as appropriate, and then succeeded on retry.
- Studio's synthetic sample opened template scope only, made no client-scope
  sample request and kept Publish in the viewport at all three widths. Its sample
  API was HTTP 200. Focused source proof is **29/29** and wider editor/tenancy/
  access proof is **111/111**.
- The final primary production webpack build compiled in **47s**, completed
  TypeScript in **5.1s** and generated **245/245** pages in **489ms**.
- `20260902092000_owned_sidecar_compare_and_swap.sql` implements receipt-
  deduplicated transactional main-plus-owned-sidecar patching and one-statement
  snapshot hydration. It is source/mocked verified but **unapplied to live
  PostgreSQL**; do not claim live migration or remote-concurrency acceptance
  until it is deployed and exercised there.

### External decisions and blockers

- `DATABASE_URL` was absent at handoff, so Supabase migrations and live
  two-instance Editor-AI claim coordination still need a configured environment.
- **Ed's GitHub credentials for the Dev Editor publish walk — promised 27 August,
  not yet supplied.** Everything up to the publish boundary is proven; commit → PR
  → merge against a real repository cannot be walked without them. When they
  arrive: connect GitHub *in the editor* (one vault, do not fork a second
  connection store) and walk it on a throwaway branch before any client
  repository. **Never enter a real key yourself.** → `docs/development/TODO.md`.
- Ed must approve merge to main, real onboarding-code walkthrough, live
  Stripe/Meta credentials, deployment environment, and DPO/solicitor decisions.
- **Resolved 27 August, do not re-ask:** the client-portal placement (the existing
  customer portal is the client's portal), and what the origin template transfers
  (designs yes; phases and written SOPs no; contract and task templates yes, minus
  branding and minus any client's actual agreement). Both recorded verbatim with
  reasoning in `docs/development/notes.md`.
- The preview supervisor starts an already configured trusted repository. Clone,
  worktree and dependency-install automation is not complete merely because
  Start/Restart/Stop works.

## ⚖️ Treat `docs/development.md` as law

**`docs/development.md` is the master document. Start there, use it for
everything, and update it (or the doc it points to) after every change.** It is
the catalogue that ties the whole project together — goals, the roadmap, the
code map, issues, tests, notes, and the running changelog — and it explains the
before/after workflow every change must follow. Whether you are an AI or a human,
reading down from `development.md` gets you the entire project; nothing is lost
because everything is written and linked from that one place. Do not start by
guessing from individual screens.

The documents below are all reachable from `development.md`; read them when it
sends you there:

1. `docs/PRODUCT-ARCHITECTURE.md` for domain ownership and the macro/micro
   workspace model.
2. `docs/CURRENT-IMPLEMENTATION.md` for what is implemented, what needs live
   integration values, and the latest upgrades.
3. `docs/DEVELOPMENT-HANDOFF.md` for local commands, persistence, testing,
   deployment, and safe editing rules.
4. Feature-specific documents in `docs/` when touching external assistants,
   Meta messaging, development cleanup, or brand architecture.
5. `docs/WORKSPACE-FILE-TREE.md` — the map of every file and what it does (the
   contents page). Use it to orient FAST instead of re-exploring:
   - the chapters in `docs/workspace/` (one per area) explain what each part does;
   - `docs/reference/` is the function-by-function symbol map (every exported
     function/method with its real signature — grep it, don't open source);
   - `docs/workspace/feature-index.md` answers "where does X live?";
   - `docs/workspace/api-reference.md` lists every endpoint;
   - `docs/workspace/hazards-and-duplication.md` says what NOT to build twice.

## Start here if you are new

[`docs/architecture-noobie.md`](docs/architecture-noobie.md) explains the whole system in
plain English — the nesting of agency/company/client, where data actually lives, how modules
switch on and off, and the five things that most often mislead people. It is the fastest way
to stop guessing.

## Product Intent

AquaCRM is not a collection of disconnected CRM pages. It is Ed's business
operating system. Agency workspaces provide the portfolio-wide macro view.
Each client workspace provides the same capabilities at a client-scoped micro
level. Customer portals expose only deliberately shared information.

The core operating boundary is:

- Journey owns people, relationships, enquiries, sales movement, meetings,
  qualification, and conversion.
- Fulfilment owns the actual work after a service is sold, including technical
  delivery and the product/service operating model.
- Finance owns money and obligations, both portfolio-wide and client-scoped.
- Command Centre owns Ed's day, business monitoring, decisions, strategy, and
  Radar.
- Master Inbox owns communication and actionable attention.
- Client workspaces are the canonical micro operating surface. Do not send a
  user back to an agency-wide screen to perform an ordinary client-scoped job.

## Non-Negotiable Contracts

- Preserve multi-company and multi-workspace behaviour. One buyer may have
  separate projects, companies, services, and portals.
- Product/service assignments drive client modules and independent service
  stages. A client does not have one universal delivery stage.
- Internal records stay internal unless explicitly marked client-visible.
- Operational alerts must identify the exact evidence and provide a direct
  resolution path. Never show a vague count with nowhere to act.
- Radar must distinguish health, evidence confidence, and setup/readiness.
  Missing evidence is a visible blind spot, never a healthy pass.
- Suggested Radar, Advisor, CRM, or external-AI work requires human acceptance
  before becoming committed work.
- Respect role and agency scope on every server mutation. Client-scoped staff
  must not be sent into unrestricted agency-wide workspaces.
- Preserve local work and do not push, commit, deploy, or alter Git history
  unless Ed explicitly asks.
- Changing what somebody IS must never destroy what they DID. Facets on a
  `Person` are retained through reclassification, never deleted.
- An action must state how it can be dealt with (`in-app`, `off-system`,
  `judgement`) and what clears it. Never offer a Resolve control for work that
  happens outside Aqua, and never claim a clearance condition for a judgement
  call.
- Run the FULL smoke suite (`npm run smoke:all`, whose exact expansion is the
  scripts, non-Website-Editor module, and separate Website Editor command above)
  before calling a behaviour change done. Adjacent suites are not enough — an existing
  contract test may be pinning the behaviour you just changed.

## Before Editing

- Confirm the Git worktree and do not overwrite unrelated local changes.
- Read the relevant Next.js guide in `node_modules/next/dist/docs/` as required
  by `AGENTS.md`.
- Trace the authoritative server function, API route, and persisted type before
  changing a UI.
- Find the nearest smoke test and extend it with the behavioural contract.
- **Check what already exists before building anything.** Search
  `docs/reference/` (every function + signature) and
  `docs/workspace/feature-index.md` for the concern. Default to
  **reuse → repurpose → simplify** an existing surface over adding a new one —
  this codebase already duplicates several features, and the goal is to move
  forward without missing what's there.
- **Check `docs/workspace/hazards-and-duplication.md` before editing a feature
  that might be duplicated** (e.g. fulfilment, contacts, the Aqua Tag) so you
  edit the canonical copy — never add a third.
- Prefer existing helpers, visual language, and route conventions.

## After Editing — keep the map current

The docs are a living map; a change that isn't reflected there costs the next
session context and re-exploration. After a change:

- **Update the relevant chapter** in `docs/workspace/` when you add, move, or
  retire a file or feature — and `docs/workspace/feature-index.md` if it's a new
  cross-layer concern.
- **Regenerate the unified reference** so source paths and signatures stay exact:

  ```bash
  node scripts/generate-symbol-reference.mjs
  ```

  This command rewrites the consolidated reference volumes and prunes the
  retired `docs/reference/files/` stub tree. Do not restore or hand-generate that
  legacy tree. `generate-file-docs.mjs` now exists only as a compatibility alias.
  If Radar rules changed, also run
  `npx tsx scripts/generate-radar-rules-reference.ts`. If authored Markdown
  changed, run `node scripts/consolidate-authored-docs.mjs`. Then grep the
  generated indexes for any old path you moved and expect zero hits. New
  top-level source area? Add its bucket to `BUCKETS` in
  `generate-symbol-reference.mjs`.
- **Added an endpoint?** Add its row to `docs/workspace/api-reference.md`.
- **Had to add a duplicate, alias, or dead path?** Log it in
  `docs/workspace/hazards-and-duplication.md` so it isn't mistaken for canonical.

Operational snapshot at the 2 September 2026 documentation refresh: **`main` at
`ffd9110`** with **272 status entries**. This is a moving, concurrently edited
working tree, not a freeze. The current brief at the top of this file, source and
`docs/development/TODO.md` supersede older status prose; live Git commands
supersede every embedded branch, commit and file count.
