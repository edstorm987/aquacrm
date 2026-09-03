# AquaCRM documentation — start here

> The catalogues, runbooks and entry-point instructions for people and agents.
>
> Consolidated 2026-09-02 from **21** source documents / **36,181 words**. Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.

## Source map

- [`AGENTS.md`](#source-agents-md) — 95 words · `63f2c50380ed`
- [`CLAUDE.md`](#source-claude-md) — 4,053 words · `8e641d8c8fa2`
- [`docs/data/adr/ADR-001-semantic-registry-in-code.md`](#source-docs-data-adr-adr-001-semantic-registry-in-code-md) — 217 words · `f092ef6a564d`
- [`docs/data/adr/ADR-002-domain-modules-are-the-repository-seam.md`](#source-docs-data-adr-adr-002-domain-modules-are-the-repository-seam-md) — 218 words · `361439671762`
- [`docs/data/adr/ADR-003-one-calculation-path-per-metric.md`](#source-docs-data-adr-adr-003-one-calculation-path-per-metric-md) — 233 words · `9143b1627c97`
- [`docs/data/adr/ADR-004-metadata-governed-not-banned.md`](#source-docs-data-adr-adr-004-metadata-governed-not-banned-md) — 196 words · `5f24a446b529`
- [`docs/data/ARCHITECTURE.md`](#source-docs-data-architecture-md) — 1,158 words · `b670851546a2`
- [`docs/data/DATA-DICTIONARY.md`](#source-docs-data-data-dictionary-md) — 978 words · `23b25d96792a`
- [`docs/data/LINEAGE.md`](#source-docs-data-lineage-md) — 681 words · `427fd35d964a`
- [`docs/data/MIGRATION-PLAN.md`](#source-docs-data-migration-plan-md) — 2,014 words · `867a7712f43a`
- [`docs/data/SEMANTIC-LAYER.md`](#source-docs-data-semantic-layer-md) — 783 words · `cea3578c4a18`
- [`docs/data/SOURCE-INVENTORY.md`](#source-docs-data-source-inventory-md) — 1,724 words · `11b027a56a18`
- [`docs/DEVELOPMENT-HANDOFF.md`](#source-docs-development-handoff-md) — 1,552 words · `9199166a1f30`
- [`docs/development-workspace-cleanup.md`](#source-docs-development-workspace-cleanup-md) — 793 words · `bdb46a5cecd3`
- [`docs/development.md`](#source-docs-development-md) — 3,285 words · `9f2c4da449cb`
- [`docs/development/CAMPAIGN-LEDGER.md`](#source-docs-development-campaign-ledger-md) — 11,346 words · `8906eb267d7b`
- [`docs/development/CLOUD-RESUME.md`](#source-docs-development-cloud-resume-md) — 500 words · `03458cdf18bf`
- [`docs/development/ED-QUESTIONS.md`](#source-docs-development-ed-questions-md) — 2,095 words · `379784a12461`
- [`docs/development/LOOP-PROGRESS.md`](#source-docs-development-loop-progress-md) — 1,643 words · `38954d1ad66e`
- [`docs/development/TODO.md`](#source-docs-development-todo-md) — 2,180 words · `596b0f059feb`
- [`README.md`](#source-readme-md) — 437 words · `78865db66238`

---

<a id="source-agents-md"></a>

## Source document — `AGENTS.md`

<!-- AQUACRM_SOURCE_START path="AGENTS.md" sha256="63f2c50380ed6303237cce215ce27af1d620d094c215e28d1b1538a3c070e3bb" -->
<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
<!-- AQUACRM_SOURCE_END path="AGENTS.md" -->

---

<a id="source-claude-md"></a>

## Source document — `CLAUDE.md`

<!-- AQUACRM_SOURCE_START path="CLAUDE.md" sha256="8e641d8c8fa2d1e6db5ffd5af6286f323da306086f10f20a1345e19ad695a872" -->
@AGENTS.md

# AquaCRM Claude Handoff

## 🚨 CURRENT CONTINUATION BRIEF — refreshed 2 September 2026

**Read this section before dispatching a worker or editing anything.** It is the
current operational handoff and supersedes the stale status sentences at the
bottom of this file. It does not supersede source code or
`docs/development/TODO.md`: source is the final authority and **`TODO.md` is the one
current task list** (`checklist.md` and `todo-retired.md` were retired into it on 2026-08-31).

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
2. 🟡 **Dev Workspace phase 17 — preview half complete, authoring half blocked on
   credentials.** Built and proven: the isolated per-project branch/worktree on
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
<!-- AQUACRM_SOURCE_END path="CLAUDE.md" -->

---

<a id="source-docs-data-adr-adr-001-semantic-registry-in-code-md"></a>

## Source document — `docs/data/adr/ADR-001-semantic-registry-in-code.md`

<!-- AQUACRM_SOURCE_START path="docs/data/adr/ADR-001-semantic-registry-in-code.md" sha256="f092ef6a564d26df854311e618626bfd2dadb8f2ae5aad085d845360972102da" -->
# ADR-001 — The semantic layer lives in code, enforced by tests

**Status:** accepted, 2026-08-30.

## Context

AquaCRM had selective semantics: excellent doc comments in `types.ts`, module
headers stating boundaries (persons vs people), and prose chapters — but no
single registry, and nothing failed when a new collection, metric or metadata
key shipped without declared ownership, tenancy or sensitivity. Prose-only
semantic layers rot; the repo's own history shows docs drifting from source
("the DDL does not exist" incident, 2026-08-20).

## Decision

The authoritative semantic layer is three pure, client-safe TypeScript
modules — `semanticRegistry.ts`, `metricRegistry.ts`,
`metadataContracts.ts` — each paired with a smoke test that mechanically ties
it to the code it describes: exact set-equality against
`createEmptyPortalState()`, id extraction from the metric-defining source
files, and a source-tree scan for metadata key accesses. Markdown under
`docs/data/` is a generated-quality prose view; where they disagree, the
registry wins.

## Consequences

- A new collection/metric/metadata key cannot ship unclassified — the suite
  fails with instructions naming the one place to add it.
- The registries never restate formulas or types (no second source of
  truth): they add what code cannot carry (definitions, grain, tenancy,
  sensitivity, retention, overlap links) and *point at* the authority.
- Cost: touching those surfaces means one extra registry entry per change.
  Accepted — that is the governance working.
<!-- AQUACRM_SOURCE_END path="docs/data/adr/ADR-001-semantic-registry-in-code.md" -->

---

<a id="source-docs-data-adr-adr-002-domain-modules-are-the-repository-seam-md"></a>

## Source document — `docs/data/adr/ADR-002-domain-modules-are-the-repository-seam.md`

<!-- AQUACRM_SOURCE_START path="docs/data/adr/ADR-002-domain-modules-are-the-repository-seam.md" sha256="361439671762eb20b119d1e94d18b2a0eb3807ea24e66c2f3e6548c9c39e17d3" -->
# ADR-002 — The existing server domain modules ARE the repository seam

**Status:** accepted, 2026-08-30.

## Context

The target architecture requires application code not to depend on storage
layout, so collections can extract from the PortalState blob into tables
without touching routes. One option was a new `repositories/` abstraction
layer wrapping `getState()/mutate()`.

## Decision

No new layer. The existing server domain modules (`server/tenants.ts`,
`persons.ts`, `users.ts`, `accessControl.ts`, …) are declared the repository
seam: they are already the only sanctioned readers/writers of their
collections ("every list/get MUST accept agencyId… there is no global list
helper"), routes already consume their exported functions, and the storage
backends are already abstracted beneath them. A parallel abstraction would
duplicate 40+ modules' surfaces for zero behavioural gain — exactly the
duplication `hazards-and-duplication.md` exists to prevent.

The contract this ADR adds: **a collection may change its storage layout only
behind its module's exported functions.** A module that still leaks raw
PortalState shape across its boundary gets tightened when (not before) its
slice migrates, with repository contract tests run against every supported
backend at that point.

## Consequences

- Extraction phases (MIGRATION-PLAN 1–6) are module-internal changes plus
  backfills; routes and UI stay untouched — the strangler requirement.
- No big-bang refactor risk now; the cost moves into each slice, where the
  parity tests already have to exist.
<!-- AQUACRM_SOURCE_END path="docs/data/adr/ADR-002-domain-modules-are-the-repository-seam.md" -->

---

<a id="source-docs-data-adr-adr-003-one-calculation-path-per-metric-md"></a>

## Source document — `docs/data/adr/ADR-003-one-calculation-path-per-metric.md`

<!-- AQUACRM_SOURCE_START path="docs/data/adr/ADR-003-one-calculation-path-per-metric.md" sha256="9143b1627c97a7081134d9cb312f88fbfaa6fb6ce52ef1b6f69b3744056cf813" -->
# ADR-003 — One calculation path per metric, registry as identity, dedup by parity

**Status:** accepted, 2026-08-30.

## Context

Nine-plus business quantities are computed in 2–4 places; two duplicates have
genuinely different semantics (a hardcoded 5-minute SLA vs the configured
guardrail; forms-vs-conversions numerators); `campaign-roas` collides in the
flat descriptor id space with different rounding on each side. Deleting the
"wrong" copies immediately would change numbers users see and break saved
custom-KPI definitions — the destructive rewrite this project forbids.

## Decision

1. `metricRegistry.ts` assigns every metric one `canonicalId`
   (`<kind>:<id>`) and names one `computedBy` authority; competing
   calculations are linked as `same-quantity` overlaps rather than deleted.
2. The existing collision is pinned (`KNOWN_DESCRIPTOR_ID_COLLISIONS`); any
   NEW bare-id collision fails the suite.
3. Golden boundary tests pin the current canonical behaviour (SLA boundary
   inclusive, 14-day staleness inclusive, decision denominators, even-count
   medians, >100% directional ratios, null-not-Infinity on zero spend).
4. Dedup happens in MIGRATION-PLAN Phase 7, one quantity at a time: golden
   parity first, then consumers move to the canonical path, then the
   duplicate retires. `formulaText` strings must state the real calculation
   (the `business-health` incident-blend omission is the cautionary case,
   fixed with this ADR).

## Consequences

- Dashboards keep today's numbers until a recorded, tested switch — no
  silent changes.
- The registry cannot rot: set equality against the defining source files is
  enforced, so "remove a competing calculation" shows up as a registry diff
  reviewers can see.
<!-- AQUACRM_SOURCE_END path="docs/data/adr/ADR-003-one-calculation-path-per-metric.md" -->

---

<a id="source-docs-data-adr-adr-004-metadata-governed-not-banned-md"></a>

## Source document — `docs/data/adr/ADR-004-metadata-governed-not-banned.md`

<!-- AQUACRM_SOURCE_START path="docs/data/adr/ADR-004-metadata-governed-not-banned.md" sha256="5f24a446b529c0903b723525498c0545c37f73638cdd08ad20eb3b0064bc40b1" -->
# ADR-004 — Metadata bags are governed and shrunk by namespace, not banned

**Status:** accepted, 2026-08-30.

## Context

`Client.metadata` and its siblings carry 124 distinct keys, including whole
subsystems (the telemetry event stream, payment plans, portal provisioning,
invoice facts). Banning the bag outright would force a big-bang typed-schema
rewrite across hundreds of call sites; leaving it ungoverned keeps growing
undefined contracts with no owner, sensitivity class or deletion behaviour.

## Decision

Every key is contracted in `metadataContracts.ts` (carrier, namespace, type,
sensitivity, owner), and `smoke-metadata-contracts.test.ts` scans the source
tree both ways: an uncatalogued key in code fails, and a catalogued key
nothing touches fails (minus an explicit stored-data allowlist). The
**namespace is the migration unit**: telemetry and finance extract first
(MIGRATION-PLAN Phase 5), contact points with the people slice (Phase 2);
`bespoke` keys survive as a small, named, typed-at-read set.

Versioning: the catalogue itself is version-controlled and test-pinned;
per-key `since`/schema-version stamps are added when a namespace's first
migration needs them, not speculatively.

## Consequences

- The escape hatch closes going forward at zero migration cost today.
- The erasure sweep gains a mechanical PII checklist
  (`personalMetadataKeys()`), pinned so reclassification cannot silently
  drop a key from the sweep.
<!-- AQUACRM_SOURCE_END path="docs/data/adr/ADR-004-metadata-governed-not-banned.md" -->

---

<a id="source-docs-data-architecture-md"></a>

## Source document — `docs/data/ARCHITECTURE.md`

<!-- AQUACRM_SOURCE_START path="docs/data/ARCHITECTURE.md" sha256="b670851546a2a7c80258e34bafc8cd94211cb91da291d715c62626cf7457a5f7" -->
# Data architecture — current state and target

*Written 2026-08-30 against the working tree. This document describes what
exists, then the target planes, then the seams that get from one to the other
without a destructive rewrite. The inventory of individual stores is in
[SOURCE-INVENTORY.md](SOURCE-INVENTORY.md); the phased path is in
[MIGRATION-PLAN.md](MIGRATION-PLAN.md); decisions are in [adr/](adr/).*

## 1. Current state (verified)

- **One operational document.** ~90 typed collections in a single
  `PortalState` JSON, cached in-process, persisted whole (file/Postgres) or
  patch-wise (Supabase RPC `apply_app_datastore_patch`), with two sidecar rows
  for the largest collections. Sandbox **realms** are separate rows/files —
  a genuine data boundary selected per request from the signed session cookie.
- **A handful of real tables** beside it: profiles, brand_enquiries,
  consent events, the five inbox tables (schema written, unapplied live),
  nonces, lease/claim tables, storage buckets.
- **Tenant isolation is application-code JS filtering.** Every record carries
  `agencyId` as a JSON field; `server/tenants.ts` enforces the
  "every list/get takes agencyId" discipline; the access kernel
  (`accessControl.ts`) layers capabilities, scopes and environments on top.
  The blob adapters use the service-role key, so **no RLS protects the
  operational plane** — RLS exists and is load-bearing only for `profiles`
  and (partially) `brand_enquiries`.
- **Outbox groundwork exists, but transactionality is mixed.**
  `PortalState.outbox` persists versioned envelopes with correlation and
  causation ids, and the foundation server emit sites have been adopted.
  `recordOutboxEvent()` is atomic when a domain records it inside the domain's
  own `mutate()`; `emitDurable()` currently opens a second mutation, so those
  call sites can still commit state without its event. The drain records only
  that an event was handed to the fire-and-forget in-memory bus; consumer
  promises are not acknowledged or retried, and there is no cross-instance
  table lease.
- **Derived intelligence is strong but identity-fragmented.** The radar
  evidence vault is typed, three-tier retained, honestly absent-vs-empty, and
  golden-tested; but metric identity was split across three schemes and at
  least nine business quantities were computed in 2–4 places
  (SOURCE-INVENTORY §2).
- **124 metadata keys** hide whole subsystems inside `Client.metadata`
  (telemetry stream, payment plans, portal provisioning, invoice facts).

## 2. Target architecture

### 2.1 Operational plane

Postgres/Supabase remains the fast transactional source of truth. The path
away from the single document is **collection-by-collection extraction into
tenant-scoped rows**, in the order the risk register demands (identity and
money before preferences), each extraction behind the same seam:

- **Repository seam = the existing server domain modules.** `tenants.ts`,
  `persons.ts`, `users.ts`, `accessControl.ts` etc. are already the only
  places that touch their collections; application code and routes never
  reach into `PortalState` shape directly for those domains. ADR-002 makes
  this the formal contract: a collection may only change its storage layout
  behind its module's exported functions, so an extraction is invisible to
  routes. (Modules that still leak raw state shape get tightened as their
  slice migrates.)
- File/memory adapters stay for development and tests — the backend interface
  in `storage.ts` already abstracts them, and extractions must keep a
  blob-resident fallback until parity is proven (the sidecar pattern's
  `sidecarPopulated` discipline is the house template for this).
- Every extracted table carries `agency_id` (and `client_id` where client
  scoped) as **real columns with RLS policies**, following the
  `inbox_*` template: deny-by-default grants plus scoped policies, service
  role only where a worker genuinely needs it.

### 2.2 Intelligence plane

Medallion-inspired, claimed only where real:

- **Raw** (exists today, keep): `brand_enquiries` capture rows,
  `inbox_webhook_events` provider payloads (lease-claimed, idempotent by
  `event_key`, retention-pruned), `commandCalendarExternalEvents`. These are
  immutable-in-practice and idempotent. Telemetry beacons that carry their own
  `occurredAt` now receive deterministic content+time ids and replay
  idempotently; beacons without an event time deliberately keep random ids
  because they have no honest identity to collapse. The stream still lives in
  a capped metadata bag and has no batch/connection lineage.
- **Canonical** (exists in part): persons/organisations with identity
  resolution, facets and classification history are genuinely canonical —
  validated, deduplicated, provenance-carrying. Enquiry→person linking and
  client lineage stamps qualify. The semantic registry
  (`src/lib/data/semanticRegistry.ts`) is the machine-readable authority for
  what belongs here.
- **Derived** (exists, now with one identity): KPI/Radar/report models are
  rebuildable projections. The radar evidence vault is the durable substrate;
  `metricRegistry.ts` is the one metric identity; kpiRegistry stays a
  projection that never recomputes.

We do **not** describe these as Bronze/Silver/Gold: only the evidence vault
and the webhook/enquiry rows are durably stored, versioned and rebuildable
today, and the honest names above say exactly which properties hold where.

### 2.3 Canonical semantic layer

`src/lib/data/semanticRegistry.ts` — entities, distinctions, timestamp and
value doctrines, and the enforced classification of every PortalState
collection. `src/lib/data/metricRegistry.ts` — one stable id and one
semantic record per metric, with every known competing calculation linked as
`same-quantity`. `src/lib/data/metadataContracts.ts` — the governed metadata
catalogue. All three are pure, client-safe, and pinned by smoke tests so they
cannot drift from the code they describe. Prose views:
[SEMANTIC-LAYER.md](SEMANTIC-LAYER.md), [DATA-DICTIONARY.md](DATA-DICTIONARY.md).

### 2.4 Security and isolation

- Tenancy stays enforced server-side at the module seam today; each extracted
  table adds database-enforced RLS (2.1). The access kernel's element
  capabilities are the resource/field-level permission vocabulary; pay
  redaction (`redactPeopleEmployeePay`) is the field-level template.
- Gated permission requests: `pending|approved|denied|cancelled` on the
  request, expiry/revocation on the grant — see SEMANTIC-LAYER §approval for
  why that decomposition is correct rather than a missing feature.
- Known hazards stay on the register until closed: legacy fallback widening
  on last-grant revocation (issue #174, Ed's decision pending), unbounded
  agency-owner baseline, freelancer not client-pinned, 403-vs-404 convention
  (#168).
- Audit: activity log + access-kernel audit exist; the 50k cap's silent
  eviction is a recorded risk (MIGRATION-PLAN phase 6 adds overflow to
  durable storage before any compliance claim).

### 2.5 Events and provenance

The **outbox groundwork exists** (2026-08-30, `server/outbox.ts` +
`PortalState.outbox`): `recordOutboxEvent()` can be called inside the same
`mutate()` as the domain change, with stable past-tense names + a
payload version, actor/tenant/source, correlation and causation ids, and
`occurredAt` kept strictly apart from `recordedAt`; the in-memory bus is the
dispatch mechanism. Emit-then-mark recovers the pre-dispatch crash window,
but handler promises are fire-and-forget: `delivered` currently means handed
to the bus, not acknowledged by consumers. Handed-off rows are pruned (14
days / 5,000 cap) and pending rows are never pruned. Foundation server
emit sites persist through the outbox, but several use `emitDurable()` after
their domain mutation; those are durable emissions, not yet a transactional
domain+event commit. Plugin port adapters also remain plain. Phase 3 therefore
continues call-site-by-call-site until every required event records inside the
owning transaction and a table-backed cross-process claim plus per-consumer
acknowledgement, retry/backoff and dead-letter state exists. Imports stay idempotent by provider ids
(`event_key`, `external_message_id`, `submissionId`) and gain checksums where
payloads lack ids. We do not claim event sourcing: state is not rebuildable
from events and the docs must never say otherwise.

## 3. What changed on 2026-08-30 (this phase)

- Semantic registry + coverage enforcement (new, tested).
- Canonical metric registry + collision pinning + golden boundary tests
  (new, tested).
- Metadata contracts + source-scan enforcement (new, tested).
- `business-health` formula text corrected to the real blend.
- This documentation suite.

Everything else in §2 is target, not claim. LOOP-PROGRESS.md tracks the
phase queue; genuinely open business definitions live in
`../development/ED-QUESTIONS.md`.
<!-- AQUACRM_SOURCE_END path="docs/data/ARCHITECTURE.md" -->

---

<a id="source-docs-data-data-dictionary-md"></a>

## Source document — `docs/data/DATA-DICTIONARY.md`

<!-- AQUACRM_SOURCE_START path="docs/data/DATA-DICTIONARY.md" sha256="23b25d96792aeb13d3040cdb2d6711686edf858297cb123060d98379c7805ad7" -->
# Data dictionary — authoritative fields of the core entities

*Field-level companion to [SEMANTIC-LAYER.md](SEMANTIC-LAYER.md). Types are
quoted from `src/server/types.ts` (the compile-time authority); this file adds
the semantics a type cannot carry. Collections not detailed here are
classified in `PORTAL_STATE_COVERAGE` and typed in types.ts; the 124 metadata
keys are individually contracted in `src/lib/data/metadataContracts.ts` and
not repeated here.*

Conventions: timestamps are epoch ms UTC. `agencyId` on a record is the
enforceable tenant boundary (JS-enforced today, column+RLS as slices
extract). "SoT" = source of truth.

## Agency (tenant) — `state.agencies`

| Field | Type | Semantics |
|---|---|---|
| `id` | string | Stable tenant id. SoT for tenancy joins. |
| `slug` | string | Unique, display/routing. |
| `status` | `active\|paused\|archived` | Lifecycle; no deletion flow exists. |
| `holdingAgencyId` + `companyId` | string? | Set **together or not at all**: marks this tenant as the portal backing one trading company; must stay two-way with `TradingCompany.portalAgencyId` or the third tier evaporates. |
| `createdAt`/`updatedAt` | number | ingestion/bookkeeping. |

## Client (workspace) — `state.clients`

| Field | Type | Semantics |
|---|---|---|
| `id`, `agencyId` | string | id SoT; agencyId the boundary — every read path filters on it (`tenants.ts` discipline). |
| `relationshipId` | string? | Groups several isolated workspaces of one buyer. |
| `personId` | string? | The canonical human. Clients sharing `relationshipId` share `personId`. |
| `companyId` | string? | Owning trading company. |
| `stage` | `ClientStage` | Kept as a string union for agency-customised phases; the six `aqua-*` stages are the canonical progression. **Not** a delivery stage — per-product service stages live on assignments. |
| `status` | `active\|paused\|archived` | Lifecycle distinct from stage. |
| `metadata` | `Record<string,unknown>` | Governed escape hatch — every key contracted in `metadataContracts.ts`; new keys fail the suite. Finance/telemetry/inbox namespaces are extraction targets. |
| `ownerEmail` | string? | PII; part of identity-resolution evidence. |

## ServerUser — `state.users` (keyed by lower-cased email)

| Field | Semantics |
|---|---|
| `agencyIds: string[]` | The real membership list (multi-agency, R025). |
| `agencyId` | Legacy mirror of `agencyIds[0]` — kept for 56+ call sites; never write it independently. |
| `clientId` | Required binding for `client-*`, `freelancer`, `end-customer` roles. |
| `passwordHash` | scrypt `scrypt$N$r$p$salt$derived` — credential class; never leaves the server. |
| `sessionRev` / `accessRev` | Revocation counters — bumping invalidates live sessions / cached access. SoT for "is this session still valid". |
| `role` | One of the 8-value union; cross-checked against the session on every read (`resolveFreshSessionUser`). |

## Person — `state.persons`

| Field | Semantics |
|---|---|
| `emails[]` / `phones[]` | Each keeps normalised `value` + original `raw` + `label` + `isPrimary`; `PersonPhone.shared` marks switchboards that must never identify a person without a compatible name. |
| `classification` (+ `classificationHistory[]`) | 9-valued, hand-set, append-only history `{from,to,at,by,note,sourceType,sourceId}`. |
| `facets` | `{leadId?, contactId?, clientIds?, enquiryIds?}` — retained through reclassification, never deleted ("changing what somebody IS must never destroy what they DID"). |
| `state` | **Derived** by `derivePersonState` — never hand-set. |
| `organisationLinks[]` | `suggested\|confirmed\|rejected`; rejected links retained so a dismissed guess doesn't resurface. |

## AccessGrant — `state.accessGrants`

| Field | Semantics |
|---|---|
| `userId`, `scope`, `environment` | The binding: scope kinds `agency\|workspace\|client\|project` (parent ids legal only on workspace), environments `live\|sandbox` — revoke independently. |
| `capabilities` (+ `templateId`) | Additive; templates merge only when same-agency, un-archived, and the template permits the scope kind + environment. Delegation requires the granter to hold everything granted. |
| `allowedPaths` | Repo-relative; may only **narrow** (intersected with the project's own). |
| `expiresAt` / `revokedAt`+`revokedBy`+`revokeReason` | Grant lifecycle; revocation bumps `accessRev` and is audited. Revoked grants retained forever. |
| `requestId` | Provenance link to the approving request. |

## Enquiry — `brand_enquiries` (Supabase, raw plane)

| Column | Semantics |
|---|---|
| `id` uuid | SoT id. |
| `name`,`email?`,`phone?`,`message?` | The canonical capture vocabulary (`CORE_KEYS`); client-database submissions map ONTO these with per-field provenance `configured\|detected\|absent` (`clientFormMapping.ts`), unrecognised answers kept in `additional[]`. |
| `consent` bool | Enforced in the anon INSERT policy's WITH CHECK, not only app code. |
| `agency_id` | The tenant column — migration written 2026-08-20, applied by hand; until applied, `metadata->>'agencyId'` is the fallback and inserts retry without the column on PGRST204. |
| `created_at` | Ingestion time. Event time, where the source row carries one, maps to `core.submittedAt` and is deliberately kept distinct. |
| `metadata` jsonb | Routing + provenance keys — all contracted (routing/identity/consent namespaces). |

## Inbox family — `inbox_*` (Supabase; the properly-scoped template)

All five tables carry a real `agency_id` column; grants deny anon and
authenticated outright (service-role only). `inbox_messages.sent_at` =
occurred; `created_at` = recorded; `external_message_id` dedupes provider
redelivery (multipart ids included); `inbox_webhook_events.event_key` is the
import idempotency key, claimed via lease RPC, pruned past retention.
`encrypted_access_token` is AES-256-GCM via `PORTAL_VAULT_ENCRYPTION_KEY` —
credential class, never in derived data.

## ActivityEntry — `state.activity` (audit trail)

`{id, ts (occurred), agencyId, clientId?, actorUserId?, actorEmail?,
category (30-value union), action (past-tense verb, e.g. "client.created"),
message, metadata?}` — idempotent by key (sha256 → id), secret-shaped
metadata keys redacted before write, **hard cap 50,000 with silent
oldest-first eviction** (recorded risk).

## Radar evidence — `state.radarEvidence`

Series keyed `${domain}:${familyId}`; per series: typed points (5-minute
buckets, 14-day raw retention), hourly rollups (60d), daily (365d), rolling
baseline (undefined under 3 points — never fabricated), `expectedDirection`,
first/last seen. The metric registry records each KPI's `radarFamilyId` join.

## Metric descriptor (derived, not stored) — `KpiDescriptor`

22 fields projected verbatim from built snapshots; `series` caps at 24
points. Identity and semantics come from `CanonicalMetricEntry`
(`metricRegistry.ts`): `canonicalId` = `<kind>:<id>` is the stable join key;
`computedBy` names the one calculation authority; `overlaps` link every known
competing calculation. Bare-id collisions are pinned to exactly
`["campaign-roas"]`. Durable KPI references never depend on that bare id:
strict writes use `canonicalId`, reject the ambiguous spelling and lazily
migrate historical rows command-first.
<!-- AQUACRM_SOURCE_END path="docs/data/DATA-DICTIONARY.md" -->

---

<a id="source-docs-data-lineage-md"></a>

## Source document — `docs/data/LINEAGE.md`

<!-- AQUACRM_SOURCE_START path="docs/data/LINEAGE.md" sha256="427fd35d964ae09c0c3b07f7bb87417cec131fa723f1eb02202357cab9ed7fc1" -->
# Lineage — how a number on a screen traces back to a record

*Companion to [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md). Machine-readable
joins live in `src/lib/data/metricRegistry.ts` (`computedBy`,
`radarFamilyId`, `overlaps`) and `src/lib/data/semanticRegistry.ts`
(provenance per entity).*

## 1. The three metric identity schemes and their join

| Scheme | Example | Lives in |
|---|---|---|
| KPI / descriptor id | `lead-conversion` | `commandIntelligenceService.ts` makeKpi / `commercialIntelligence.ts` makeFormula |
| Radar rule family id | `lead-conversion-rate` | `radarRuleCatalog.ts` (172 families × 12 lenses) |
| Evidence series id | `sales:lead-conversion-rate` | `radarEvidence` vault (`${domain}:${familyId}`) |

The join is declared per metric as `radarFamilyId` in the canonical registry
(previously hand-passed as makeKpi's `familyId` argument with nothing
checking it). Evidence sampling only records checks with
`scope==="kpi" && lens==="threshold" && numeric value` — that filter is why
some KPIs have rich histories and others plot a single honest point.

## 2. Worked traces

**Radar → canonical records.** A Radar check (e.g. `sales/lead-conversion-rate`
threshold) reads the commercial lifecycle snapshot ← built from `pipelineCards`
+ `Lead` records + `clients` (all agency-filtered PortalState collections) ←
cards/leads created from `brand_enquiries` rows via capture + identity
resolution (which stamps `identityResolution` — confidence, reasons,
explanation — onto the enquiry's metadata) ← raw form POST, consent-gated at
the RLS policy. Every hop is inspectable: the check carries `evidence[]` and
`sourceIds`, the Radar's source-dataset inspection lists the records, and the
review trail lives in `identityResolutionReviews`.

**KPI Explorer point → storage.** Descriptor `series` ← `CommandKpi.history`
← evidence vault points (`radarEvidence`, retained 14d/60d/365d by tier) ←
sweep writes ← the same snapshot builders. The descriptor never recomputes
(pinned by `smoke-kpi-registry.test.ts`).

**Traffic KPI → beacon (hardened 2026-08-30).** `traffic-7d` ←
`clientTelemetryService` ← `Client.metadata.telemetryEvents` ← Aqua Tag POST
`/api/telemetry/collect` (rate-limited, consent-gated). Beacons carrying
their own `occurredAt` now get a **deterministic content+time id**, so a
replayed request records nothing twice (event, activity row, milestone sync
all idempotent) and replays don't consume the rate limit; beacons with no
event time keep random ids — no honest identity to dedupe on. The same work
fixed a silent pre-existing defect: the ±1e9 numeric clamp had been
flattening every real epoch-ms `occurredAt`, replacing event time with
ingestion time across all telemetry. Remaining weak half (Phase 5): the
store is still the metadata bag with a 500-event cap and no
`connectionId` back-reference.

**Inbox message → provider (the strong edge).** Inbox row ←
`append_inbox_provider_message` RPC ← webhook event claimed by lease
(`claim_inbox_webhook_events`, idempotent by `event_key`, retention-pruned)
← provider POST. Duplicate delivery cannot double-write
(`external_message_id` ownership checks include multipart ids).

## 3. Provenance strength by area (honest grades)

| Area | Grade | Evidence |
|---|---|---|
| Inbox messaging | **Strong** | provider ids as idempotency facts, lease-claimed events, atomic RPCs, race reconciliation |
| Enquiry capture | **Good** | per-field mapping provenance (`configured\|detected\|absent`), `purposeSource` (declared/chosen/guessed), submissionId + ingestionState, identity-resolution stamps |
| Identity resolution | **Good** | frozen resolution + reasons + confidence per review; append-only classification history on Person |
| Access kernel | **Good** | every mutation audited with actor + ids; grants keep request back-reference |
| Connections | **Adequate** | connection-level status/test/actor stamps — but **no record-level back-reference** from data an integration wrote to the connection that wrote it |
| Telemetry | **Mixed** | deterministic content+time ids and replay dedupe when `occurredAt` is supplied; honest random fallback without event time; no batch identity or connection back-reference |
| Imports generally | **Absent** | no import-batch records, no content checksums anywhere in `portal/src` |
| Audit trail | **Capped** | idempotent + redacted, but 50k hard cap evicts silently |

## 4. Deliberate non-lineage (by design, keep)

Client-website submissions: Aqua stores only `{clientId, table, rowId,
timestamp}` and never copies the client's row — a data-controller boundary
(`types.ts:4375-4392`). The `rowId` may dangle after the client deletes the
row; surfaces must render that honestly rather than caching a copy.

## 5. Secrets never enter lineage

Credential-class fields (scrypt hashes, `encrypted_access_token`, external
assistant keys, vault-encrypted secrets) are excluded from derived datasets
and redacted from activity metadata by pattern
(`redactActivityValue`). Any new derived model must consult the sensitivity
class in the semantic registry / metadata contracts before copying a field.
<!-- AQUACRM_SOURCE_END path="docs/data/LINEAGE.md" -->

---

<a id="source-docs-data-migration-plan-md"></a>

## Source document — `docs/data/MIGRATION-PLAN.md`

<!-- AQUACRM_SOURCE_START path="docs/data/MIGRATION-PLAN.md" sha256="867a7712f43a167a001a24349adbdc2c6b9bec1de3ac492d4b3a04174922c9ef" -->
# Migration plan — strangler, one coherent vertical slice at a time

*Rules that bind every phase below: the PortalState/blob system is not
deleted; existing APIs and UI behaviour are preserved; each phase is
independently deployable and reversible; backfills are idempotent with
dry-run, checkpoints, counts, reconciliation and rollback instructions;
legacy fields are not removed until parity and rollback have been
demonstrated; reads switch only after legacy-vs-canonical comparison. The
current house template is the owned-sidecar protocol in `storage.ts`,
`storageSupabase.ts` and migration `20260902092000`: one receipt-deduplicated
transaction locks the main row and requested sidecars, seeds legacy/missing
sidecars from the locked main value, applies all patches, marks authoritative
sidecars, clears their main copies and returns one coherent snapshot. The
authoritative marker distinguishes a confirmed empty sidecar from a legacy or
absent copy.*

## Phase 0 — semantic groundwork ✅ (2026-08-30, this branch)

Semantic registry + enforced PortalState coverage; canonical metric registry
+ collision pinning + golden boundary tests; metadata contracts + source-scan
enforcement; `business-health` formula text corrected; this doc suite.
Reversible: pure additions + one prose string.

## Phase 1 — tenancy / identity / roles (first extraction slice)

**Goal:** `agencies`, `tradingCompanies`, `users`, `accessGrants`,
`accessRoleTemplates`, `accessRequests` become tenant-scoped rows with RLS,
behind their existing modules.

1. Create tables (real columns incl. `agency_id`; users keep scrypt hashes;
   grants/requests keyed as today) with `inbox_*`-style deny-by-default
   grants + policies. Apply `20260820150000` (enquiry agency column) and the
   inbox migration first — they are written, unapplied, and blocking
   (needs Ed: `supabase db push`, see ED-QUESTIONS).
2. Dual-presence, not dual-write: module writes go to the blob as today AND
   enqueue an outbox record (Phase 3's mechanism, or a synchronous copy in
   the same `mutate` while the outbox lands); a backfill job copies
   collection → table with dry-run, per-collection checkpoints, row counts
   and a reconciliation diff (id-set + field-hash comparison).
3. Reads stay on the blob until the comparison report shows N days of zero
   drift; then module reads flip behind a flag, blob copy retained.
4. Rollback: flip the flag back; the blob never stopped being written.

**Verification:** repository contract tests run the module API against
memory + file + Postgres backends; tenant-isolation tests assert cross-agency
reads return nothing at the SQL layer (new RLS tests), not only through the
module; existing suites (`smoke-release-access-matrix`,
`smoke-session-revocation`) must stay green untouched.

## Phase 2 — people and organisations

`persons`, `organisations`, `identityResolutionReviews` extract with the same
mechanics. Identity-resolution and person-dedupe suites
(`smoke-identity-resolution`, `smoke-person-identity-dedupe`) are the parity
oracle: run against blob-backed and table-backed reads, diff by test name.
Contact points normalise out of `Client.metadata.linkedContacts` (contact
namespace) here — the metadata catalogue is the checklist.

## Phase 3 — transactional outbox + event envelope

**Groundwork SHIPPED 2026-08-30** (`server/outbox.ts`, `PortalState.outbox`,
`smoke-outbox.test.ts`): `recordOutboxEvent` appends inside the caller's own
`mutate()` (atomic with the domain change), `drainOutbox` hands pending rows
to the existing bus emit-then-mark, `emitDurable` is the drop-in for detached emit sites, handed-off rows prune
after 14 days / 5,000-row cap with pending never pruned. Envelope carries
name + version, actor, tenant, source, correlationId (defaults to the event
id), causationId, and occurredAt strictly apart from recordedAt. First
adopted call site: `tenants.createClient` → `client.created` (payload
unchanged; pinned by source-scan). Company promotion classifies the
collection as `leave` (events are the origin tenant's history).

**Foundation emission adoption is complete, transaction adoption is not
(corrected 2026-09-02):** every `emit()` under `src/server/**` now announces
through the outbox —
agency.created, client.updated/stage_changed (tenants + productWorkspaces),
user.signed_up, action.completed, person.created/updated/classified,
organisation.created/updated — plus the plugin lifecycle events
(built-ins/runtime + ensureLeadsPipelineInstall). `smoke-outbox.test.ts`
pins the manifest: plain `emit(` under `src/server` is confined to the bus
and its drain. A coordinated PortalState transaction queues one keyed, awaited
post-commit handoff per row: the durable row stays `pending` through the
commit-to-dispatch crash window, is marked only after the bus handoff actually
starts, and a synchronous handoff failure records its attempt/error while
remaining pending for retry. Direct, non-transactional drains retain their
synchronous trigger; if the process dies before their delivery mark persists,
the pending row may be replayed rather than silently lost. The dedicated
outbox/atomic/lease regression gate passes **17/17**, including a file-backed
pause at the exact durable-commit/post-commit boundary.

**Coordinated PortalState atomicity and lease fencing SHIPPED 2026-09-02:**
`withPortalStateTransaction` now runs domain work against an
`AsyncLocalStorage`-scoped working tree. Nested coordinated calls share that
tree; unawaited nested calls that start while the scope is active are drained
before commit, and a nested rejection rolls the outer unit back. File, memory
and remote re-entrant lock scopes likewise drain work that began while they
were active, then mark the inherited scope inactive before releasing. A timer
or other async resource that resumes after closure therefore starts a fresh
transaction instead of writing into a dead working tree.

The durable publish boundary is isolated too. While a backend flush is in
flight, unrelated readers continue to see the committed view; ordinary writes
are evaluated against that view and replayed onto the tentative tree. A short
per-realm commit lane serialises only publish/flush phases, so two logical
Supabase lanes cannot use each other's tentative cache or rollback snapshot.
The state diff is rebased after any awaited lease confirmation, and a failed
flush rolls back only its transaction while preserving writes that arrived
during the attempt. Post-commit effects start only after the state write is
durable.

Remote Postgres/Supabase workspace leases now have separate acquire, renew and
release semantics. Heartbeats and near-expiry commit checks call
`renew_product_workspace_lease`, which succeeds only for the same holder while
its existing lease is still unexpired. It cannot reacquire an expired row; this
fences the ABA case where another holder acquired, changed state and released
between a delayed heartbeat and its arrival. Expiry, ownership loss, refused
renewal, or inability to confirm a near-expiry lease raises a typed lease-lost
failure at the commit boundary before the durable state patch. The same fence
is checked again before each queued post-commit effect. Release is
holder-checked and is skipped locally once ownership is known lost or expired.

Supabase first-writer patches now use row-locked `merge_object` for a newly
populated top-level collection. `aqua_jsonb_deep_merge` recursively preserves
disjoint object children from concurrent stale snapshots while arrays and
scalars retain replacement semantics. Existing `set`, `delete` and
`append_unique` operations remain supported unchanged. Durable operation
receipts make a same-id replay return without reapplying over a successor; the
owned-sidecar RPC extends that receipt boundary across the main row and every
requested sidecar in one PostgreSQL transaction. Its companion load RPC reads
main plus sidecars in one statement/snapshot. The adapter rejects malformed
authoritative envelopes rather than silently falling back to legacy main data.

**Database deployment precondition:** apply these migrations in timestamp
order before enabling the database-backed coordinated path:

1. `20260809090000_atomic_datastore_patches_and_history.sql` — base row-locked
   patch RPC;
2. `20260825130000_product_workspace_leases.sql` — lease table plus acquire and
   holder-checked release;
3. `20260902090000_merge_app_datastore_patch_objects.sql` — recursive
   `merge_object` support plus bounded durable patch receipts;
4. `20260902091000_product_workspace_lease_renewal_fencing.sql` — renew-only,
   unexpired-holder fencing; and
5. `20260902092000_owned_sidecar_compare_and_swap.sql` — receipt-deduplicated,
   transactional main-plus-owned-sidecar patching plus one-statement coherent
   snapshot loading, including authoritative-empty and malformed-envelope
   semantics.

The TypeScript, mocked provider/failure-injection and SQL source-contract tests
are green. All three 2026-09-02 migrations are source/mocked verified only; no
evidence that any was applied and exercised against live PostgreSQL was
available in this checkout. Idempotent replay, malformed envelopes, concurrent
successors, same-value ABA, late/unknown outcomes and new/absent/authoritative-
empty row cases are therefore local evidence, not production-database
acceptance. Verify migration status and rerun those concurrency cases against
the deployed database before declaring this gate complete.

This does **not** make `emitDurable()` atomic with a domain change: it opens its
own `mutate()` after that change. Each correctness-critical call site must move
`recordOutboxEvent()` into the owning mutation; failure-injection proof must show
there is no commit point between state and event.
Deliberately still plain: the plugin PORT adapters
(built-ins/runtime/foundation-adapters) and module-internal emits — the one
seam a later phase flips to make every plugin event durable at once.

**Correlation scope SHIPPED (2026-08-30, third pass):** `runWithCorrelation`
(AsyncLocalStorage) groups every event recorded inside one operation under
one correlationId — explicit values still win, defaults return outside the
scope — and `updateClient`'s updated/stage_changed pair now shares a
correlation with the stage move naming the update as its cause. Both pinned
in `smoke-outbox.test.ts`.

Remaining in this phase: make foundation domain+event writes genuinely atomic;
flip that port-adapter seam (with volume review); wrap the other multi-record
operations (lead conversion, company promotion) in `runWithCorrelation` as each
is touched; add a cross-process claim (lease) when the outbox extracts to a
table; and add stable consumer identities with durable acknowledgement,
retry/backoff, poison-event dead-lettering and replay tooling. Until then,
`delivered` is only a legacy label for a successfully started in-process bus
dispatch: a rejected asynchronous handler promise or crash after that handoff
is not retried. The in-blob version still has no cross-process claim,
per-consumer acknowledgement or poison-event lifecycle.

- **No event-sourcing claim**: state is not rebuildable from events; the
  outbox supports reliability and lineage, nothing more.

## Phase 4 — journey (enquiries → pipelines → conversion)

Apply the enquiry agency-column migration outcome; move
`enquiryContactDetails`, `pipelines`, `pipelineCards`. Conversion lineage
stamps (`leadId`, `promotedFromLeadId` — crm-lineage namespace) become real
columns. `smoke-enquiry-tenant-isolation`, `smoke-enquiry-dedupe`,
`smoke-lead-identity-conflict` are the parity oracles.

## Phase 5 — telemetry out of the metadata bag + import provenance

**First half SHIPPED 2026-08-30 — deterministic beacon identity + idempotent
ingest** (`clientTelemetryService.ts`, `smoke-telemetry-idempotency.test.ts`):
where a beacon carries its own `occurredAt` (the Aqua Tag stamps
`Date.now()` once per event client-side), the event id is
`evt_<sha256(siteKey + cleaned content + RAW occurredAt)>` — a replayed
request maps to the same id, is answered with the event already recorded,
and consumes neither the rate limit nor a second activity row nor a
milestone sync; a beacon with no event time keeps a random id (no honest
identity — possibly-distinct events are never suppressed, recorded not
hidden). The suite also surfaced and fixed a REAL pre-existing bug: epoch-ms
timestamps went through `cleanNumber`'s ±1e9 clamp, so every genuine
`occurredAt` was flattened and event time silently became server ingestion
time for every beacon — `cleanTimestamp` now validates a plausible epoch
range instead, so occurred ≠ recorded is finally true for telemetry.

**Remaining in this phase:** the events still live in
`Client.metadata.telemetryEvents` (500-event cap — an evicted event can
re-enter if replayed much later, accepted and documented); the append-only
table extraction with `connectionId`/site provenance follows the Phase 1
mechanics, with golden KPI parity for a captured fixture week before the
read switch. Finance facts (`clientPaymentPlans`, invoice keys — finance
namespace) extract next with the same care; money before convenience.

## Phase 6 — communications & audit durability

Inbox is already table-backed (apply the migration live — blocked on Ed);
this phase adds activity-log overflow to durable storage before the 50k cap
evicts, and record-level provenance back-references (`connectionId`) on
integration-written records.

## Phase 7 — derived intelligence dedup

With the registry as the map (`sameQuantityPairs()`):

1. `response-sla` reads the configured guardrail (remove the hardcoded 5m).
2. Fold the four lead-conversion implementations onto
   `commercialLifecycle`'s; agency-marketing's 0–1 ratio adapts at its
   render site.
3. Share one conversion-event predicate (today triplicated verbatim).
4. ✅ Durable-reference half shipped 2026-09-01: targets, shared views, custom
   operands and planning state use canonical ids; ambiguous new bare writes are
   rejected and legacy rows migrate deterministically command-first. The two
   calculations and their legacy presentation `id` still remain to be folded.
5. Each step: golden tests first (Phase 0 shipped the boundary pins), parity
   diff, then the switch.

## Backfill template (all phases)

`npx tsx scripts/backfill-<slice>.ts --dry-run` → prints per-collection
counts, id-set diff, field-hash mismatches, writes a checkpoint file; without
`--dry-run` it copies in id-ordered batches, resumable from the checkpoint,
re-runnable (upsert by id — idempotent), and finishes with a reconciliation
report. Rollback per phase = flip the read flag; blob writes never stopped.
**Never fake data to make a comparison pass; a mismatch is a finding.**

## Standing constraints

- `DATABASE_URL` / applied migrations need Ed's environment (ED-QUESTIONS).
- The in-blob outbox still has no cross-process dispatch claim, durable
  per-consumer acknowledgement, retry/backoff or poison-event dead-letter
  lifecycle. Lease-fenced PortalState commits do not close those consumer-side
  delivery gaps.
- Sandbox realms multiply every extraction: tables carry `realm_id` (default
  `live`) or extractions exclude realm-scoped rows until designed — decide
  per slice, recorded in its ADR.
- Do not build against the empty first-cut tables (`clients`,
  `client_portals`, `client_portal_members`, `audit_events`) without a
  decision to adopt or drop them.
<!-- AQUACRM_SOURCE_END path="docs/data/MIGRATION-PLAN.md" -->

---

<a id="source-docs-data-semantic-layer-md"></a>

## Source document — `docs/data/SEMANTIC-LAYER.md`

<!-- AQUACRM_SOURCE_START path="docs/data/SEMANTIC-LAYER.md" sha256="cea3578c4a186a6919731501eb9f907f8b3d2b723620ac01d3c24e35db309bc1" -->
# The canonical semantic layer

*The machine-readable authority is `src/lib/data/semanticRegistry.ts`,
enforced by `scripts/smoke-semantic-registry.test.ts` (every PortalState
collection classified, exactly; relationships resolvable; retention stated
wherever personal data is classified). This document is the prose view — if
it disagrees with the registry, the registry wins and this file has a bug.*

## 1. Entity map

Thirty-three entities cover the concepts the product operates on. Grouped:

- **Tenancy & identity** — `tenant` (Agency), `tradingCompany`, `workspace`
  (five senses, mostly not a persisted entity), `userAccount`, `staffMember`,
  `role`, `permission`, `resourceEntitlement` (grant/template),
  `approvalRequest`.
- **CRM** — `person`, `organisation`, `prospect`, `client`, `endCustomer`,
  `contactPoint`.
- **Journey** — `enquiry`, `journey` (pipeline), `opportunity` (card),
  `lifecycleStage`.
- **Communication** — `conversation`, `communication` (message),
  `inboxItem` (derived), `action`.
- **Delivery** — `project`, `fulfilmentItem`, `task`.
- **Commerce** — `product`, `financialEvent`.
- **Platform** — `provider`, `integrationEvent`, `auditEvent`, `evidenceItem`.

Each entry in the registry carries: canonical definition, id rule, tenancy
scope + tenant fields, source of truth, plane, provenance, timestamp
semantics, sensitivity, retention, lifecycle states/transitions, confidence
notes, relationships.

## 2. The distinctions that keep the vocabulary honest

Machine-readable as `SEMANTIC_DISTINCTIONS`; the load-bearing ones:

| Not the same thing | The rule |
|---|---|
| **Person vs client** | A Person is a human; a Client is a *workspace*. `Client.personId` names the human; one buyer relationship (`relationshipId`) may own several isolated client workspaces sharing one person. |
| **Organisation vs workspace** | Organisation = the customer's real-world company. Workspace = Aqua-side structure. `TradingCompany` = the agency's *own* business — a third thing that never "becomes an agency". |
| **User account vs staff member** | A login (`users.ts`, keyed by email) vs an employment record (`people.ts`). Linked via `PeopleEmployee.userId`, deliberately separate storage. The CRM `Person` is a third record again. |
| **Role vs permission vs entitlement** | Role: which surfaces a session may enter (8-value union, ceiling only narrows). Permission: one capability string (`element.<key>.<view\|use\|manage>`, manage⇒use⇒view). Entitlement: an `AccessGrant` binding capabilities to one user + scope + environment, optionally templated, path-narrowed, expiring. |
| **Project vs fulfilment** | Project = technical artefact (repo, preview, editor). Fulfilment = the operating model delivering a sold service (phases, briefs, deliverables). Neither implies the other. |
| **Enquiry vs prospect** | One inbound ask (raw row) vs a pursued relationship on a journey. Many enquiries per prospect via identity resolution. |

## 3. Timestamp doctrine (`TIMESTAMP_DOCTRINE`)

`occurred` (event time — sent_at, issuedAt) ≠ `created` (ingestion time) ≠
`updated` (bookkeeping) ≠ `effective` (targets, grant windows) ≠ `measured`
(readings). A client-form row's own timestamp maps to `core.submittedAt`
precisely because it is the client's clock, not Aqua's
(`clientFormMapping.ts` keeps them apart by construction).

## 4. Value doctrine (`VALUE_DOCTRINE`)

- **missing** = null/undefined, renders "—"; a missing date must never render
  as today (regression #169).
- **zero** = a real measured 0, only valid when the instrument was live —
  `CommandDemandFlow.pageviews` is `number | null` so a fake zero is
  *unrepresentable*.
- **false** = an explicit negative answer.
- **unknown** = instrumented but unanswerable now — Radar `blind`, surfaced
  as a blind spot, never a pass.
- **not-applicable** = the dimension doesn't exist — modelled by field
  absence (radar memory: "absent means not retained; `[]` means genuinely
  none").

## 5. Approval-request lifecycle — why five states are four-plus-two

The brief asks for pending/approved/denied/expired/revoked. As built, and as
the registry records: the **request** is
`pending → approved | denied | cancelled`, while **expiry and revocation are
grant lifecycle** (`expiresAt` passive, `revokedAt` audited + `accessRev`
bump). This decomposition is deliberate — a request that was approved stays
approved as a historical fact even after its grant expires — and both records
are retained in all terminal states. Approval must *narrow* the request
(capabilities and expiry), self-approval is rejected, and every transition is
audited.

## 6. Metric semantics

`src/lib/data/metricRegistry.ts` gives every metric one stable
`canonicalId` (`<kind>:<id>`), one definition, grain, dimensions, window,
timezone, direction, freshness, confidence, owner — and names `computedBy`,
the single authoritative calculation site, instead of restating the formula
(restating it would recreate the second-source-of-truth problem). Known
competing calculations are linked as `same-quantity` overlaps;
`smoke-metric-registry.test.ts` pins the registry to the defining source
files, pins the one existing bare-id collision, enforces canonical durable
references (including deterministic legacy migration), and golden-tests the
boundary semantics of the dedup-hazard metrics. Target/baseline authority stays with
the layered `KpiTargetsConfig` (agency → company, with effective-from
history) — the registry does not duplicate targets.

## 7. Metadata namespaces

`src/lib/data/metadataContracts.ts` catalogues all 124 keys across the
client/enquiry/activity/auth-user bags into 16 namespaces (contact,
crm-lineage, identity, routing, journey, portal-provisioning, portal-config,
product, finance, telemetry, inbox, consent, delivery, files, bespoke,
system), each with owner, type and sensitivity.
`smoke-metadata-contracts.test.ts` scans the source tree: an uncatalogued key
fails the suite, and dead entries fail it too. A namespace is the unit a
strangler migration moves (MIGRATION-PLAN §phases).
<!-- AQUACRM_SOURCE_END path="docs/data/SEMANTIC-LAYER.md" -->

---

<a id="source-docs-data-source-inventory-md"></a>

## Source document — `docs/data/SOURCE-INVENTORY.md`

<!-- AQUACRM_SOURCE_START path="docs/data/SOURCE-INVENTORY.md" sha256="11b027a56a18a1e79975f1a5201c41955405468d8d8b04974c7fb0f0a0c7c268" -->
# Source inventory — every store, its authority, and its consumers

*Compiled 2026-08-30 from a full survey of the working tree (storage adapters,
migrations, server modules) — not from memory or older docs. Where a claim
matters it names the file. Companion documents: [ARCHITECTURE.md](ARCHITECTURE.md),
[SEMANTIC-LAYER.md](SEMANTIC-LAYER.md), [LINEAGE.md](LINEAGE.md).*

## 0. The shape of the estate

There are **two unrelated databases plus a filesystem tier**, and one giant
JSON document that dwarfs everything else:

1. **Supabase project** (`dghzbsxbdatskserctgt`; migrations in
   `../../../supabase/migrations/`, 22 SQL files as counted 2026-09-01). Holds the normalised tables
   (profiles, enquiries, consent, the five inbox tables) **and** the
   PortalState blob in `app_datastores`.
2. **Optional plain Postgres** (`PORTAL_BACKEND=postgres` + `DATABASE_URL`;
   DDL in `scripts/schema.sql`). Holds the PortalState blob in `portal_kv`,
   the lease/claim tables, and `nonces`. A *different database* from Supabase.
3. **Local `.data/`** (gitignored) — dev state file, inbox fallback, uploads,
   dev-team ledgers.

**PortalState** (`src/server/types.ts:4490+`) is ~90 top-level collections in
one JSON document — measured live 2026-08-29 at **3.25 MB**, of which actual
client business data was 181 KB (5.4%). Two collections are split into
sidecar rows on Supabase (`devTeamWorkspaceFiles` 29%, `clientPortalTemplates`
18.5% of the document).

## 1. Store-by-store inventory

Authority legend: **SoT** = source of truth for its concept. Freshness:
how current a read is. Sensitivity: PII / credential / internal / none.

### 1a. The PortalState blob (operational plane, ~90 collections)

| Property | Value |
|---|---|
| Owner | `src/server/storage.ts` (cache, hydration, debounced flush, realm map) |
| Backends | file (`.data/portal-state.json`) · memory · Postgres `portal_kv` row `__portal_state__` · Supabase `app_datastores` row `aquacrm-portal-state` (+ `:realm:<id>` suffix per sandbox realm) |
| Authority | **SoT for every collection listed in `PORTAL_STATE_COVERAGE`** (`src/lib/data/semanticRegistry.ts`) — tenants, clients, users, access kernel, persons/organisations, pipelines, phases, tasks, products, radar evidence, and the rest |
| Tenancy | `agencyId` **as a JSON field only** — enforced by JS filtering (`server/tenants.ts` withTenantScope discipline), NOT by the database. The Supabase adapter uses the service-role key, so RLS on `app_datastores` is bypassed for the main data path |
| Freshness | in-process cache, sync reads; 250 ms debounced flush; `ensureHydrated({fresh:true})` re-reads remote |
| Sensitivity | mixed — PII (persons, clients, enquiryContactDetails), **credentials** (`users` scrypt hashes, `externalAssistantApiKeys`), commercial (finance metadata) |
| Consumers | every server domain module; all portal routes |
| History | `app_datastore_history` snapshots last 100 versions per key (service-role-only) |

Per-collection classification (entity, plane, note) is **machine-readable and
test-enforced** in `src/lib/data/semanticRegistry.ts` (`PORTAL_STATE_COVERAGE`,
pinned by `scripts/smoke-semantic-registry.test.ts`).

### 1b. Normalised tables (Supabase)

| Table | Authority | Tenancy | Sensitivity | Consumers | Notes |
|---|---|---|---|---|---|
| `profiles` | SoT for Supabase-auth → app-role bridge | `agency_id` column exists but is **null for everyone today** | PII | login route, client-portal auth | the only table the app reads with the anon key — the one place RLS is load-bearing |
| `brand_enquiries` | **SoT for raw website enquiries** | `agency_id` column — migration `20260820150000` **written but applied by hand**; fallback `metadata->>'agencyId'`; insert paths retry without the column on PGRST204 | PII + consent | website-enquiry routes, inbox, erasure | anon may INSERT only, consent-gated in the policy's WITH CHECK |
| `website_consent_events` | SoT for consent audit | site/brand keyed | consent evidence | write-only from the app | no read path in repo |
| `inbox_channel_connections` / `_contact_identities` / `_conversations` / `_messages` / `_webhook_events` | SoT for Master Inbox messaging | **`agency_id` real column on all five — the only properly scoped store family** | PII + **encrypted OAuth tokens** (AES-256-GCM vault) | `inboxStore.ts`, operational alerts, erasure | ⚠ tables verified **absent from the live project** 2026-08-20 — migration on disk, never applied; production `useSupabase()` path would 404 |
| `app_datastores` / `app_datastore_history` | carrier for 1a | none | everything | storage adapter only | service-role only |
| `brands`, `shoots`, `shoot_photos` | website content | brand keyed | none | sibling websites + client-portal | deliberately anon-readable |
| `clients`, `client_portals`, `client_portal_members`, `audit_events` | **no portal consumer — empty** | FK-scoped | — | none | superseded first-cut model or unfinished; do not build against without deciding which |

### 1c. Postgres-direct auxiliaries (`DATABASE_URL` database)

| Table | Authority | Notes |
|---|---|---|
| `portal_kv` | blob carrier (1a) | `scripts/schema.sql`; RLS explicitly deferred ("R8") |
| `nonces` | SoT for single-use auth tokens (magic-link, email-verify, password-reset, csrf) | **DDL lives in TypeScript** (`nonceStore.ts:89-96`, lazy CREATE TABLE); no tenant column; a Supabase-only deployment silently gets the **memory** adapter — single-use guarantees do not survive across serverless instances there |
| `editor_ai_reply_claims`, `lead_conversion_operations`, `product_workspace_leases` | cross-process mutexes / idempotency receipts | mirrored as RPCs on the Supabase side |

### 1d. Blob/object stores

| Store | Authority | Tenancy | Notes |
|---|---|---|---|
| Supabase Storage, 8 buckets | SoT for uploads (private `aquacrm-uploads`, public `aquacrm-public`, 6 brand buckets) | **path-prefix per user** (`auth.uid()`), not per agency | private bytes proxied by the app; no signed URLs |
| Vercel Blob | private-upload middle tier | none in store — route guards only | ~12 API routes |
| `.data/*-uploads/`, `.data/inbox-media/<agencyId>/`, `.data/inbox-call-recordings/<agencyId>/` | dev fallback | path-embedded at best | CVs and call audio are PII |
| Git working trees (`client-projects/`, `aqua-editor/<projectId>` worktrees) | SoT for project source | directory per client/project | outside any DB |

### 1e. Derived read models (rebuildable)

| Model | Built by | Persisted? | Consumers |
|---|---|---|---|
| Business Radar snapshot (`BusinessIssueRadar`) | `engines/data/server/radar/businessIssueRadar.ts` | cache only; **evidence** persists (below) | Command Centre, Advisor, Business Radar |
| Personal My Radar projection (`PersonalRadarReading`) | `lib/server/intelligence/myRadar.ts` + `lib/server/intelligence/personalRadarActions.ts` | no — rebuilt from the signed-in user's plans, sessions, permitted calendar goals and permitted Actions; recurring sales quota progress is derived live from source records | My Radar page and topbar quick-look |
| Radar evidence vault | `radarEvidenceVault.ts` | **yes** — `radarEvidence` (raw 14d / hourly 60d / daily 365d), `radarMemory` (180 scans), `radarSyntheticProbes` | evidence descriptors, KPI histories, anomaly checks |
| Command intelligence snapshot (20 KPIs + scoped readings) | `lib/server/commandIntelligenceService.ts` | no — rebuilt per request; history hydrated from evidence vault | Command Centre, KPI Explorer |
| Commercial intelligence (40 formulas, stages, sources, lineage, quality) | `lib/intelligence/commercialIntelligence.ts` | no | Journey, Command, Radar |
| KPI descriptor registry | `lib/performance/kpiRegistry.ts` (projection only — **it never recomputes**) | no | KPI Explorer, marketing pulse |
| Client record ledger | `clientRecordLedger.ts` | yes (projection collection) | client record surfaces |
| Master-inbox item list | inbox service assembly | no | inbox surfaces |

**Canonical metric identity now lives in `src/lib/data/metricRegistry.ts`**
(test-enforced against the two defining source files). See
[LINEAGE.md](LINEAGE.md) for the identity-scheme joins.

## 2. Duplicate and conflicting definitions (verified in source)

1. **`campaign-roas` — presentation-id collision, durable-reference safety
   repaired 2026-09-01.** A command KPI and commercial formula retain the same
   legacy `id`, and the two still round/clamp differently. Durable targets,
   custom operands and saved views now key on `canonicalId`; new ambiguous bare
   writes are rejected with both explicit choices, and stored legacy data maps
   deterministically to `command:campaign-roas` (the old picker's behaviour).
   `KNOWN_DESCRIPTOR_ID_COLLISIONS` still pins the legacy presentation collision
   so it cannot multiply while calculation dedup remains open.
2. **Lead conversion — four implementations** (`commercialLifecycle`,
   `commercialIntelligence`, agency-marketing reports — which returns a 0–1
   *ratio* where the others return 0–100 — and the marketingIntelligence
   funnel variant).
3. **Response compliance — two SLA thresholds.** `speed-to-lead` uses the
   *configured* guardrail; `response-sla` hardcodes 5 minutes. An agency with
   a 30-minute SLA sees two disagreeing percentages.
4. **Portfolio retention** computed twice (`retention` vs `portfolio-retention`).
5. **New leads 30d** computed twice (`recent-leads` vs `new-leads-30d`).
6. **Source coverage** computed twice (`source-attribution` vs `source-coverage`).
7. **Website conversion** — four sites, three denominators; the conversion
   *event predicate* is triplicated verbatim (radarTelemetry,
   commandIntelligenceService.scopedConversion, performanceAnalytics).
8. **Revenue gap** recomputed verbatim in three files.
9. **Business health** — the registered formula text described only the
   company index and omitted the 30% incident blend (**fixed 2026-08-30** in
   `measurementFor`).
10. **Three metric identity schemes** — KPI id (`lead-conversion`), radar
    family id (`lead-conversion-rate`), evidence series id
    (`sales:lead-conversion-rate`) — joined by hand via `makeKpi`'s `familyId`
    argument. The metric registry now records the join per metric.

Every same-quantity pair is machine-readable via `sameQuantityPairs()` in
`metricRegistry.ts` and pinned by `smoke-metric-registry.test.ts`.

## 3. Low-confidence sources and missing lineage

- **`Client.metadata.telemetryEvents`** — the raw Aqua Tag event stream, the
  sole source for `traffic-7d`, `forms-7d`, `website-conversion` and ROAS
  denominators, lives in an untyped bag read via a bare cast. **Ingest is
  now idempotent (2026-08-30)** for beacons carrying their own event time
  (deterministic content+time ids; replays record nothing twice and skip the
  rate limit); the remaining weakness is the store itself — the metadata
  bag, its 500-event cap, and no connection back-reference (Phase 5's
  second half).
- **`activity` hard cap 50,000 with silent oldest-first eviction** — the audit
  trail can shed history without any surface saying so.
- **No record-level provenance**: nothing written by an integration carries a
  back-reference to the `IntegrationConnection.id` that produced it. No
  content checksums or import-batch records exist anywhere.
- **`nonces` on Supabase-only deployments degrade to memory** (see 1c).
- **`profiles.agency_id` is null for everyone** — the agency-aware RLS ratchet
  on `brand_enquiries` therefore currently degrades to "any internal user
  manages every agency's rows" (documented in `ownedEnquiry.ts:5-29`).
- **Radar evidence can be 24h stale** under the daily probe cron with no
  surface saying so (issue #170, Ed's decision — recorded, not hidden).
- **`rls_auto_enable()`** exists in the live Supabase project and in no
  migration — dashboard drift that will not survive a rebuild.

## 4. Which source is authoritative, per business concept

| Concept | Authoritative source | Everything else |
|---|---|---|
| Tenant / company / client / person / organisation / user / grant | PortalState collection named in `PORTAL_STATE_COVERAGE` | UI caches, derived rows |
| Raw website enquiry | `brand_enquiries` row | `enquiryContactDetails` augments; inbox projections derive |
| Conversation / message | `inbox_*` tables (Supabase) or `.data/inbox-messaging.json` in dev | inbox item list derives |
| Consent | `website_consent_events` (+ consent fields on the enquiry row) | — |
| Single-use auth tokens | `nonces` (Postgres) | — |
| Uploaded file bytes | Supabase Storage → Vercel Blob → `.data/` (precedence) | metadata.files entries reference |
| Metric identity & semantics | `src/lib/data/metricRegistry.ts` | descriptors carry computed values |
| Metric **values** | the `computedBy` site named per metric | any other computation of the same number is scheduled for dedup |
| Metric history | radar evidence vault (`radarEvidence`) | descriptor `series` caps at 24 points |
| Semantic definitions | `src/lib/data/semanticRegistry.ts` (+ this doc suite) | scattered doc comments remain valid but non-authoritative |
| Metadata key meaning | `src/lib/data/metadataContracts.ts` | — |
<!-- AQUACRM_SOURCE_END path="docs/data/SOURCE-INVENTORY.md" -->

---

<a id="source-docs-development-handoff-md"></a>

## Source document — `docs/DEVELOPMENT-HANDOFF.md`

<!-- AQUACRM_SOURCE_START path="docs/DEVELOPMENT-HANDOFF.md" sha256="9199166a1f30132bbc3c5bf13f7ee9434e04f5e4726ad3b7499bc801418fe9b5" -->
# AquaCRM Development Handoff

> **Despite the name, this is the ENVIRONMENT RUNBOOK — repo, ports, commands,
> persistence, backends.** It is live, it is named as required reading by
> `CLAUDE.md`, and it is *not* a session handoff. The dated session handoffs
> (`SESSION-HANDOFF-2026-08-18/19`) were a different thing wearing a similar
> name; they were archived 2026-08-21 to the
> [history shelf](context/archive/README.md).
>
> **Refreshed 2026-08-24 for current runtime facts.** Commands below are checked
> against `package.json`. A later same-day review reopened session revocation,
> showcase and erasure safety; use the checklist as the current gate.

Last updated: 24 August 2026

## Repository And Runtime

- GitHub: `https://github.com/edstorm987/aquacrm`
- App directory: `portal/` inside the repository
- Local app directory on Ed's machine:
  `/Users/eds/Desktop/Projects/Web Development/Personal EcoSystem/aquaCRM/portal`
- Framework: Next.js App Router with React and TypeScript
- Local port: `3032`
- Vercel Root Directory: `portal`
- Default branch: `main`

Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3032`.

For an isolated verification server with its own state file, build directory and
port, use `npm run sandbox:fork`. The normal port-3032 file-backed sandbox is
`npm run dev:sandbox:real`.

> **File-backend reliability warning (source-reviewed 2026-08-24):** the current
> mutation path can acknowledge a detached failed write, rewrites the full state
> blob non-atomically, and treats malformed JSON as an empty writable workspace.
> Do not use the file backend as evidence of durable persistence until issues
> #16–#17 in [development/issues.md](development/issues.md) are closed.

## Required Reading

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/PRODUCT-ARCHITECTURE.md`
4. `docs/CURRENT-IMPLEMENTATION.md`
5. Relevant files in `node_modules/next/dist/docs/` before using Next.js APIs

## Persistence

The aggregate state and backend selection live in `src/server/storage.ts`.
Production must use a durable backend.

Local development does **not** default to the file backend. `pickBackend()`
promotes to Supabase whenever `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set and `PORTAL_BACKEND` is unset — which is
the normal state of `.env.local`. So a plain `npm run dev` reads and writes the
**live Supabase database**. There is no local sandbox by default.

To develop against a disposable copy instead:

```bash
npm run dev:sandbox
```

That pins `PORTAL_BACKEND=file`, so all reads and writes go to
`.data/portal-state.json` (gitignored) and production is untouched. Seed it
with a snapshot of live data when you need realistic records. Use
`npm run dev` only when you intend to work against production data.

Supported backend kinds in the current storage layer are:

- `file`: local development persistence;
- `memory`: ephemeral tests/development only;
- `postgres`: durable database backend;
- `supabase`: durable Supabase storage backend;
- `kv`: reserved but not wired.

Production readiness rejects file or memory persistence. Supabase is selected
when its complete configuration is present, unless another backend is
explicitly selected. Postgres is selected when `DATABASE_URL` is present.

Do not introduce module-level Maps or arrays as production persistence. Use
the aggregate state, a domain server module, or an existing durable specialist
store such as Inbox, private uploads, Radar evidence, or website enquiries.

## Main Code Map

```text
src/app/                 Next.js pages, layouts, and API routes
src/app/portal/          Authenticated workspace routes
src/app/api/             Server mutation and integration boundaries
src/components/          Shared UI and chrome
src/built-ins/           Installable domain modules
src/lib/                 Reusable domain calculations and client helpers
src/lib/server/          Server-only integrations, evidence, auth, and adapters
src/server/              Persisted aggregate models and domain repositories
src/server/types.ts      Canonical persisted type catalogue
scripts/                 Smoke, contract, migration, and audit tests
docs/                    Architecture and integration handoff
```

Useful entrypoints:

- agency home: `src/app/portal/agency/page.tsx`
- client workspace: `src/app/portal/clients/[clientId]/page.tsx`
- client tabs: `src/lib/clients/clientWorkspace.ts`
- Master Inbox: `src/app/portal/agency/inbox/_MasterInbox.tsx`
- Actions: `src/app/portal/agency/actions/_ActionsWorkspace.tsx`
- Journey: `src/app/portal/agency/pipelines/[slug]/`
- Fulfilment: `src/app/portal/agency/fulfilment/`
- product models: `src/server/agencyProducts.ts` and
  `src/server/productWorkspaces.ts`
- operational alerts: `src/lib/server/inbox/operationalAlerts.ts`
- Radar: `src/engines/data/server/radar/businessIssueRadar.ts`, `src/engines/data/radar/radarPolicyEngine.ts`,
  and `src/engines/data/radar/radarCheckEngine.ts`
- permissions: `src/lib/server/auth/requireAgencyScope.ts` and
  `src/lib/server/RequirePermission.tsx`

## API And Mutation Pattern

For a normal feature:

1. Define or extend the canonical type in `src/server/types.ts`.
2. Add domain operations in `src/server/` or the correct built-in module.
3. Add a scoped API route in `src/app/api/`.
4. Enforce session, agency, role, and client scope server-side.
5. Use the API from a client component and refresh authoritative data.
6. Emit or refresh operational attention when the mutation changes risk.
7. Add a focused smoke test in `scripts/`.

Never rely on hiding a button as authorisation. UI permissions improve the
experience; server permissions protect the data.

## Making An Action Resolvable

Every operational alert already carries resolution context — `listOperationalAlerts`
stamps `?resolve=<alertId>&focus=<what>` onto every href centrally, so a new
alert type gets it for free. The announcement bar is mounted in the agency
layout and appears on any page opened from a Resolve click.

To make a screen point at the control that needs acting on, add one attribute
to the relevant section:

```tsx
<section data-resolution-focus="payment">
```

`ResolutionSpotlight` (mounted in the layout) finds it, applies the amber ring
and the "Needs your action" marker, and scrolls it into view. No props, no
component changes, no focus state. Valid values are `ResolutionFocus` in
`src/lib/inbox/resolutionContext.ts`.

A page with no annotated target is fine: the bar still names the task, there is
simply no ring. Never invent a target — a ring pointing at the wrong control is
worse than none.

### Multi-step resolutions

When a job spans several places, add a plan in
`src/lib/server/resolutionPlans.ts`. Steps are **derived from live records on
every request**, never stored — a stored checklist drifts out of sync with the
business and then lies about it.

Every step must have an observable completion condition. If you cannot derive
whether a step is done, do not add the step: it will never tick and will strand
the operator on a checklist that cannot complete.

## Route And Navigation Rules

- Preserve query-addressable workspace lenses, for example
  `/portal/clients/<id>?tab=finance`.
- Keep compatibility aliases when replacing a route that existing alerts,
  bookmarks, or portals may still reference.
- Notifications and search results must link to the narrowest actionable
  destination.
- If focus protection or a collapsed section can hide a deep-linked record,
  promote/open only the requested record.
- Client-scoped work should stay inside the client workspace unless the user
  explicitly asks for the portfolio view.
- Use `src/lib/clients/clientWorkspace.ts` for client tab IDs and URL creation.

## UI Rules Already Established

- Operational interfaces are dense, calm, and scan-friendly.
- Cards represent real records or tools, not decorative page sections.
- Use Lucide icons through the existing icon system.
- Icon-only controls require accessible names and tooltips where unfamiliar.
- Buttons and labels must fit at phone, tablet, and desktop widths.
- Tablet can use a manually collapsible sidebar; it should not be forced into
  the phone-only navigation model.
- Dark mode must preserve contrast and status visibility.
- Command Centre deliberately uses its own dark experience.
- Customer/internal client workspaces use their own differentiated theme and
  must not expose an Aqua attribution label that weakens bespoke branding.
- Loading transitions respect Performance Mode.
- Notification dots, counts, hover explanations, read/park/dismiss state, and
  exact resolution paths should remain consistent across sidebar, tabs, and
  workspaces.

## Validation

Run focused checks while iterating:

```bash
npm run typecheck
NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/<relevant-test>.test.ts
git diff --check
```

Run the broad suite before a significant release:

```bash
npm run smoke:all
npm run build
```

Useful targeted scripts include:

```bash
npm run smoke:notifications
npm run smoke:advisor
npm run smoke:external-assistant-api
npm run smoke:google-calendar
npm run smoke:integrations
npm run smoke:meta-inbox
npm run smoke:people-workspace
npm run smoke:production-readiness
```

The repository contains many source-contract smoke tests. They are intentional:
they protect connected workflows that are difficult to cover through one UI
test. Update a contract test when the behaviour deliberately changes; do not
weaken it only to make a failure disappear.

## Local And Git Safety

- Inspect `git status -sb` and the diff before editing or staging.
- Work with existing local changes. Do not reset or revert them.
- Use `apply_patch` for manual edits.
- Do not commit, push, deploy, change branches, or rewrite history unless Ed
  explicitly asks.
- When Ed says "git everything", confirm the remote is
  `edstorm987/aquacrm`, commit the complete intended AquaCRM worktree, push
  `main`, then compare local and remote commit hashes.
- Do not commit `.env.local`, tokens, credentials, generated build output, or
  personal data.

## Vercel And Production

Vercel must build from the repository's `portal` root directory. Required
environment variables and safety notes are listed in `.env.example`.

Before calling a deployment healthy, verify:

- `/healthz` returns HTTP 200;
- `/healthz/full` returns HTTP 200 and `readyForProduction: true`;
- Settings -> Launch reports database, storage, email, and security ready;
- the deployed commit matches the intended `main` commit;
- login is the real authenticated flow, not Showcase Mode;
- production is not using file or memory persistence.

Showcase Mode is intended to be read-only fictional data, but that contract is
not currently complete: mutating `GET`/OAuth callbacks bypass the proxy's
non-GET block and every visit resets one shared fixture. Do not expose it as a
security boundary or client authentication path until issues #21/#23 are closed.

## Integration Documents

- External assistants: `docs/external-assistant-api.md`
- Meta/Instagram messaging: `docs/meta-master-inbox.md`
- Development cleanup: `docs/development-workspace-cleanup.md`
- Brand architecture: `docs/zimante-brand-architecture.md`

## End-Of-Task Checklist

1. Re-read the user's latest request.
2. Confirm the change belongs to the correct domain.
3. Check client/agency scope and customer visibility.
4. Check empty, loading, error, permission, and responsive states.
5. Run TypeScript and focused tests.
6. Use the local app to verify the primary interaction.
7. Report what changed, what was verified, and whether work remains local or
   has been published.
<!-- AQUACRM_SOURCE_END path="docs/DEVELOPMENT-HANDOFF.md" -->

---

<a id="source-docs-development-workspace-cleanup-md"></a>

## Source document — `docs/development-workspace-cleanup.md`

<!-- AQUACRM_SOURCE_START path="docs/development-workspace-cleanup.md" sha256="bdb46a5cecd3764199eca4941bce509da7c7f38f2b4fb1c02eb9c25c3e3e6fcc" -->
# Development Workspace Cleanup

> **Kept live on purpose (reviewed 2026-08-21).** This reads like history — it is
> dated 6 August 2026, verified 27 July, describes the *outer* workspace rather
> than `portal/`, and its command line is stale. It stays because its
> **"Catalogued In Development"** section below is the only human documentation of
> the six roots that `scanWorkspace` still walks
> (`src/app/api/portal/development/route.ts`), behind the live npm script
> `catalogue:development` (`package.json`). Filing this under history would bury
> the spec for shipped code.
>
> ⚠ **Corrections to the text below, flagged not overwritten:** the invocation is
> **`npm run catalogue:development`** — this repo is npm-managed and `pnpm` will
> corrupt the shared `node_modules`; and the port it names (3030) is not the
> portal's (`3032`, see [DEVELOPMENT-HANDOFF.md](DEVELOPMENT-HANDOFF.md)). The
> 27 July verification figures are a dated record and are left exactly as written.

This inventory separates material that is now catalogued in the Development workspace from generated files and historical working material. Source folders still require the review gate below; generated output already proven inactive can be removed safely.

## Verified Catalogue

Verified on 27 July 2026:

- 298 Development resources are stored.
- 298 resources point to existing local paths; no broken path was found.
- 39 Git templates, 1 SEO tool, 3 deployment templates, 236 knowledge records and 19 saved design references are catalogued.
- Re-running `pnpm run catalogue:development` imports 0 duplicates and skips the same 298 records.
- All build-stage attachments use workflow-qualified references; no legacy stage-only references remain.
- Authenticated create, search, update, credential reveal and delete checks completed with no temporary records left behind.

## Keep In Place

- `04-milesymedia-portal/milesymedia-portal/portal`: the live Milesymedia application.
- `04-milesymedia-portal/milesymedia-portal/github-templates`: reusable modules and starters. Development now indexes these as Git templates rather than copying them into portal data.
- `04-milesymedia-portal/milesymedia-portal/client-projects`: managed customer source projects.
- `04-milesymedia-portal/milesymedia-portal/development-assets`: canonical saved inspiration and future Development source assets.
- `scripts/templates`: reusable deployment templates.

## Catalogued In Development

- `github-templates/modules/*`: reusable modules, components and product capabilities.
- `github-templates/starters/*`: complete project starting points.
- `01 development/context/prior research/*.md`: searchable knowledge records that retain their source path.
- top-level `01 development/*.md`: planning and operating notes.
- `scripts/templates/*`: launch-stage templates.
- `development-assets/inspiration/**/*`: authenticated visual inspiration cards with image previews.

The catalogue stores references and metadata, not duplicate file contents. This keeps the application fast and preserves Git as the source of truth for code.

## Review Then Archive

- `01 development/messages`, `01 development/terminal-prompts`, `01 development/old files` and `_obsolete`: completed. These were moved to the verified historical archive below and removed from the active workspace.
- `04-milesymedia-portal/demo portals`: review for unique visual or interaction references; save valuable examples as inspiration resources before archiving.
- `04-milesymedia-portal/plugins`: completed. All 39 legacy plugin folders were compared against `github-templates/modules`. Thirty-seven were source-identical; the two differences were reviewed and the canonical Git-template versions were newer. The legacy copies were removed, leaving the `.gitkeep` placeholder only.

## Safe Generated Cleanup

- `.next` directories are generated build output and can be deleted when the related dev server is stopped.
- On 27 July 2026, inactive `.next` output was removed from the old standalone website and three client preview projects, reclaiming approximately 1.2 GB. The active portal `.next` directory was retained for localhost `3030`.
- `.DS_Store` files are Finder metadata and have been removed outside dependency folders.
- Duplicate legacy plugin source was removed after hash comparison; `github-templates/modules` is now the single reusable-module source of truth.
- duplicate `node_modules` directories can be regenerated from lockfiles. Remove only while no local server or build is running, then reinstall in the one active app.

Inactive dependency installs were removed only after confirming a lockfile existed and no related process was running:

- three client preview `node_modules` folders: approximately 1.2 GB combined;
- old standalone website `node_modules`: approximately 377 MB;
- nested leads-pipeline `node_modules`: approximately 356 MB.

The one active root `node_modules` install remains.

## Historical Archive

- Path: `/Users/eds/Desktop/Projects/Milesymedia-archives/2026-07-27/milesymedia-historical-workspace-2026-07-27.tar.gz`
- Contents: 3,454 archived paths.
- Integrity: `gzip -t` passed.
- SHA-256: `331c60e7ce45cc2518399aa843ae97ed60c85190bc1edaf13c1e6c6486bf5f57`.

The active workspace reduced from approximately 4.5 GB to 937 MB. The unified portal is running from a fresh generated cache at `http://localhost:3030`.

## Do Not Store In Plain Files

- Passwords, recovery codes, API secrets and private tokens belong in the encrypted Development Knowledge Vault or an external password manager.
- The portal requires `PORTAL_VAULT_ENCRYPTION_KEY` in production before it will save new passwords.

## Cleanup Gate

Before deleting a source folder:

1. Open Development > Toolkit and Development > Knowledge Vault.
2. Confirm the folder's useful items are present and searchable.
3. Open representative source paths to confirm they still resolve.
4. Save unique images or design references as uploaded inspiration resources.
5. Archive or delete only after the useful count and catalogue count agree.
<!-- AQUACRM_SOURCE_END path="docs/development-workspace-cleanup.md" -->

---

<a id="source-docs-development-md"></a>

## Source document — `docs/development.md`

<!-- AQUACRM_SOURCE_START path="docs/development.md" sha256="9f2c4da449cb26283cce46a90ec030e72ec4942cf623422488fabd960f293227" -->
# development.md — the law

**This is the master catalogue and build map for AquaCRM. Use it to find the
owning document, and update that document after every change.** The current
answer to “where do we stand?” is [development/TODO.md](development/TODO.md);
source remains authoritative when prose and implementation disagree.
Whether you're an AI or a human, on day one or day one thousand: start here and
you have the whole project. Nothing is lost because everything is written down
and linked from this one place.

> **2026-08-24 documentation scope correction:** the first reconciliation was
> non-security-only. A later read-only review added a live-proven P0 session-
> revocation failure and source-proven P1 showcase/erasure findings. The current
> checklist and issues register supersede the earlier deferral.

> **The rule, in one line:** before you work, read down from here to what you
> need. After you work, walk back up and update what changed — then log it in
> [updates.md](development/updates.md). If the docs don't reflect it, the work
> isn't finished.

> **Running development across multiple chats?** The orchestration layer —
> commander + worker chats, the live state, how to spin a worker — is its own
> book: **[docs/context/](context/README.md)**. `development.md` is *what* to
> build; `context/` is *how we run the chats*.

---

## How this is organised (the library)

Think of it as a library. This page is the **catalogue**. It lists the **books**.
Each book has its own **chapters**, and chapters have **pages**. You never read
the whole library — you walk down to exactly what you need.

> **2026-08-26 consolidation:** the founder-facing Dev Docs/Library now exposes
> exactly **20 canonical Markdown volumes**: nine authored subject volumes at
> `docs/00-START-HERE.md` through `docs/08-HISTORY-AND-ARCHIVE.md`, plus the
> eleven generated documents under `docs/reference/`. The nine authored volumes
> contain **all 126 non-reference Markdown sources / 435,282 words**, verbatim,
> with original path and SHA-256 provenance. Runtime-backed plan, finding,
> roadmap, checklist and update fragments remain at their compatibility paths
> for now so consolidation cannot break Dev Team behaviour; they are hidden
> from the Library index, not discarded. Regenerate and verify with
> `node scripts/consolidate-authored-docs.mjs` and
> `scripts/smoke-authored-doc-consolidation.test.ts`.

```
development.md  ← the catalogue (you are here) — the law, tying it all together
│
├── BOOKS (the top-level docs)
│   ├── goals.md ......... why we're building this and what "done" is
│   ├── roadmap.md ....... the roadmap — what's next, in order
│   ├── TODO.md ......... ★ THE ONE TASK LIST — "where do we stand", the only one
│   ├── checklist.md ..... RETIRED 2026-08-31 → merged into TODO.md (kept for history)
│   ├── todo-retired.md .. RETIRED 2026-08-31 → merged into TODO.md (kept for history)
│   ├── issues.md ........ known issues, verified findings, risks
│   ├── status.md ........ does it actually WORK / can it be USED (≠ "is it coded")
│   ├── notes.md ......... decisions & context (the "why")
│   ├── tests.md ......... how to test + what's covered
│   ├── updates.md ....... ★ THE LOG — every change, newest first (append-only)
│   ├── audits.md ........ the independent auditor's verdicts (what's *verified*)
│   ├── plans/ ........... one phased plan per substantial item (archive/ for shipped)
│   └── WORKSPACE-FILE-TREE.md  ← the map of the code (its own book of books)
│       │
│       ├── CHAPTERS (docs/workspace/) — what each area/subsystem does
│       │   ├── state-layer · shared-logic · portal-ui · api-and-routes
│       │   ├── plugins · components · scripts-config-docs
│       │   ├── feature-index · hazards-and-duplication
│       │   └── DOSSIERS: radar · advisor · kpi-intelligence · aqua-tag · database
│       │
│       └── PAGES (docs/reference/) — the exhaustive, generated detail
│           ├── server/lib/app/built-ins/components/scripts .md  (every function)
│           ├── api-reference (every endpoint)  ← in workspace/
│           └── radar-rules.md  (every one of the 2,064 Radar rules)
│
└── HISTORY (docs/context/archive/) — dated records, kept, never current
    └── superseded summaries · session records · worker debriefs
```

Chapters explain the *mechanism*; pages enumerate *everything*. Look a specific
function or rule up in the pages; understand how it works in the chapters.

### One question, one file

Docs rot when two files claim the same job. These four claims are exclusive — if
you find a second file answering one of them, it is stale and belongs on the
[history shelf](context/archive/README.md).

| Question | The one file | Not anywhere else |
|---|---|---|
| **What changed, and when?** | **[updates.md](development/updates.md)** | It is the log. Append a dated entry after every meaningful change; **never edit an existing entry** — that is the point of a changelog, and the file says so in its own banner. It is also parsed by the Dev Console, so a second log would be invisible as well as redundant. |
| **Where do we stand?** | **[TODO.md](development/TODO.md)** | Five files have answered this over time. `TODO.md` is the only one now — `checklist.md` and `todo-retired.md` were merged into it on 2026-08-31 after they drifted into disagreeing about which issues were done. `scripts/smoke-one-task-list.test.ts` fails if a second list appears. |
| **What systems exist?** | **[CURRENT-IMPLEMENTATION.md](CURRENT-IMPLEMENTATION.md)** | An inventory, not a status report. Status lives in TODO.md. |
| **How do I run it locally?** | **[DEVELOPMENT-HANDOFF.md](DEVELOPMENT-HANDOFF.md)** | Despite the name it is the environment runbook, **not** a session handoff. Session handoffs are dated and archived. |

Everything dated — old summaries, session records, worker debriefs — lives on the
[history shelf](context/archive/README.md) and is never current.

---

## The books

| Book | What it's for |
|---|---|
| **[goals.md](development/goals.md)** | Why AquaCRM exists, who Ed is, the operating model, current strategic goals, and the principles that shape how we build. Read first to understand *what* we're doing. |
| **[roadmap.md](development/roadmap.md)** | **The roadmap — the outer view.** Every outcome that is coming, its horizon (Now / Next / Later / Someday / Shipped), its target date, and the plans that deliver it. Progress is COMPUTED from those plans' phases, never typed. Written and edited from the Dev Console (`/portal/dev-team/roadmap`); this supersedes phases.md. |
| **[TODO.md](development/TODO.md)** | **The one task list.** Blocked-on-Ed first, then P0/P1/P2, each row pointing at its `issues.md` entry for the detail. If you read one thing before working, read this. |
| **[architecture-noobie.md](architecture-noobie.md)** | The whole system explained in **plain English**, no jargon. Start here if you're new (human or agent) and the catalogue below is too dense. |
| **[development/plans/fulfilment-template-system.md](development/plans/fulfilment-template-system.md)** | **The template system** — portal/product templates edited once and seeded into every client instance, owned by Fulfilment (Ed's direction, 2026-08-27). Most of the spine already exists; the new idea is a cross-tenant *origin* template. |
| **[development/plans/dev-editor-finish.md](development/plans/dev-editor-finish.md)** | **Current Dev Editor plan.** The 22 Aug session handoff is preserved on the [history shelf](context/archive/dev-editor-handoff-2026-08-22.md), but it is no longer a current brief. |
| **[context/archive/](context/archive/README.md)** | 🗄 **The history shelf.** Dated records — superseded summaries, session handoffs, worker debriefs — kept because they are the only place some facts survive, and **never current**. `phases.md` (the old roadmap) lives here now. Nothing on this shelf should brief a worker. |
| **[plans/](development/plans/)** | One **phased plan per substantial item** (e.g. [radar-upgrade.md](development/plans/radar-upgrade.md), [mfa-login.md](development/plans/mfa-login.md)). Each plan's own `**Status:**` line is the authority on that item. Shipped plans may be moved to [plans/archive/](development/plans/archive/). |
| **[audits.md](development/audits.md)** | The **independent auditor's verdicts** — the record of what has been *verified*, not just claimed. A 🔴 finding gets a loud banner at the top of that file. Read before trusting a "complete" claim. |
| ~~checklist.md~~ · ~~todo-retired.md~~ | **Retired 2026-08-31** into `TODO.md`. Kept for their written reasoning, which `TODO.md` deliberately does not duplicate. Do not add to them. |
| **[issues.md](development/issues.md)** | Known issues, **verified security/compliance findings** (DB RLS not in repo, Aqua Tag consent, …), duplication, and the live-data hazard. Check before assuming you found a new bug. |
| **[status.md](development/status.md)** | The honest **"does it actually work / can it be used?"** register — kept separate from "is it coded" and "do tests pass". **A passing test ≠ working ≠ usable.** Read before trusting a green suite. |
| **[notes.md](development/notes.md)** | Durable decisions and non-obvious context — the "why", so nothing is re-litigated or re-tripped-over. |
| **[tests.md](development/tests.md)** | The canonical full-suite command, the test convention, the gotchas, and where coverage lives. **Run the full suite before calling a change done.** |
| **[updates.md](development/updates.md)** | The running changelog — every meaningful change, newest first. **This is the memory. Add to it after every change.** |
| **[compliance/erasure-dpo-pack.md](compliance/erasure-dpo-pack.md)** | The **DPO / solicitor review pack** for right-to-erasure: what the system actually does when a client is erased, per data category, what is proven by test vs. unverified, the limits of that evidence, and the **8 decisions we need a DPO to rule on**. Hand this to a reviewer; update it whenever erasure behaviour changes. |
| **[WORKSPACE-FILE-TREE.md](WORKSPACE-FILE-TREE.md)** | The map of the code: every file and what it does, its chapters (`docs/workspace/`) and its generated reference pages (`docs/reference/`). This is where "where does X live?" is answered. |
| **[PRODUCT-ARCHITECTURE.md](PRODUCT-ARCHITECTURE.md)** | The **product** shape — engines, modules, workspaces, surfaces and how they compose. `CLAUDE.md` names this required reading. |
| **[DEVELOPMENT-HANDOFF.md](DEVELOPMENT-HANDOFF.md)** | The **environment runbook** — repo layout, ports, persistence, backends. How to run it, not what changed. |
| **[portal-tiers-and-fractal-fulfilment.md](portal-tiers-and-fractal-fulfilment.md)** | The portal tier model and the fractal-fulfilment idea — why a client portal and an agency portal are the same shape at different scales. |
| **[meta-master-inbox.md](meta-master-inbox.md)** | The master-inbox concept — one place every inbound signal lands, across channels. |
| **[zimante-brand-architecture.md](zimante-brand-architecture.md)** | Brand architecture for Zimante — naming, positioning and how the brands relate. |
| **[development-workspace-cleanup.md](development-workspace-cleanup.md)** | The six workspace roots `scanWorkspace` walks behind the live `catalogue:development` npm script — the only human documentation of what that script actually sees. |

### The subsystem dossiers (verified, deep)
Inside the file-map's chapters, these five are read-from-source deep dives —
reach for them when working on that system:
[Radar](workspace/radar.md) · [Advisor & AI](workspace/advisor.md) ·
[KPI & Intelligence](workspace/kpi-intelligence.md) ·
[Aqua Tag](workspace/aqua-tag.md) · [Database](workspace/database.md).

### The generated reference pages (exhaustive, consolidated)
- **[Source-file index](reference/files-index.md)** — every source path linked to its anchored entry inside one of eight large area volumes. Each entry retains purpose, full exported API, **what it depends on and who uses it** without creating thousands of tiny Markdown files.
- **[Consolidated source/symbol map](reference/00-index.md)** — every source file and exported symbol across `src/` and `scripts/`, held in eight grep-able volumes plus the master index. Current generated count: **2,163 files / 7,557 symbols** after this documentation consolidation.
- **[Full API reference](workspace/api-reference.md)** — every route file (**201**: 192 under `api/**` + 9 top-level) with method, purpose, scope, live-data flag. ⚠ **Hand-maintained — nothing generates or verifies it**; last reconciled 2026-08-20.
- **[Every Radar rule](reference/radar-rules.md)** — the complete 2,064-rule enumeration.
- Regenerate all: `node scripts/generate-symbol-reference.mjs`, then `npx tsx scripts/generate-radar-rules-reference.ts` when Radar changes. The legacy `generate-file-docs.mjs` command remains as a compatibility alias for the unified source-reference generator.
  The unified generator rewrites every volume and removes the retired
  `docs/reference/files/` stub tree, so moved/deleted source paths cannot survive
  as orphaned per-file pages.

### The authored documentation volumes (complete, consolidated)

- **[Start here](00-START-HERE.md)** — catalogues, runbooks and entry instructions.
- **[Product and architecture](01-PRODUCT-AND-ARCHITECTURE.md)** — product shape,
  portals, brand architecture and plain-English explanations.
- **[Current state and work](02-CURRENT-STATE-AND-WORK.md)** — checklist, status,
  roadmap, goals, decisions and queue.
- **[Issues, audits and tests](03-ISSUES-AUDITS-AND-TESTS.md)** — findings,
  independent reviews, browser audits and test evidence.
- **[Development plans](04-DEVELOPMENT-PLANS.md)** — every plan and handoff.
- **[Workspace engineering](05-WORKSPACE-ENGINEERING.md)** — maps, dossiers,
  routes, state, components and module notes.
- **[Dev Team operations](06-DEV-TEAM-OPERATIONS.md)** — orchestration, briefs and
  live operational state.
- **[Integrations, compliance and brands](07-INTEGRATIONS-COMPLIANCE-AND-BRANDS.md)**.
- **[History and archive](08-HISTORY-AND-ARCHIVE.md)** — changelog, dated handoffs
  and superseded summaries.

---

## The workflow (the law in practice)

> ### 🔍 Rule zero: the SOURCE is the truth
> A doc is evidence of what someone believed **on the day they wrote it**. Where a
> doc and the code disagree, **read the code, then fix the doc — never the other
> way round.** On 2026-08-20 three "🔴 launch blockers" were briefed as open when
> all three were already fixed, and one of those briefs would have sent a worker to
> "fix" a hardened auth route. Before you act on any claim on these pages, open the
> file it names.
>
> When you find a stale claim: **correct it in place with the `file:line` that
> proves you're right, and mark it RESOLVED rather than deleting it.** History is
> useful; a false open item is not.

**Before you build anything:**
1. Read [TODO.md](development/TODO.md) (where we actually stand), then [goals.md](development/goals.md) (if you don't know the direction) and [roadmap.md](development/roadmap.md) (what's actually next). **Nothing in [context/archive/](context/archive/README.md)** — that shelf is history.
2. Find the concern in the [file map](WORKSPACE-FILE-TREE.md) / [feature index](workspace/feature-index.md), and search the [symbol reference](reference/00-index.md) for what already exists. **Reuse → repurpose → simplify before adding new.**
3. Check [issues.md](development/issues.md) and [hazards-and-duplication.md](workspace/hazards-and-duplication.md) so you edit the canonical copy and don't trip a known risk.

**After you build anything:**
1. **Run the full test suite** ([tests.md](development/tests.md)) and extend the nearest test with your new contract. **But a green suite only proves code *shape*, not that the feature runs or is usable** — most tests are static-source contract tests. **Actually run the thing** (click the flow, hit the endpoint against a live server) before claiming it works, and record the real status in [status.md](development/status.md). *A passing test ≠ working ≠ usable.*
2. **Update the docs that changed:** the relevant [chapter](workspace/), the [feature index](workspace/feature-index.md) if it's a new cross-layer concern, [api-reference](workspace/api-reference.md) if you added an endpoint, [issues.md](development/issues.md) if you found **or fixed** a risk (mark it RESOLVED with evidence — don't delete it), your item's [plan](development/plans/) `**Status:**` line, and [roadmap.md](development/roadmap.md) if you finished or reprioritised an outcome.
3. **Regenerate the reference** if code changed:
   `node scripts/generate-symbol-reference.mjs` (and the Radar generator if you
   touched the catalogue). It rewrites the eight consolidated volumes, rebuilds
   the master file index and removes the retired per-source stub tree.
4. **Log it in [updates.md](development/updates.md).**

That loop is the whole point: the project can never drift away from its own
documentation, because updating the docs *is* part of finishing the work.

---

## Status snapshot (current P0/P1 refresh 2026-08-24)
- **Pre-launch, solo founder, clients waiting for onboarding.** Do not assume all
  records are disposable: file-backed state and configured live Supabase tables
  are separate concerns.
- **Last documented whole-suite run: 3,621 passing / 0 failing / 1 skipped;
  `tsc` clean** (2026-08-23). The skip is the live Postgres check without
  `DATABASE_URL`; this 2026-08-24 docs pass did not rerun the whole suite. A green
  suite proves substantial shape and logic coverage, not complete usability. The
  honest per-feature reality is in **[status.md](development/status.md)**; the
  verified record is in **[audits.md](development/audits.md)**.
- **P0 session revocation: RESOLVED 2026-08-27.** Every authenticated cookie
  read now crosses one central fresh-session boundary (`resolveFreshSessionUser`
  in `auth.ts`) enforcing existence, `sessionRev`, current role and live
  membership; the stale-owner-cookie exploit replay returns 403 with no token
  (`smoke-session-revocation`, 16/16). ⚠ The same day's whole-suite reruns show
  **the full suite is NOT currently green** (~74 pre-existing failures on the
  current tree) — see the truth note at the top of
  [TODO.md](development/TODO.md).
- **P1:** showcase GET/OAuth mutations bypass the read-only proxy assumption;
  erasure can report live failures as success, strand retry and retain the client
  name in its audit; Editor AI's database coordination remains incomplete;
  editor transitions/prefill and staff capability policy remain uneven.
- **Other reliability queue:** file persistence/corrupt-state recovery, invalid
  client references, truthful website empty states, read-path performance and
  critical browser journeys. The exact order is
  [TODO.md](development/TODO.md).
- **The three former 🔴 launch blockers are all FIXED** (source-verified 2026-08-20): freelancer preview escalation (`api/auth/preview-as-freelancer/route.ts:49,101` stashes/restores `previewReturnUserId`), finance create-surface idempotency (`agency-finance/src/lib/idempotency.ts`, wired into invoices · plans · operations · expenses · payments · income), and erasure email-in-log (`leads-pipeline/src/server/contacts.ts:168,227,252,279` log an **id**, never an address).
- **RLS is ON in live Supabase** (verified across 14 tables with the public anon key, 2026-08-20). What remains is **engineering, not an Ed decision**: the RLS policies ARE version-controlled — 14 migrations in `aquaCRM/supabase/migrations/`, 13 of them predating 2026-08-20. An earlier note here said there were none; that was wrong, written by looking inside `portal/` only, `brand_enquiries` has no `agency_id`, ~37 service-role refs bypass it — see [rls-enable](development/plans/rls-enable.md).
- **MFA on login is BUILT — all four phases** (verified 2026-08-21). The server gate is `api/auth/login/route.ts:320` (`loginMfaStep`), session assurance is `raisedToSecondFactor` at `:399`, and RECOVERY CODES are built too: `consumeRecoveryCode` (`lib/server/auth/mfa.ts:500`) called from the `check-recovery` branch (`login/route.ts:338,353,358`), with the login form's code step at `app/login/LoginForm.tsx:253-272`. Native form posts carry the code through (`login/route.ts:151`). See [mfa-login](development/plans/mfa-login.md) for what genuinely remains.
- **Real emailed connect codes are SHIPPED** (`lib/server/connectionConfirmation.ts` — 6-digit, HMAC-hashed, 15-min TTL, single-use; `00000` is dev-mode-gated only). A Resend sender is configured and `inspectProductionReadiness()` reports email READY. Only the code-step **browser walk** is unwalked.
- **Standard portal = one Website product**; Aqua Tags setup steps **1, 2, 3 and 6 are done**, step 4 (link the repo) is next, step 5 (seed into the editor) is planned — `agency/fulfilment/_AquaTagsWorkspace.tsx:85-90`.
- **Open decisions** (genuinely Ed's): **Aqua Tag form-capture consent**, and **when to merge `work/2026-08-20-parallel-session` to `main`** (the merge is what deploys production). The first commit is DONE, and Agency-vs-TradingCompany was SETTLED — the three-tier model is stated in code at `src/app/api/portal/agency/companies/[companyId]/portal/route.ts:24-29`. See [TODO.md](development/TODO.md) and [issues.md](development/issues.md).
- **The DEV EDITOR is the one editor** (2026-08-21). There is no separate portal
  editor, website editor or code editor any more: one surface that adapts to
  what it is pointed at. `/portal/dev-team/editor` is the PROJECTS workspace
  (add / configure / disconnect, then "Open editor"); the editor itself is
  `./studio?project=<id>` and exiting returns to the list.
  - **Real editing**: CodeMirror 6 with the genuine VS Code Dark+ theme and
    language grammars; file-type icon tints; multiple files open at once with
    per-file buffers; session resume per project.
  - **Reading was broken and is fixed**: `readable` and `editable` were the same
    question, so anything outside a narrow web-stack list rendered BLANK. Now
    ~50 extensions plus extensionless names, big files read (truncation
    flagged), images preview, and only genuine binaries refuse — with a reason.
  - **Writing exists and is hardened.** An adversarial review found five real
    defects, all fixed and pinned in `smoke-editor-write-path` (21 tests):
    a TOCTOU race where two saves both won, a truncate-in-place write that
    destroyed files on failure, a fingerprint not bound to its path (this repo
    has byte-identical files), `.data/` being writable, and a symlink escape.
    Creating files and folders goes through the same guards.
  - **Presence** marks files that moved under you, reusing the Dev Team's
    existing check-ins + mtime scan. Advisory; the fingerprint is the real guard.
  - **Aqua Editor AI** has a dedicated project-scoped provider/configuration and
    history path. It proposes; a person applies. Stored replay and same-process
    dedup exist, but its cross-instance claim/RPC/database coordination is
    incomplete and must not be called production-wide single execution.
  - **PR management**: the engine commits to a branch, then `openPullRequest()`
    and `mergePullRequest()` — two steps on purpose, so a preview exists before
    anything reaches main.
  - Plans: [dev-editor-checklist](development/plans/dev-editor-checklist.md) (what
    is left, including the funnel/client-side convergence as its Phase 6) and
    [dev-editor-inspector](development/plans/dev-editor-inspector.md).
    *(A separate `super-editor.md` convergence map was referenced from three
    places but never written — the checklist's Phase 6 is the record.)*
- **`src/engines/` is real**: `editor/`, `sop/`, `data/` (Radar + KPI) all moved
  in, imports rewritten, suite-guarded — see [STRUCTURE](development/STRUCTURE.md).
- **IA v2**: Operations and Tools are single flat sidebar rows onto hub pages;
  pinned pages (topbar or sidebar) ship as chrome.
- Full current-state detail: **[TODO.md](development/TODO.md)** — the *only* live task list. `checklist.md` and `todo-retired.md` were merged into it on 2026-08-31; older competitors are on the [history shelf](context/archive/README.md).

---

*This document is the entry point named by `CLAUDE.md`. If you change how the
project is documented, change this page too — it is the one thing everything
else hangs from.*
<!-- AQUACRM_SOURCE_END path="docs/development.md" -->

---

<a id="source-docs-development-campaign-ledger-md"></a>

## Source document — `docs/development/CAMPAIGN-LEDGER.md`

<!-- AQUACRM_SOURCE_START path="docs/development/CAMPAIGN-LEDGER.md" sha256="8906eb267d7bbcff98cf1bcc583fd49a53cc3c4935fc2e9122732abf20116044" -->
# Campaign ledger — every documented to-do, verified against source

*Generated 2026-08-30 from a 131-agent triage: one independent read-only investigator
per open item across `todo.md`, `checklist.md`, the LOOP-PROGRESS queue and the named
open issues, each required to cite file:line. **Source code was the authority; the lists
were treated as claims.** This ledger is the deduplicated result and the campaign plan.*

## Verdict counts

| Verdict | Count | Meaning |
| --- | --- | --- |
| unblocked-code | 50 | open, implementable now — no credential, live service or product decision needed |
| partially-done | 40 | some shipped; concrete code work remains (the residue is named per item) |
| needs-live-env-or-browser | 13 | code half done/trivial; honest proof needs a live server or browser walk |
| blocked-on-ed | 11 | needs Ed: a credential, an account, wording, or a decision |
| already-done | 12 | verified complete in source — the list never absorbed it |
| risky-needs-decision | 5 | implementable but architecturally significant; Ed should choose |
| **total** | **131** | |

## Already done — check these off

The lists drifted. These are verified complete in current source:

- **todo:682** — � P0: make session revocation real everywhere. resolveFreshSessionUser() centrally enforces existence/sessionRev/role/membership on every authenticated read; behavioural old-cookie matrix (scripts/smoke-session-revocation.test.ts) passes 16/16 in this triage, external-AI explo
- **todo:860** — � Isolate the showcase fixture. GET /showcase is seed-once (ensurePublicShowcaseWorkspace, never reset) in its own data realm; only reset path targets the private owner slug behind auth; regression pins that the public route can never reset. Residue is doc drift
- **todo:952** — Command Centre nav link → Aqua Tags. 'Aqua tags' shipped 2026-08-20 as a registered sidebar nav item to /portal/agency/fulfilment?view=tags, reachable three additional ways under Ed-approved IA v2 (Operations hub card, quick-search, Fulfilment tab strip). Tick todo.m
- **todo:958** — � `fulfilment` / `fulfillment` three-spelling split. One Fulfilment nav entry, plugin nav re-pointed, legacy Phases item filtered, all two-L URLs redirect-stub to the canonical surface — pinned by smoke-nav-audit. Full one-spelling physical consolidation remains an optional separate
- **todo:959** — Two contacts systems. Canonical pick made and enforced 2026-08-25 (issue #90): agency/contacts Person is canonical; leads-pipeline/contacts deliberately retained as the plugin's import rolodex. Only the checkbox at todo.md:959 and its mirror need ticki
- **todo:961** — Dead code. adapters.ts has two real importers (appConfigAdapter.ts:10, smoke-editor-adapters.test.ts); the agency/sops redirect was repointed to /portal/agency/sop-library, is referenced by nav/proxy/walkers and pinned by smoke-audit-regress
- **todo:969** — `.env.example` missing 3 Supabase creds. Issue #4 fixed 2026-08-27: all three Supabase vars in .env.example, closed by construction via smoke-env-example-completeness (derives required list from productionReadiness.ts); ran 5/5 in this checkout. Stale copies in todo.md:9
- **checklist:1605** — Merge to `main` (Ed's call. PR #3 merged work/2026-08-20-parallel-session into main on 2026-08-23 (commit 8392cca, ancestor of origin/main); main has advanced multiple commits past it. Strike the stale checklist line at next grooming.
- **loop-queue:1** — Scouting journey Stage 1. Scouting Stage 1 shipped in commit 7917318: protected Call/Email buttons, server contactability gate + atomic attempt logging, quota rings/streak on CommandCalendarEntry; 14/14 dedicated smoke tests pass now. Auto-increment delibe
- **loop-queue:2** — Inbox premium messaging pass. Inbox premium messaging pass landed in the 2026-08-30 push (commit 7917318; CLOUD-RESUME.md:31): two-pane redesign in _UnifiedInboxWorkspace + _MasterInbox chip row; sub-12px pin correctly dropped. Adjacent 'inbox URL resync'/'wat

## Implementation waves

Waves are ordered by value and risk; every item inside a wave touches disjoint files so
the work can run in parallel. The full canonical suite is the gate between waves.

### Wave 1 — Money & truthfulness P0s

Highest-value real bugs and false-success claims: send stamped 'sent' on failed delivery (668, leads-pipeline commercial files), unreviewable contracts acceptable + fake 'contract sent' logs (663, closeDeal/portal files), Stripe port that lies available (501, memberships foundation), dispute event double-emit (857, agency-finance), the destructive silent-failure read paths incl. the blank contact editor (600, per checklist:1485's plan — app-wide read files untouched by others this wave), client roles routed into the internal workspace against Ed's recorded decision (390, auth files), and the one-line Kanbans double-render (loop-queue:3). All file-disjoint; the leads-pipeline module smoke suite is touched only by 668 this wave.

- **todo:668** (medium, commerce-payments) — � Respect commercial email delivery results  
  Fully open and exactly as claimed: CommercialService.sendUnlocked() stamps invoice/agreement "sent"+sentAt and logs commercial.sent from any resolved adapter result without ever reading `delivered` (commercial.ts:204-237), and resumePaymentSideEffects() does not even capture the send result before s
- **todo:663** (large, commerce-payments) — � Make Close the deal issue a reviewable, truthfully delivered contract  
  Still fully open and accurate: closeDealForClient creates the contract directly with status:"sent" with body optional (title-only possible), the close-deal route never invokes any email delivery yet logs "contract sent + invoice issued", both close forms collect no terms/document, and the customer p
- **todo:501** (large, commerce-payments) — � Finish the paid Memberships foundation adapter  
  Every claim is still true in source: the runtime foundation's stripeFor() unconditionally returns a throwing NOOP stub, so isStripeAvailable() is a false positive, paid Silver/Gold seed failures are silently swallowed leaving only free Bronze, and the healthcheck reports ok:true from row counts with
- **todo:857** (small, commerce-payments) — � Make Stripe refund/dispute event handling durably idempotent  
  The core shipped 2026-08-26 under issue #119: refund and dispute records are durably idempotent across processes via provider-id-derived record ids (not the process-local set, which survives only as a warm-process cache), cumulative Stripe amount_refunded converges to the missing delta, activity is 
- **todo:600** (x-large, other) — � Stop read failures becoming “none,” stale or “clear”  
  Issue #57 is still fully open: nearly every named read path still converts a rejected read into truthful-looking empty/default data, including the destructive blank contact editor and the zero-outstanding/"Operations clear" finance path. No availability-state work has shipped since the 2026-08-26 au
- **todo:390** (medium, auth-recovery) — � Finish role-aware account and portal recovery navigation  
  Agency-staff Account/Permissions are fixed (#92) and the 27 Aug Phase 18 work made the ProfileMenu and /portal index role-aware for the client-portal audience, but the Account back-link and guidance still send client/freelancer roles to /portal/agency, the portal 404 remains hardcoded to "Agency das
- **loop-queue:3** (small, journey-crm) — Journey Kanbans tab + custom boards  
  The Journey Kanbans tab and custom boards shipped in commit 7917318: the desk component with manage-gated create/delete, the DESKS entry and render branch, the boards/cards APIs with the custom-only wall, the real drag-drop CustomBoardWorkspace for custom boards, and data-testid="pipeline-columns" p

### Wave 2 — Durable delivery & concurrency

Second tier of truthfulness/data-safety: honest campaign delivery (99 — takes the leads-pipeline suite after 668 lands), upload lifecycle registry + compensation + batch-cap honesty (656, upload routes + privateUploadStorage), real affiliates Stripe Connect port + capability gating (506, foundation adapters — after 501 released _crossPluginPorts), cross-instance CAS for marketing records (104), CompanyProfile 409 concurrency + review lock (770 — sole company.ts/types.ts toucher this wave), and the revisitable install-help extraction (394, customer setup/support files). Disjoint files throughout.

- **todo:99** (large, marketing-campaigns) — � Make campaign delivery truthful  
  Fully open and exactly as claimed: CampaignService.send() only enqueues outbox rows, stamps leads contacted and finalises status "sent" without ever invoking DeliveryService, no worker drains the queue, and CampaignsPage auto-enables email-sender then reports Boolean(install.enabled) as readiness. T
- **todo:656** (large, uploads-media) — � Make all private uploads/deletes transactional and retryable  
  Fully open, nothing shipped: all nine private-upload routes still write storage before the owning record with no compensation, the four record-delete paths still swallow provider errors and report success, staged inbox/expense/campaign objects have no record or expiry, and the product-workspace batc
- **todo:506** (medium, commerce-payments) — � Wire Affiliate Stripe Connect or stop offering it  
  Still open and accurate: the live foundation registration (src/built-ins/runtime/foundation-adapters/affiliatesFoundation.ts:18-25) supplies six ports but never stripeConnect, so onboarding/refresh/webhook/transfer all 422 while the customer CTA renders unconditionally and the admin transfer button 
- **todo:104** (medium, marketing-campaigns) — � Make Marketing asset/profile persistence concurrency-safe  
  The headline defect is fixed: Channels/Funnels assets and Customer profiles no longer replace whole arrays — they persist as independent by-id rows with tombstoned deletes and legacy-array merge, mutations serialize per agency+collection, and all three mounted editors send the updatedAt they opened 
- **todo:770** (large, radar-command) — � Version Battle Table writes and retain completed review history  
  Still fully open: every Battle Table station and the Company workspace PUT a whole CompanyProfile that the server merges last-write-wins with a fresh Date.now() updatedAt and no version compare, and Quarterly Review "Lock review" is reversible — any edit of a completed review silently flips it back 
- **todo:394** (medium, auth-recovery) — � Keep customer installation help revisitable  
  Fully open: the install scene still promises "it is in your portal under Support" (src/app/setup/_CustomerSetup.tsx:256) while SupportView (src/app/portal/customer/_CustomerPortalViews.tsx:1514-1544) offers only request/email/phone/WhatsApp and no install help exists anywhere under /portal/customer;

### Wave 3 — Contract integrity & dependency safety

Integrity gates: acceptance bound to immutable sent versions (672 — commercial.ts/domain.ts free after waves 1-2), graph-aware capital-plan validation (763 — company.ts free after 770), SOP delete dependants preview (757, decision-free wiring only), plan/affiliate delete inventory wiring into DELETE/confirmation (751, wiring only — policy stays with Ed), plugin-health persistence + Radar honesty (641), Sentry/observability mount + readiness honesty (386), shared voice-recorder helper with compensation (441, inbox), and email-sender vault/config unification (635 — sole pluginSecretConfig/catalog toucher this wave). Pairwise disjoint.

- **todo:672** (large, commerce-payments) — � Make commercial proposals immutable once sent/accepted  
  Fully open: acceptance is still not bound to an immutable sent version. accept() sets accepted unconditionally with no sent-state check, save() replaces line items/totals/cadence/agreement text while preserving accepted status, acceptedAt and the old Stripe Checkout id/URL, the public token is minte
- **todo:763** (large, governance-compliance) — � Enforce Company capital/governance register invariants  
  Issue #65 is fully open and the claim is accurate in current source: updateCompanyProfile() still pushes the nested capital plan through independent shape/range cleaners with no unique-id enforcement, no reference resolution (owner/class/approval/document), no paid-within-declared or allocation-reco
- **todo:757** (medium, cleanup-dedup) — � Make SOP retirement dependency-safe  
  The decision-free prerequisite shipped 2026-08-27: a dependency inventory (src/engines/sop/server/sopDependencies.ts) covers all nine SOP reference sites across seven owning types (four nested), pinned by smoke-sop-dependencies (6/6). But nothing consumes it yet: deleteSopRecord is still literally `
- **todo:751** (medium, commerce-payments) — � Make Membership/Affiliate retirement dependency-safe  
  The measurement prerequisite shipped 2026-08-27: dependency inventories for both modules exist and are test-proven (planDependencyInventory reporting billableSubscribers/wouldBecomeUnreachable; affiliateDependencyInventory reporting hasFinancialDependants/activeReferralCodes), but nothing consumes t
- **todo:641** (medium, plugins-platform) — � Run and persist plugin healthchecks  
  The "no caller" half is fixed: /api/portal/plugins/health (built 2026-08-28) runs every enabled install's healthcheck with a 5s timeout, converts throw/timeout into an unhealthy row, treats no-hook as supported:false, and is displayed via src/lib/chrome/pluginHealth.ts in DevConsolePanel — all test-
- **todo:386** (large, other) — � Mount and prove real application observability  
  Fully open: observability.ts and requestLog.ts still have zero production callers, @sentry/nextjs is absent from package.json and node_modules, productionReadiness marks monitoring ready from a DSN env string alone, error.tsx claims "We've logged the issue" after only console.error, and the green sm
- **todo:441** (large, inbox-comms) — � Harden voice and call recording across browser formats and failures  
  Open and unchanged: all four recorder sites still hardcode the WebM fallback without testing it or MP4/browser-default, every produced file is named .webm regardless of the actual recorder MIME, voice-note constructor failures are still reported as "Microphone access was not granted" while leaking t
- **todo:635** (medium, inbox-comms) — � Build the missing Email Sender setup flow  
  The backend half has shipped since the item was written — truthful no-send provider (#34 resolved), a real SMTP driver alongside Postmark, a complete role-gated provider/identity/test/webhook API layer with honest unconfigured/error/active readiness states, and a generic PluginSettingsPanel now moun

### Wave 4 — Honest surfaces & platform wiring

Remaining correctness with lower blast radius: installment invoice-id dedupe + exact remainder (677 — last leads-pipeline slot), legal-register delete guard (777 — company.ts/_CapitalOwnershipWorkspace free after 763), governance company scoping (783), PluginSettingsPanel mounting for the three read-only client-scoped modules (715), the editor dead-endpoint repointing/gating lanes A (68), Infra-probe hoist + failure isolation (383, cron/radar files), byte-range media (437 — privateUploadStorage free after 656), and provision/publish/deploy idempotency (651 — types.ts/storage.ts free after 770). Disjoint within the wave.

- **todo:677** (medium, commerce-payments) — � Make Stripe installment completion exact and retryable  
  The "cancellation failure ignored while webhook returns success" leg is fixed: the final-installment cancel_at_period_end call is now response-checked and answers 502/503 on failure with a stable idempotency key, so Stripe redelivers and retries. Still open: the stop condition counts any payment wit
- **todo:777** (medium, governance-compliance) — � Make legal-document retirement dependency-safe  
  Fully open and verified in source: mounted legal-register Delete removes only the register row with no dependant inventory (Finance obligations keep linkedLegalDocumentId, governance decisions keep documentId), the confirmation names only doc+file, and provider-file deletion errors are suppressed. T
- **todo:783** (medium, governance-compliance) — � Make Governance scope truthful across every view  
  Still open and accurate: buildGovernanceSnapshot scopes only the compliance posture and HIPAA flag by the selected company, while legal register rows, declarations, sub-processor agreement flags and erasure clients stay agency-wide, and a failed scope reload leaves the old company's snapshot labelle
- **todo:715** (medium, plugins-platform) — � Finish or remove manifest plugin settings  
  The item's central claims are stale: since the 2026-08-24 audit the agency Settings hub now mounts the generic PluginSettingsPanel for all four agency-scoped settings modules (Finance, HR, Marketing, Email Sender) via a cog-per-workspace ModulesPane, ecommerce mounts it client-scoped, and the 25 dea
- **todo:68** (large, website-editor) — � Repair the website-editor API contract before calling the editor  
  The honesty/coverage layer shipped (2026-08-28 audit): a module-aware route-table ratchet test resolves every literal editor fetch against the real route tables and pins 31 known-dead endpoints, and the Funnels creator is labelled and disabled via a featureBackends gap registry. But the contract its
- **todo:383** (medium, radar-command) — � Make Radar scheduling match its taxonomy  
  Open and implementable now. The daily cron/inbox loop still reruns the app-wide Infra probe inside every per-agency runRadarScheduledSweep call, an Infra failure still aborts that tenant's evidence rollup (no retry until the next day), the Evidence sweep still declares an hourly cadence while actual
- **todo:437** (medium, uploads-media) — � Add provider-aware byte ranges to private media delivery  
  Open and untouched: all three private-media content routes (inbox attachments, call recordings, SOP media) ignore the Range header, always answer 200 with the full object, and the local/Supabase paths (plus inbox Vercel path) fully buffer it; no 206/416/Content-Range/Accept-Ranges code exists anywhe
- **todo:651** (large, website-editor) — � Make project provision, GitHub publish and Vercel deploy retry-safe  
  Fully open and accurately described: provision commits a local git repo before the client record is durable (retry mints a -2 sibling via uniqueProjectPath), publish creates the GitHub repo before remote/push/save (retry collides), deploy creates the Vercel deployment before its id is recorded (retr

### Wave 5 — Accessibility & PWA

The a11y block shares one wave by design: modal focus-trap primitive + sweep (397), tablist/menu/listbox keyboard models (412), accessible-name bundle (417), and PWA icons/install-prompt (430). 397/412/417 overlap a few workspace files (_ActionsWorkspace, company panels) — assign one coordinating agent or sequence those three internally. checklist:1240 (Playwright browser matrix) rides along on fully new files and gives the a11y work its future automated gate. 430 touches _CustomerSetup after wave 2's 394 has landed.

- **todo:397** (x-large, a11y) — � Standardise true modals on an accessible keyboard contract  
  Fully open and has drifted worse: 57 TSX files now declare aria-modal="true" but only 3 use the existing useFocusTrap hook, leaving 54 untrapped modal files (the todo says 47), and only 6 of the untrapped files even mention Escape. The hook and a proven exemplar (ConfirmDialog: trap + deliberate ini
- **todo:412** (large, a11y) — � Standardise tabs, menus and listboxes or remove their specialised roles  
  One named slice of issues #138 shipped via the settings restructure: the Settings tablist (whose aria-controls pointed at nonexistent settings-pane-* ids) was replaced 2026-08-30 with an honest nav rail (aria-current buttons) plus a native grouped select, i.e. the "remove the misleading roles" remed
- **todo:417** (medium, a11y) — � Give icon actions and published-form fields stable accessible names  
  Two slices are shipped beyond what the todo records: the shared avatar input is named "Upload profile photo" (pinned by a test) and the Development reveal/copy-password buttons now carry per-resource aria-labels with a role="alert" error. Everything else in the bundle is still open in source: Team a
- **todo:430** (medium, other) — � Ship a Chromium-installable customer manifest  
  Fully open and accurately described: public/ has no 512px icon (only 32/180/192), manifest.webmanifest declares 192/180/32 with the transparent 192 reused as "maskable", the smoke test asserts only standalone/start_url/the word "maskable", and InstallStep calls prompt.prompt() without awaiting userC
- **checklist:1240** (large, a11y) — P2  
  The claim's diagnosis is still accurate — smoke-ux.mjs puts 375/768/1280 only in a User-Agent string and does server-HTML substring checks — but two of the bundle's three parts shipped: the script is explicitly reframed/retained as markup smoke, and the one concrete defect the manual browser pass fo

### Wave 6 — Website-editor honesty & small fixes

Editor/product truthfulness on disjoint files: block honesty + dead /api/contact default (77 — block files free after wave 5's 417 touched the form blocks), hydration-stable ShareButtons/Breadcrumb via ElementContext (433), war-room pulse tied to persisted CommandKpi targets + todo tick (940), radar probe-staleness surface (#170 — radarSweeps free after 383/641), clone-from-remote for the preview stack (#19, code half only), shared activity vocabulary + Updates-tab adoption (960), and the lead-archive fault-injection test (746, one test file).

- **todo:77** (large, website-editor) — � Stop publishing dead interactive blocks  
  The "label/remove until the backend exists" half of issue #29 shipped and is ratcheted: all nine dead native blocks (contact/forms/booking/newsletter/theme/blog x2/product-search/donation) are in BLOCK_BACKEND_GAPS, the palette refuses to add them, templates no longer seed them, an action-less form 
- **todo:433** (small, website-editor) — � Remove render-time `window` from published current-page blocks  
  Fully open: both published blocks still branch on `typeof window` during render — ShareButtonsBlock encodes an empty share target on the server when `url` is blank, and auto BreadcrumbBlock server-renders null then builds a full nav from window.location.pathname on the client, a hydration divergence
- **todo:940** (small, radar-command) — Battle Table overhaul → live war-room  
  The war-room reframe is SHIPPED and test-pinned: _battleWarRoom.ts implements the pure model (buildBattlefield/buildWarRoomDecisions/buildWarRoomPulse etc.), _BattleTableWorkspace.tsx makes "warroom" the default section with the three zones and the 10 planning sections demoted to drill-in stations (
- **issue:#170** (medium, radar-command) — #170 Radar probe cron is daily so evidence can be 24h stale with no surface saying so  
  Issue #170 is still OPEN and accurately described: vercel.json schedules /api/cron/radar-probes daily (15 6 * * *), the exact schedule is pinned by smoke-radar-sweeps, and no Radar surface states probe-evidence age — infra checks stamp themselves with the Pulse's `now` and ignore the snapshot's real
- **issue:#19** (medium, website-editor) — #19 Dev Workspace  
  The item's claim is accurate but understates what already shipped: issue #19's source/regression half is RESOLVED (dirty-buffer/abort/discard guards, stale-preview state machine, editor chain 154/154), and phase 17 has since landed isolated per-project worktrees plus fingerprinted dependency-install
- **todo:960** (small, inbox-comms) — Two inbox surfaces  
  Confirmed in source: the two surfaces are NOT redundant pages — agency/inbox is the merged Master Inbox command surface (Needs-you/Inbox/Updates, 2026-08-30 inbox merge) while agency/activity-inbox is a standalone read-only system-history log, and they deliberately cross-link with test pins. But the
- **todo:746** (small, journey-crm) — � Make lead archival recoverable and card-safe  
  Issue #62 shipped 2026-08-27: archive/restore/purge are three honest verbs — archive keeps the row, index and identity pointers while removing the pipeline card and remembering its column; restore re-creates the card in the column it left; purge is the old hard delete, gated behind archive-first — v

### Wave 7 — Hygiene sweeps & governance build-out

Cleanup/consistency kept separate from feature waves: the 403-vs-404 tenancy-first sweep (#168 — MUST land as its own isolated PR with a full suite run, per the issue; its ~30 api/tenants files touch nothing else in this wave), personInteractions rename (962), remaining read-path mutation removals (1842), single capability-policy module deriving proxy/nav/page gates (1593), tenant-scoped production readiness (1961), global-error.tsx (427 — smoke-observability free after 386), the governance KNOW build-out slices: breach register, consent/ROPA, IP register (941 — governance files free after 783), and static-export renderer parity (85 — pageTemplates free after 77).

- **issue:#168** (medium, cleanup-dedup) — #168 28 routes answer 403 where the house convention is 404  
  Still open and unchanged since it was recorded on 2026-08-27: the element gate (requireCurrentClientWorkspaceElementAccess) throws AuthError 403 on a cross-tenant/nonexistent client id (ceiling-denied → hidden → 403), and roughly 28-33 route files still call that gate BEFORE their own getClientForAg
- **todo:962** (medium, cleanup-dedup) — The rest  
  The bundle has substantially drifted: the "empty preview placeholders" claim is dead (both are real authenticated routes), the twin-filename hazard was resolved 2026-08-20 via Service-suffix renames (one straggler: personInteractions), and email-sender drivers are real implementations (only sendgrid
- **checklist:1842** (medium, other) — Read paths perform hidden writes and expensive work. A TypeScript  
  The checklist text is stale 2026-08-24 prose (28 GETs / 26 renders). Since then the inventory was rebuilt as a source-derived, declared-and-ruled guard (smoke:read-path-mutations, verified passing 16/16 today, unruled backlog pinned at zero), and the biggest writes were removed: team-channel creatio
- **checklist:1593** (medium, governance-compliance) — P1  
  The checklist text is stale: the concrete Team Chat break is fixed — src/proxy.ts now allowlists 14 staff API roots (not five) including /api/portal/team-chat, plus three delegated staff agency-page roots, and the team-chat route's agency-staff access therefore runs; TeamChat's response-ordering rac
- **checklist:1961** (large, governance-compliance) — Env-only audit. Every setting that needs a redeploy to change cannot  
  The checklist's core claim is stale: the env-only audit list DOES exist — docs/workspace/env-and-sellability.md is a full baseline inventory (17 vars with no in-app path, fix shapes, work order), and two of its five day-one env leaks are since fixed (transactional email send gate, enquiry notificati
- **todo:427** (small, other) — � Mount the actual root-level error fallback  
  Open and verified in source: src/app/error.tsx exists as the route-segment boundary (mislabelled "top-level"/GlobalError in its own header), but no src/app/global-error.tsx exists, so Next 16 serves its builtin fallback for root-layout/App Router failures. Writing the global-error.tsx contract file 
- **todo:941** (x-large, governance-compliance) — Operations / System surface  
  The Operations/KNOW surface exists and is much further along than the todo claims: a Governance workspace (commit 4943737, 2026-08-20) sits in the Operations sidebar panel with six views (Posture, Legal register, DPO/erasure, Subject requests, Sub-processors, Security), backed by the honesty-enforce
- **todo:85** (medium, website-editor) — � Repair website export before offering it as a backup or migration  
  Two of the three legs are fixed in committed source (main 25eae14, 2026-08-29): the export handler is now registered at /api/portal/website-editor/export and the Customise button calls it (resolving siteId via the real /sites route) instead of the absent /api/admin/export-code; contact-form blocks n

### Wave 8 — Flagship feature builds

Large product builds each owning a distinct area: element-engine P5 widening then P6 assistant composition (1945, engines/editor/elements), Command Centre regrouping + progressive disclosure (loop-queue:4 — Stage 0 asks Ed if the lost design doc survives, but the staged build itself is unblocked; owns _CommandIntelligenceWorkspace/_BattleTableWorkspace this wave), website demo Stage 1 behind a flag (loop-queue:6, (website) routes), and the unblocked You-Deserve-It phases (944 — sole types.ts/storage.ts extender this wave; 941 landed in wave 7). Ordered after bug waves; four x-large/large items keeps merge risk low.

- **checklist:1945** (x-large, website-editor) — Engine widening + assistant proposals (P5, P6). ~5 days. After this an  
  Genuinely open, and correctly ordered after the shipped P1-P3 foundation. The shared element registry exists and the portal palette is derived from it, but the widening is unfinished (two live block registries, three styles-to-CSS mappers, the "stage" surface has zero consumers) and no assistant com
- **loop-queue:4** (x-large, radar-command) — Command Centre regrouping + progressive disclosure  
  Not started: no regrouping/progressive-disclosure code exists (CommandPanelShell appears only in docs, never in src; the station nav is still the flat 4-station layout; no updates.md entry). Both judge flags check out against source — the attention-protection strings are real pinned contracts and th
- **loop-queue:6** (medium, marketing-campaigns) — Website demo Stage 1  
  Nothing of Website demo Stage 1 exists yet: there is no /for-agencies route, no terms/privacy page shell, no demo-gate form, and no gating flag anywhere in src. The item was scoped precisely so the build does NOT wait on Ed — Q5 says "build proceeds behind a flag" and only the gate going live needs 
- **todo:944** (x-large, journey-crm) — "You Deserve It" upgrade  
  The bones the item describes are real and one connective-tissue slice — gift cost → approval-gated finance expense — shipped 2026-08-19 and is pinned by a smoke test; everything else (meaningful dates, real deserve indicators, multi-supplier trips, supplier ordering, why-ledger, client-workspace pan

### Wave 9 — Polish, plain-English & docs reconciliation

Final polish and bookkeeping once the code waves have settled (so docs sweeps record the true final state): shared InfoTip + per-surface plain-English pass (loop-queue:5 — touches _CommandIntelligenceWorkspace/_MasterInbox after waves 6-8 finish with them), perf re-measure + docs accuracy sweep + demo-PII compliance check (loop-queue:7), plan backfill/archiving (1982), and the checklist:673 truth-up (its AI/service-principal fragment stays parked pending Ed's confirmation). lq7/1982/673 all edit checklist.md — coordinate or sequence those doc edits within the wave.

- **loop-queue:5** (x-large, other) — Info icons / plain-English pass app-wide  
  The app-wide info-icons / plain-English pass has not started as a systematic effort: no shared info-icon/tooltip component exists anywhere in portal/src (no InfoTip/InfoIcon/Explainer in portal/src/components/ui/, which holds only CollapsibleSection, ConfirmDialog, EmptyState, ErrorBoundary, Loading
- **loop-queue:7** (large, governance-compliance) — Performance re-measure + docs accuracy sweep + data-compliance check (demo PII → governanc  
  All three bundled concerns are still open and none is recorded as done anywhere: perf numbers newer than pre-27-Aug do not exist, no docs accuracy sweep is logged after the 2026-08-30 shipping wave, and the demo-PII-vs-erasure compliance check has never been performed — and it has real substance, si
- **checklist:1982** (small, docs-only) — Backfill phase ticks on 14 shipped plans reading `0/N`, then archive  
  The item's premise has largely drifted: parser fixes already shipped (Format B "Phasing" and Format C bold-phase parsing in devTeamTasks.ts) recovered several plans that falsely read 0/N (e.g. radar-upgrade now 7/7), and of the 15 top-level plans that still parse to 0/N today, only two are shipped b
- **checklist:673** (small, governance-compliance) — Application-wide parity. Classify the remaining module catch-all, freelancer-job  
  Five of the six clauses shipped on 2026-08-27 and verify in source today: the module catch-all is classified and enforced, freelancer-job/task/task-template client associations are classified and gated, the three competing HR/freelancer routes converged onto staff.people, and named alternative autho

## Blocked ledger — needs Ed, a live environment, or a decision

| Item | What it is | What it needs |
| --- | --- | --- |
| todo:90 | � Retire or finish the legacy Website Editor admin islands | Ed's per-surface decision: retire vs unify for the browser-local Sites registry, Sections, Popup, Customise, and Page Detail (option b measured at ~20 sync fns / 27 call sites / 3,297-line SitesPage). |
| todo:646 | � Make Build custom portal reach a real service | Ed's backend-direction pick before any code: (a) promote the complete-but-unwired github-templates/modules/portal-export into a runtime plugin, (b) re-point the wizard at clientProjectProvisioner, or  |
| checklist:1951 | Wizard engine. Generalise the 711-line Aqua Tag setup into steps/UI/ | Ed's call on the wizard-engine cluster: sequencing vs the other ~5-day engine projects (explicit 'do not start P6 first' warnings, overlap with stages-hold-elements), and the product/safety decision o |
| issue:#174 | #174 revoking an identity LAST grant returns them to un-migrated legacy access so revocati | Ed's pick among the three recorded options for last-grant revocation falling back to legacy manage: (1) warning on revoke, (2) sticky persisted governed marker (identified safe default, but forecloses |
| todo:942 | Advisor omega upgrade | Ed's Advisor 'omega' vision: the #1 missing capability, whether to keep the read-only + human-accept safety contract, and one flagship upgrade vs several. Plan doc is deliberately empty until he answe |
| todo:953 | Meta / Instagram inbox | Ed to create the real Meta Developer app and enter App ID / App Secret / verify token via the built Connect-now surface on an HTTPS deployment, then the live OAuth + webhook walk. Code is complete and |
| todo:968 | Aqua Tag form-capture consent | Ed's compliance decision (DPO/solicitor-class): legitimate interest for form-capture field values vs gating capture on consent. Related issue #3 inherits the same call. Implementation either way is sm |
| todo:971 | Ed's GitHub credentials for the Dev Editor publish walk | Ed's real GitHub credentials entered via the editor Settings GitHubConnectPanel, then a browser walk of save → diff → commit → PR → merge on a throwaway branch, recorded in dev-editor-finish phase 17. |
| checklist:1610 | Walk the onboarding chain once, on your own data: client → connection | Ed personally, in a real browser on his own data: create client → connection link → sign in → confirm code → see portal (dev code bypass 00000 available; real delivery needs a connected sender). No co |
| checklist:1614 | Stripe live-account walkthrough: `stripe@22.5.0` is now installed; the | Ed's real Stripe keys (secret + webhook signing secret) entered via the Finance settings panel, then live Checkout + signed HTTPS webhook walk on a deployed endpoint. |
| checklist:1620 | Meta Developer app + real HTTPS OAuth/webhook walk. No `META_*` values | Ed's Meta Developer app (App ID, App Secret, verify token) entered via the encrypted connections panel, then the live HTTPS OAuth connect + webhook verification walk. |
| checklist:1622 | Deployment env verification. Local presence is proven for session, | Ed's Vercel account: confirm session/vault/Supabase/Resend/Stripe/OpenAI env names for Production, add CRON_SECRET, then run npm run smoke:post-deploy against the live deployment. Optional small harde |
| checklist:1625 | Apply the pending Supabase migrations before production rollout, | Live Supabase/Postgres credentials (DATABASE_URL or linked supabase CLI) plus Ed's production-rollout go-ahead to apply the 22 pending migrations, then run the DATABASE_URL-gated cross-process test. |
| checklist:1629 | DPO sign-off on the erasure retention schedule. | Ed to engage a DPO/solicitor to rule on the retention schedule (which categories are RETAIN, legal-hold time-box — DPO pack Q1). Follow-on code (expiry/purge for the RETAIN set) unblocks only after th |
| checklist:1947 | Stages hold elements | Ed reserved this build for himself ('I want to personally build the client portal states'). Needs his stage/element design (the 'stunning standard') and an ordering go-ahead vs P5/P6. Mechanical plumb |
| checklist:1984 | Re-enter the Aqua Tag routing config production lost (master site key, | Ed to re-enter unrecoverable production routing data (master tag site mapping, per-site source-to-client routing, site configs, enquiry contact details) in the deployed instance. Wrinkle to tell him:  |
| todo:402 | � Make the Command Centre wait announce itself | Real-browser accessibility-tree/screen-reader walk of the /portal/agency loading transition (announce once, clean removal, focus continuity). Fold into the issue #137 browser matrix (built in wave 5 v |
| todo:584 | � Finish Notepad autosave browser acceptance | Live authenticated browser walk on :3032 notepad: route change + tab exit with dirty drafts (beforeunload + keepalive), offline/refused save → Retry, reload convergence. Then tick checklist:1463 / tod |
| todo:589 | � Finish phase-transition browser acceptance | Quiet live lane (sandbox:fork) + browser walk of a phase transition through all three mounted controls with one forced retryable incomplete, confirming saved details and convergent retry. The 2026-08- |
| todo:624 | � Mounted-accept the settled utility actions | Mounted browser walk with forced fetch/clipboard rejection across Task Templates, Development toolkit, Search Console, and Copy Tag; requires the dev server actually serving (recorded blocker: :3032 a |
| todo:985 | � Free a server + verify the critical flows for real | (1) Live server + browser walks: seeded connect-code journey, enquiry inbox arrival, Aqua Tags detect against Ed's real tagged domain; (2) Ed's open decision on writing one labelled test enquiry to li |
| checklist:666 | Release browser gate. Complete the real two-user/two-project/two-environment | Live env + real browser with two concurrent authenticated users driving the full access-manager journey, stale-session replay, exact-client positive journey, and edit/AI/diff/reload/PR + preview failu |
| checklist:1924 | Full browser authoring round trip | Live browser acceptance of the full authoring round trip (select → exact words → patch → diff/save → tests → draft branch → publish/PR/merge + failure recovery, Librarian, throttle); publish/PR/merge  |
| checklist:1929 | Unsaved-work and project-prefill browser matrix | Headed browser on a sandbox:fork lane: type real dirty state and exercise every destructive transition, proving window.confirm fires before state destruction and cancel preserves work. Acceptance only |
| issue:#162 | #162 in-pane repeat navigation HMR stall. | Interactive browser session against a production build (npm run build + start, no HMR) to walk repeat in-place navigation of /portal/dev-workspace routes and close the phase-18 acceptance gap. Harness |

## Duplicate map

The same work appears in more than one list 39 times. Canonical id first:

- **todo:68** ⟵ checklist:1311 — Same website-editor dead-endpoint contract repair (Split tab gating, promote stub, PublishModal/SitesPage legacy routes, image-variations gating).
- **todo:77** ⟵ checklist:1323 — Same dead-native-blocks / Membership-Affiliate-Donation block honesty bundle; 1323 adds the blockRegistry /api/contact default kill — fold into todo:77 scope.
- **todo:85** ⟵ checklist:1333 — Same static-export renderer parity work (hero/cta/testimonials/product-grid, first-party template fidelity test, stale r033 pin).
- **todo:90** ⟵ checklist:1340 — Same localStorage-backed Sites/Sections/Popup/Customise/PageDetail bundle. Verdicts conflict: 1340 says the Sites slice is unblocked (server /sites CRUD exists 
- **todo:99** ⟵ checklist:1351 — Same campaign-send honest-delivery fix (enqueue-only send stamped as sent; readiness = Boolean(install.enabled)).
- **todo:383** ⟵ checklist:1227 — Same radar sweep fix: hoist Infra probe out of per-agency loop, failure isolation, cadence honesty, call-count tests.
- **todo:397** ⟵ checklist:1231 — Same modal focus-trap sweep (shared dialog primitive + migrate ~51-54 untrapped aria-modal files + sweep test).
- **todo:412** ⟵ checklist:1245 — Same tablist/menu/listbox keyboard-model work; 1245 confirms the Settings aria-controls sub-defect dissolved in the 08-30 restructure — strike that slice from d
- **todo:417** ⟵ checklist:1250 — Same accessible-name bundle (published form blocks, Command Intelligence ids, run-history row, icon-only buttons).
- **todo:427** ⟵ checklist:1262 — Same missing src/app/global-error.tsx + mislabelled error.tsx header + smoke pins.
- **todo:430** ⟵ checklist:1266 — Same PWA 512px/maskable icons + manifest + InstallStep userChoice/one-use-prompt handling; 1266 notes sharp is available for icon generation.
- **todo:433** ⟵ checklist:1271 — Same ShareButtons/Breadcrumb hydration divergence; prefer 1271's fix path (currentUrl/currentPath on ElementContext, already plumbed to every block).
- **todo:437** ⟵ checklist:1276 — Same Range/206/416 support for the three private-media content routes via one shared helper with provider adapters.
- **todo:441** ⟵ checklist:1281 — Same shared recorder helper: MIME negotiation, extension-from-actual-mime, error taxonomy, compensation on the recorded-call path.
- **todo:501** ⟵ checklist:1358 — Same memberships real StripePort over installed SDK + isStripeAvailable/seed/healthcheck honesty; 1358 details the installConfigWithSecrets wiring.
- **todo:506** ⟵ checklist:1364 — Same affiliates StripeConnectPort adapter + capability gating of CTA/payout controls; live test-mode round trip stays an Ed acceptance gap.
- **todo:584** ⟵ checklist:1463 — Same notepad autosave item — code shipped, only the forced-failure browser walk remains (both needs-live-env).
- **todo:589** ⟵ checklist:1470 — Same fulfilment phase-transition item — code shipped and green, only the mounted three-control browser walk remains.
- **todo:600** ⟵ checklist:1485 — Same issue #57 availability-state campaign; 1485 has the richer plan (checkedJsonRead sibling, destructive paths first) — use it as the spec.
- **todo:624** ⟵ checklist:1522 — Same issue #61 forced-rejection acceptance — code done 5/5, only the mounted browser walk remains.
- **todo:635** ⟵ checklist:1538 — Same email-sender setup-flow work: postmark catalog entry, apiKey secretVault field, vault-routed ProviderService, editable Settings, real verifyDomain.
- **todo:641** ⟵ checklist:1545 — Same plugin-health persistence + Radar honesty work (runner/panel half already shipped in both).
- **todo:646** ⟵ checklist:1551 — Same portal-export wizard fork; 1551 adds that a complete unwired implementation sits in github-templates/modules/portal-export. Both risky-needs-decision — led
- **todo:651** ⟵ checklist:1557 — Same provision/publish/deploy idempotency work (durable operation record, milestone states, reuse-on-retry, fault-injected tests).
- **todo:656** ⟵ checklist:1563 — Same upload-lifecycle registry: state records before provider calls, compensation on delete, staged-object expiry, batch-cap honesty.
- **todo:663** ⟵ checklist:1572 — Same close-deal gate: refuse status:sent without reviewable terms, terms field in both forms, reuse canonical delivery path, acceptance gate.
- **todo:668** ⟵ checklist:1578 — Same commercial send delivered:false truthfulness fix (delivery state on pack/payment, no sent-stamp on failure, retry surface).
- **todo:672** ⟵ checklist:1583 — Same acceptance-version-binding work (version/hash on CommercialPack, sent-gated accept, post-acceptance edit rules, stale Checkout invalidation).
- **todo:677** ⟵ checklist:1588 — Same installment-webhook residue: dedupe by subscription invoice ids, exact remainder allocation, persisted cancellation state, behavioural webhook test.
- **todo:715** ⟵ checklist:1667 — Same PluginSettingsPanel mounting for affiliates/memberships/client-crm + surface-less modules + email-sender split-default.
- **todo:751** ⟵ checklist:1737 — Same plan/affiliate delete-dependency work. Inventories shipped; wiring the preview into DELETE/confirmation is unblocked code; the refuse-vs-purge policy itsel
- **todo:757** ⟵ checklist:1745 — Same SOP-delete work: wire the shipped inventory into a dependants read + confirmation surface (decision-free); the retirement policy stays Ed's (issue #176).
- **todo:763** ⟵ checklist:1752 — Same graph-aware capital-plan validation (unique ids, reference resolution, arithmetic invariants, vote cap, dangling-link guard).
- **todo:770** ⟵ checklist:1761 — Same CompanyProfile optimistic-concurrency (409 on stale updatedAt) + quarterly-review lock immutability.
- **todo:777** ⟵ checklist:1770 — Same legal-register delete guard: dependency inventory mirroring sopDependencies, 409/refuse or archive path, honest file-deletion errors.
- **todo:783** ⟵ checklist:1778 — Same governance company-scoping fix (recordBelongsToCompany on legal rows/declarations/sub-processors/erasure clients + stale-scope handling).
- **todo:857** ⟵ checklist:1863 — Same last sliver of #119: emit disputed event only on creation, report deduped on redelivery, pin with a fresh-seen-set test.
- **todo:402** ⟵ checklist:1236 — Same loading-skeleton live-region item. Code half fully shipped (PortalViewportLoading) — 1236's checkbox can be ticked; only the AT/announcement browser proof 
- **todo:746** ⟵ checklist:1729 — Same lead archive/restore/purge work — shipped and browser-accepted per 1729; the only residue is todo:746's forced-partial-failure test in smoke-lead-archive.t


---

## Bookkeeping — what was ticked, and what was deliberately not

Updated 2026-08-30 after wave 3.

### Ticked in the trackers

Twelve items were found by triage to be **already shipped and never struck
through**. These are now `- [x]` in their own file, because source proves them
done — no code was written for them in this campaign:

`todo.md` 682 (central session revocation), 860 (showcase fixture seeded once,
not reset), 952 (Aqua Tags nav entry), 958 (the fulfilment spelling split's
user-facing half), 959 (canonical contacts pick, enforced in source), 961 (the
`adapters.ts` "dead code" line — it is NOT dead; two real importers), 969
(the three Supabase creds in `.env.example`).

`checklist.md` 1236 (Command Centre loading status), 1605 (merge to `main` —
PR #3 merged on 2026-08-23), 1729 (lead archive is reversible since #62).

`LOOP-PROGRESS.md` queue entries 2 and 3 (Scouting Stage 1, inbox premium
messaging) — both shipped in `7917318`; entry 4's residual double-render was
fixed in wave 1.

### NOT ticked, on purpose

Every item this campaign actually wrote code for is left **unticked**, even
where the implementation is complete and test-pinned. Almost all of them
returned `partially-implemented` for the same two honest reasons:

1. **Browser acceptance is unrun.** This container has no display, so the
   viewport/keyboard/AT walks the items demand (and that `docs/development/tests.md`
   records as the closing step) cannot be performed. Code-complete is not
   browser-accepted, and this repo's own evidence labels forbid conflating them.
2. **A policy or credential is Ed's.** `todo:751`/`757` retirement policy,
   `todo:501`/`506` live Stripe test-mode round trips, `todo:99` durable-worker
   vs synchronous-send product split, `todo:104` database-native version
   constraint (needs `DATABASE_URL`), `todo:386` `@sentry/nextjs` install.

Ticking those boxes would claim the closing evidence exists. It does not.
The per-wave commit messages name exactly what shipped; this ledger names what
each item still owes. Both are more useful than a tick.

### Still open on the trackers after this campaign

`todo:600` (issue #57) is a bundle of roughly fifteen families; eleven are
closed, four are named as untouched in the wave 2 journal and the issue should
stay open. `todo:656`'s staged-object lifecycle/expiry is unbuilt. `todo:386`
has four named open pieces. These are progress, not completion.

---

## Browser-matrix baseline — 2026-08-31, first real run

`npm run browser:matrix` (built in wave 5, `scripts/browser-matrix.mjs`) was run
for the first time against a live dev server: real Chromium 141, 13 pages × 17
viewports, **1,326 checks**. It drives actual layout, focus, axe and the console
— unlike `smoke-ux.mjs`, whose "viewport" was a substring in a User-Agent header.

**Verdict: RED. 352 failing checks.**

| category | failing |
| --- | --- |
| focus (a stop with no visible indicator) | 203 |
| axe (serious/critical) | 85 |
| console errors | 44 |
| failed network requests | 17 |
| horizontal overflow | 3 |

This is a **baseline, not a regression signal** — the gate did not exist before
this wave, so nothing had ever measured these. The failures are overwhelmingly
app-wide rather than anything wave 5 touched: the single most common one,
`button[Working as Owner]` with no focus indicator, is a global chrome control
that appears on nearly every page. Wave 5's own subject — modal focus traps —
is **not exercised at all** by this run, which walks pages without opening
dialogs.

Real defects it surfaced that are NOT accessibility issues:

- `/portal/account` answers **500 from `/api/portal/mfa/enrol`**, twice, on every
  viewport. Multi-factor enrolment is broken.
- `/portal/agency` logs a **React hydration mismatch** — server and client
  markup disagree, and React says it will not patch it up.
- Three genuine **horizontal-overflow** failures, which the house browser rule
  forbids outright.
- A **critical `button-name`** violation on `/` at mobile portrait: a button with
  no accessible name, which is precisely what `todo:417` set out to eliminate.

None of this is fixed here. It is measured, recorded and repeatable, which is
the thing that did not exist before. The follow-up work is its own campaign.

---

## The test harness has two large holes — both pre-existing, both verified

Found while gating waves 4–6, and worth more attention than anything in the
to-do list, because they decide how much every other green result is worth.

### 1. The whole website-editor smoke gate does not run

`npm run smoke:website-editor` fails at import for **every one of its 25+
suites**:

```
src/built-ins/modules/website-editor/src/lib/ids.ts:8
export { makeId, slugify } from "@/engines/editor/elements/ids";
SyntaxError: The requested module '@/engines/editor/elements/ids'
             does not provide an export named 'makeId'
```

**Verified pre-existing**, not campaign-caused: reproduced in a throwaway
worktree at HEAD (`e6307dd`) *and* at the pre-campaign base (`5f0876e`), with
the identical error. The website editor has been shipping with its entire
dedicated gate silently red.

### 2. No built-in plugin's HTTP handlers can be tested at all

Any `@/…` named import from inside a plugin directory resolves to a module
exposing only `default`: the plugin's own `package.json` declares
`"type": "module"` while portal's root declares none, so tsx treats portal
`.ts` files as CJS and ESM named-export linking fails. This is the same root
cause, and it is what the 31 baseline failures are.

The consequence is not "31 tests are red". It is that **every behavioural test
of a plugin's API layer is disabled** — a handler can be rewritten and no test
in the repo will object. Wave 4's `todo:677` hit this directly: its webhook
behaviour had to be moved into the service layer to be testable at all.

### Why this matters more than it looks

Both holes are invisible in the headline number. The canonical suite reports
~5,600 passing, and that is true — but it is passing over a surface that
excludes the website editor's own gate and every plugin HTTP handler. A green
run is weaker evidence than it appears, and no amount of new tests inside those
areas will change that until the module resolution is fixed.

**Recommended next action, ahead of remaining to-do items:** fix the CJS/ESM
boundary (align `type` across the plugin and root manifests, or route the
shared imports through a build-condition-aware entry), then re-run both gates
and see what was hiding behind them.

---

## Browser matrix, run 2 — 2026-08-31, after wave 8

Re-run because wave 8's Command Centre work edits the portal pages the matrix
walks. **It caught a real defect that no unit test could see**, and the fix is
proven by the same measurement.

| category | baseline | wave 8, before fix | wave 8, after fix |
| --- | --- | --- | --- |
| focus | 203 | 204 | 204 |
| axe | 85 | 85 | 85 |
| console | 44 | **188** | 44 |
| network | 17 | **187** | 17 |
| overflow | 3 | 3 | 3 |

### The defect: a broken Edge bundle answering 404 for healthy routes

`src/instrumentation.ts` (added wave 3, `todo:386`) statically imported
`observabilityCapability`, which resolves the optional Sentry package using
`node:module` and `node:path`. Next loads `instrumentation.ts` in **both** the
Node and the Edge runtime, so those Node builtins were pulled into the Edge
instrumentation bundle, which then failed to compile.

A broken edge bundle does not announce itself. It answers **404 for routes that
are completely healthy in source** — the matrix found `/api/portal/chrome/layout`
plus both telephony endpoints 404ing on *every* viewport, which is what took
console from 44 to 188 and network from 17 to 187.

Nothing else caught this. `tsc` was clean, the 5,758-test canonical suite was
clean, and `npm run build` exited 0 — the Edge failure surfaces only as a
warning during build and as a 404 at runtime.

Fixed with Next's documented pattern: the capability probe is now loaded behind
`process.env.NEXT_RUNTIME === "nodejs"`, so it is never bundled for Edge. On
Edge the boot breadcrumb still records, with capability reported as
`unknown-on-edge` rather than guessed. Verified by measurement — the route went
404 → 401 (its correct no-session answer), and the two categories returned to
baseline exactly.

**This is also the leading suspect for the Vercel failure on `cff860d`.** Not
proven: Vercel's logs are unreachable from here, and the local build succeeds
either way. Wave 8's deployment is the test.

### One net-new focus failure, named

`/login` at mobile-landscape now reports `button[Working as Owner]` with no
visible focus indicator, where the baseline run had all 12 stops clean. It is
the same global chrome control already failing across the app, now reaching one
more breakpoint — not a new class of defect.

### The highest-leverage accessibility fix, quantified

Five global chrome controls account for the overwhelming majority of all 204
focus failures:

| control | failing stops |
| --- | --- |
| `button[Working as Owner]` | 130 |
| `button[Open navigation menu]` | 69 |
| `button[Use dark mode]` | 51 |
| `a[Back to website]` | 40 |
| `a[Team settings]` | 34 |

These are a handful of components, not a hundred screens. Giving them visible
focus indicators would clear most of the focus column in one pass — by far the
best accessibility return available, and now measurable rather than guessed at.

---

## Vercel: two failures, cause UNDETERMINED — and a correction

`c832188` (wave 9) failed to deploy. That is the second failure on this branch,
and the two have **different shapes**:

| commit | wave | outcome | time to fail |
| --- | --- | --- | --- |
| `cff860d` | 7 | Error | ~3 minutes |
| `407cb5b` | 8 | **Ready** | ~4 minutes |
| `c832188` | 9 | Error | **~46 minutes** |

A 3-minute failure looks like a build error. A 46-minute one looks like a
timeout or a hang. They are probably not the same fault, and neither is
diagnosable from this container: Vercel's logs need auth this session does not
have, and `npm run build` exits 0 locally on **both** failing commits.

### Correction: the "2.5GB build output" figure was wrong

Earlier notes in this ledger and in the session's check-ins said the build
output had grown to ~2.5GB across 377 routes, against ~1.48GB recorded earlier
in the project, and offered that as the leading hypothesis. **That was a
measurement error.** `du -sh .next` includes `.next/cache`, which is the local
build cache and is never deployed. The actual artefacts are:

```
2.5G  .next          ← includes the local build cache
2.5G  .next/cache    ← NOT deployed
 58M  .next/server   ← deployed
 12M  .next/static   ← deployed
```

Roughly **70MB deployed**, which is healthy and nowhere near a size limit.
Build size is not the problem, and the earlier hypothesis should be dropped
rather than carried forward.

### A hypothesis raised and then withdrawn

Wave 9 added `requireCurrentAccessActor()` — which forces
`ensureHydrated({ fresh: true })` — into `listOperationalAlerts()`, which six
render paths call including two layouts. That looked like it might have put a
forced backend read into every page of a 301-page prerender.

**It does not.** Every portal route builds as `ƒ` (server-rendered on demand),
not `○` (prerendered), so none of them run at build time. The hypothesis is
withdrawn rather than left standing as a plausible-sounding non-explanation.

The call was still made lazy — it now resolves only when an open action
actually names a client — because a forced fresh backend read in a hot render
path is worth removing on its own merits. That is a **runtime** improvement,
**not** an evidenced deploy fix, and must not be described as one.

### What would actually settle it

The Vercel build log for `6hDw2Zx8e8tjcxL7pTPMhgxtp4ae`. Until someone reads
it, the cause is unknown. Guessing further from here would just produce more
confident-sounding wrong answers.

---

## Post-merge follow-up — 2026-08-31

### FIXED — the module boundary (the campaign's own top recommendation)

Root `package.json` had no `type`; all twelve plugin packages declared
`"type": "module"`. Removing those twelve declarations aligned them with the
root and ended the CJS/ESM split.

| | before | after |
| --- | --- | --- |
| website-editor gate | **0 / 49 files** | **49 / 49** |
| canonical suite | 5,772 tests · 24 fail · 12 cancelled | 5,799 tests · **1 fail** · 0 cancelled |
| module suites | 229 / 230 | **252 / 252** |

The test count RISES because suites that used to die at import now run. Two
consequences of uniform CJS were fixed rather than worked around: one
top-level await wrapped in an async IIFE, and `import.meta.dirname` (undefined
under the CJS transform) replaced with `dirname(fileURLToPath(import.meta.url))`
in six suites — the pattern `smoke-next-route-contracts.test.ts` had already
documented after hitting this alone.

The one remaining failure, `smoke-public-contact.test.ts`, reads
`/home/user/aquaoasis-web/website/components/ChatBot.tsx` — a sibling
repository not present in this container. Environmental, not a defect.

### FIXED — MFA enrolment answered 500 on every viewport

`createRouteSupabaseClient` calls `requireSupabasePublicConfig()`, which
THROWS when Supabase is absent; an uncaught throw in a route handler is a 500.
So a deployment with no Supabase credentials reported "two-factor is broken"
rather than "two-factor is not set up here". All three MFA handlers now
consult `mfaUnavailableResponse()` and answer **503 with the reason**. Pinned
by a sweep that counts guards against handlers, so a new MFA handler cannot
silently omit it.

### NOT FIXED — the focus-ring investigation failed, and this is what was ruled out

The five-control focus fix did **not** land. Three hypotheses were tested
against the real browser and all three are **disproven**:

1. *Specificity* — the global rule uses `:where(...)` (zero specificity). Not
   the cause: adding an `:is(...)` copy changed nothing.
2. *Tailwind preflight* — it sets `border: 0 solid` on `*`, **not** `outline`.
3. *Cascade layers* — the rule sits in `@layer components`, which loses to
   `@layer utilities`. An UNLAYERED copy was served (verified present in
   `document.styleSheets`) and the elements still computed `outline-width: 0`.

The decisive and still-unexplained observation: on the six failing controls,
`:focus-visible` **matches**, CDP reports the global outline rule as the only
matching outline rule, and yet an inline `outline: 3px solid red !important`
on a connected element **still computes to `0px`**. That is not a cascade
problem. Something structural prevents outline rendering on these specific
elements and it was not identified.

The speculative CSS was reverted rather than shipped — it demonstrably did
nothing, and leaving it with a confident comment would have been worse than
leaving the bug. Anyone picking this up should start from that
`!important`-is-ignored fact, not from the cascade.

### Two findings recorded on `/portal/agency`

- The React **hydration mismatch is gone** — resolved by the plugin-registry
  graph split in PR #6, not by anything aimed at it.
- A genuine **render-time side effect** remains: *"Can't perform a React state
  update on a component that hasn't mounted yet… you have a side-effect in your
  render function."* This matches the "hidden render-time mutation" that
  `CLAUDE.md`'s continuation item 6 already lists as open residue. React does
  not name the component, so it needs its own hunt.
- One 404 resource request on that page, uninvestigated.

### FIXED — the read path rewrote the database on every agency page load

Ed's instinct, investigated and confirmed. `upsertPerson()` is called by
`listOperationalAlerts()` while building the attention feed, and that feed is
built by BOTH the agency layout and the agency page — so it ran on **every
agency render**. Its `existing` branch then wrote unconditionally:

- `updatedAt: now` with no check that anything had changed;
- `mutate(...)`, which dirties and re-persists the whole PortalState blob;
- `emitDurable({ name: "person.updated" })` — a durable outbox row.

So on any tenant with website enquiries, every page load re-stamped every
matching Person, rewrote the state blob, and appended **one phantom
`person.updated` event per enquiry per render** — an outbox announcing changes
that had not happened, and an `updatedAt` recording when somebody last *looked
at a page* rather than when the person last changed.

`upsertPerson` now compares the computed record against the existing one on
everything except `updatedAt` itself and returns early when they match. The
phone-sharing sweep is a real state change, so its presence still forces the
write through. Pinned two ways — an identical re-upsert must move neither
`updatedAt` nor the outbox, and a genuine edit must still write (a no-op guard
that swallows real edits would be worse than the unconditional write).

Not caught by an empty test tenant: the gate lane's state file was byte-identical
across a page load, because there were no enquiries for the write path to act on.
It is visible in the source, and in the comment `operationalAlerts.ts` already
carried about "idempotent read-path side effects (person upserts)".

### MFA: the count got worse while the behaviour got better

Worth stating plainly. The browser matrix's network column went 17 → 123,
and 34 of those are `503 /api/portal/mfa/enrol` — the honest refusal that
replaced the 500. The matrix counts any status ≥ 400 as a failed request, so
a truthful 503 scores exactly like the misleading 500 did.

The remaining defect is one level up: `/portal/account` still *requests*
two-factor enrolment on a deployment that has no Supabase auth. The honest
surface would not offer it at all. That is a UI change, not a route change,
and is not done.

### Browser matrix, run 3 — after the module-boundary and MFA work

| category | baseline | run 2 | run 3 |
| --- | --- | --- | --- |
| focus | 203 | 204 | 204 |
| axe | 85 | 85 | 85 |
| console | 44 | 44 | **31** |
| network | 17 | 17 | 123 (34 × the MFA 503, see above) |
| overflow | 3 | 3 | 3 |

The `/portal/agency` 404 recorded in run 2 no longer reproduces. The
render-time side-effect warning did not reproduce either — it is timing
dependent, so it needs a different approach than a browser walk.

---

## Browser matrix GREEN — and a correction to three entries above

`1,308 passed · 0 failed · 18 observations.` The gate that opened at **352
failing checks** is now clean, and the observations are all named dev-server
recompilation rather than anything unexplained.

**Every focus figure recorded above is wrong, and the recommendation built on
it was wrong.** This corrects, rather than deletes, these entries:

- *"Verdict: RED. 352 failing checks"* — 208 of the 352 were the gate measuring
  wrong, not the app being wrong. The real count was **144**.
- *"focus | 203 | 204 | 204"* in all three matrix comparison tables — the real
  number was **0**, at every one of those runs. The rings were there.
- *"The highest-leverage accessibility fix, quantified"* — the five chrome
  controls named there, with 130/69/51/40/34 failing stops between them, have
  **working focus indicators**. That table measured a sampling bug. Acting on
  it, as it recommended, would have meant editing correct CSS until a broken
  measurement went quiet. (An earlier wave did attempt exactly that, could not
  make it work, and reverted the speculative CSS rather than ship a no-op —
  that judgement is now vindicated for a reason nobody had yet found.)

### What the gate was actually measuring

The chrome controls declare `transition-property: all` at `0.14s`. Reading
computed style in the same task as the Tab press samples the START of the
transition. The same element, measured live:

```
IMMEDIATE   : outline solid 0px
transition-property: all | duration: 0.14s
AFTER 600ms : outline solid 2px
```

Three further gate defects surfaced while confirming it:

1. **4 "keyboard traps"** on `/portal/account/preferences`. A trap is the same
   NODE focused repeatedly; the detector compared signature strings built from
   tag + id + textContent, all three empty for a bare `<input>`. Nine
   consecutive unlabelled checkboxes read as one element focused nine times.
2. **The baseline shadow was written into a `data-` attribute** on React-owned
   nodes, producing a hydration-mismatch diff on the next dev recompile that
   the console verdict then scored as an application defect. The gate was
   manufacturing the failure it reported.
3. **`devServer` was proven too late.** It is derived from the target's own HMR
   socket — correct — but the listener was attached inside the per-page loop, so
   the FIRST page of every run was judged before any socket existed and its
   cancelled Turbopack chunks scored as real failures. It showed as `/` failing
   on exactly one viewport of seventeen, which is the signature of an artefact.

All four are fixed, and each is pinned by a test proven two-sided. The focus
walk now polls within a budget derived from the element's own declared
transition and stops the moment the ring appears, so the common case costs
nothing. The budget has a **250ms floor**: `duration + 40ms` still reported the
topbar's "Working as" button ringless at 1920×1080, because a CSS duration says
how long an animation runs, not when the browser gets round to starting it.

### The 144 real failures, all fixed

| category | at baseline | now | what it was |
| --- | --- | --- | --- |
| MFA console + network | 34 | 0 | `/portal/account` probing an endpoint whose 503 is permanent on this deployment |
| axe critical `button-name` | 6 | 0 | the site's chat launcher hides its own label below 680px, leaving an `aria-hidden` "A" |
| axe serious `color-contrast` | 51 | 0 | 4.06:1, 3.99:1, and 2.47:1 — the last a hardcoded light-mode teal on a dark surface |
| axe serious `definition-list`/`dlitem` | 51 | 0 | `dl > div > div > dt`, and dt/dd with no `<dl>` ancestor at all |
| axe serious `scrollable-region-focusable` | 6 | 0 | the pipeline board scrolls, and with no leads contains nothing focusable |
| horizontal overflow @ 200% zoom | 3 | 0 | four flex/grid items sized by their min-content width, plus a canvas bleeding into a shell that isn't there |
| favicon 404 | 1 | 0 | no `icons` in root metadata, and the static pages under `public/` inherit none |

The overflow row is WCAG 1.4.10 (Reflow), not cosmetic: at 200% zoom on a 375px
phone the CSS viewport is 187px, and the site header was pushing the Menu
button — the only navigation at that width — off the screen entirely.

### Verification

Canonical suite **5,812 tests / 5,809 pass / 1 fail / 2 skip**. The single
failure is `smoke-public-contact.test.ts`, which reads
`/home/user/aquaoasis-web/website/components/ChatBot.tsx` — a sibling repository
not checked out in this container. It is the same single failure as the
pre-change baseline, so this work introduced **zero** new failures; the failure
list was diffed by name, not by count. Module suites 252/252, website-editor
49/49 files, `npm run typecheck` clean.

`npm run build`: success, 301 static pages, **56M `.next/server` + 12M
`.next/static`**. One warning, expected and deliberate: `observabilityCapability.ts`
resolves the optional Sentry package through a dynamic require, which webpack
reports as "Critical dependency: the request of a dependency is an expression".

Evidence label: **local-browser** against a `next dev` lane, not deployed-live.

---

## The Vercel failures: a real cause found and fixed — but NOT the whole story

Five of eight deployments failed across two pull requests. On 2026-08-31 a
genuine, reproducible defect was found that produces exactly the observed
failure, and it is fixed. It is **not proven** to be the cause of all five, and
the section headed "What this does NOT claim" at the end says why.

**`portal/package-lock.json` was generated on a Mac.** `lightningcss` and
`@tailwindcss/oxide` ship their native binaries as per-platform *optional*
dependencies, so the lockfile recorded `lightningcss-darwin-arm64` and
`@tailwindcss/oxide-darwin-arm64` — and **no Linux build at all**. `npm install`
installs what the lockfile records, so on Linux both packages arrive with no
binding and the first CSS module kills the build:

```
Error: Cannot find module '../lightningcss.linux-x64-gnu.node'
  node_modules/lightningcss/node/index.js
  ← @tailwindcss/node ← @tailwindcss/postcss ← next's CSS config
```

`@tailwindcss/oxide` names the npm bug behind it in its own error text
(npm/cli#4828).

### Why every local build passed, including the "cacheless" one

A Linux binary was sitting in **`/home/user/aquacrm/node_modules/`** — the
repository ROOT, one directory above `portal/`. Node's resolver walks up parent
directories, found it there, and satisfied every local build with a file no
deployment would ever have. **Vercel's Root Directory is `portal`**, so there is
no parent to walk up to.

This is why the three earlier investigations cleared the wrong suspects and were
right to: the build genuinely does pass here, `rm -rf .next` genuinely does not
change it, the plugin packages genuinely are not npm workspaces, and PR #6's
`f9c4318` genuinely did fail with no `package.json` change. Every one of those
findings stands. They were all measuring a machine that had the binary.

**The lesson to keep: `rm -rf .next && npm run build` is not a clean build.** It
reuses `node_modules`, and — where the deploy target has a Root Directory —
everything above it. Only checking out that directory alone reproduces the
deploy.

### Reproduced, then fixed, then re-proved

Checked out `portal/` on its own and ran Vercel's exact commands,
`npm install --legacy-peer-deps && npm run build`:

| | before | after |
| --- | --- | --- |
| `require("lightningcss")` | throws | resolves |
| `require("@tailwindcss/oxide")` | throws | resolves |
| `npm run build` | **fails** at the first CSS module | **exit 0**, 301 pages |

The fix is two lines in `package.json`: `lightningcss-linux-x64-gnu@1.32.0` and
`@tailwindcss/oxide-linux-x64-gnu@4.2.4` as `optionalDependencies`, pinned to
their parents' exact versions. Both are `os: ["linux"]`, and the darwin entries
are untouched, so a Mac checkout installs exactly what it did before.

### Pinned so it cannot come back quietly

`scripts/smoke-deploy-lockfile.test.ts` asserts the RULE, not the two names: any
dependency declaring per-platform native binaries must have its Linux x64 build
recorded in the lockfile. It reads the lockfile rather than `node_modules`, so a
local machine that happens to have the binary cannot mask it, and it also pins
the exact-version requirement (a caret range would let npm pair 1.32.0 with a
1.33 binary — the same failure, again only on the deploy machine) and refuses
`--no-optional` in `vercel.json`, which would defeat the whole file.

Verified two-sided against the **real** pre-fix lockfile, not a synthetic one:
it names `lightningcss` and `@tailwindcss/oxide` and nothing else.

### What this does NOT claim — and the evidence that forces the caveat

**Vercel's outcome is not a function of the tree.** Within twenty minutes, two
consecutive commits on this branch behaved differently:

| commit | contents | Vercel |
| --- | --- | --- |
| `9f0ecc4d` | five markdown/JSON doc files | **Ready** |
| `3bcef67d` | two markdown files | **Error** |

`git diff 9f0ecc4d 3bcef67d -- package.json package-lock.json` is **empty**.
Neither commit touched a line of source. One deployed, one did not.

So something on Vercel's side varies between builds of functionally identical
trees. The most plausible candidate is its `node_modules` build cache — a
restored cache carrying the Linux binary would pass, a cold install would fail —
but that is an inference, not a measurement: Vercel's logs need an
authentication this session lacks and outbound HTTPS to `*.vercel.app` is
proxy-blocked, so the cache state is not observable from here.

What IS established, and stands on its own:

1. The lockfile has **never** recorded the Linux binary. Checked across all eight
   commits that touched it, back to 2026-08-11: `lightningcss-linux-x64-gnu`
   appears only inside `lightningcss`'s own list of platform variants, never as
   an installed entry.
2. An isolated `portal/`-only checkout on Linux x64 **deterministically fails**
   before the fix, with exactly the error above, and **deterministically passes**
   after — same machine, same command, same Node.

So the fix removes a real defect that produces this exact failure and makes the
build independent of whatever Vercel's cache happens to hold. It does not follow
that it explains all five past failures, and **a green deployment now would be
weak evidence either way** — `9f0ecc4d` was already green without it. Treat a
further failure as a second, separate cause rather than as this one returning.

---

## The `/portal/agency` render-time side effect: narrowed, and the class closed

`CLAUDE.md` item 6 lists a "hidden render-time mutation" as open residue, seen as

    Can't perform a React state update on a component that hasn't mounted yet.

It is timing dependent — it did not reproduce across **51 loads** of that page in
three consecutive browser-matrix runs — so a browser walk is the wrong
instrument. React's warning names a STRUCTURAL mistake, and structure can be read
from source whether or not the timing lines up on the day you look.

**Result: across 750 client components, zero cross-component render-phase
updates.** No prop callback, `dispatch`, `emit` or `notify` is called from a
render body anywhere in the app.

The only render-phase state updates that exist are three of React's documented
"adjusting state when props change" — a component calling its OWN setter behind
a guard, which React re-renders immediately and never warns about:

| component | why |
| --- | --- |
| `BattleTableWorkspace` | reconciles navigation against the scopes it was given |
| `AppConfigEditor` | re-syncs when the server hands it a newer revision |
| `EmailButton` | kills a draft when the recipient changes underneath it |

Each already carried a comment explaining itself. All three are correct.

**So the warning is not a synchronous cross-component update in application
code.** What remains: an async callback — a promise, timer or observer —
resolving before its target mounts, or something inside a dependency. That is a
real narrowing, not a resolution, and the item stays open with the search space
cut down.

`scripts/smoke-render-phase-state.test.ts` keeps the negative result true. It
fails if any component updates another during render, and separately if one of
the three adjustments loses its guard (unguarded, they re-render forever). It
also asserts the three are still present, so a refactor cannot produce a clean
sheet for the wrong reason, and asserts the scan reached 500+ files, so a broken
collector cannot report "none found" from having looked at nothing. Verified
two-sided: a prop callback added to a render body fails it; removing
`BattleTableWorkspace`'s guard fails it. 3.3s, four assertions.
<!-- AQUACRM_SOURCE_END path="docs/development/CAMPAIGN-LEDGER.md" -->

---

<a id="source-docs-development-cloud-resume-md"></a>

## Source document — `docs/development/CLOUD-RESUME.md`

<!-- AQUACRM_SOURCE_START path="docs/development/CLOUD-RESUME.md" sha256="03458cdf18bf59b0c4e89981c5bae78202b0b045cdc83b8569d6b3c6ed0a12be" -->
# Cloud resume brief — 2026-08-30

Ed switched to cloud mid-session. This commit is the FULL local state pushed to
main on his explicit instruction ("get all my local onto main, i dont care if
it breaks"). Read this first, then LOOP-PROGRESS.md, AUDIT-2026-08-30.md and
ED-QUESTIONS.md — those three are the live queues.

## State at handoff

- Suite was **5,494 / 0 fail / tsc clean** before the final ~30 minutes of
  work. Since that run: getSession memoization (agent, its own 137/137 pass),
  the Kanbans feature (complete build, tsc clean, its new smoke
  `smoke-journey-kanbans-desk.test.ts` written but NOT yet executed), and the
  route census moved 156→158. **First job on resume: run the canonical suite**
  — `NODE_OPTIONS='--conditions react-server' node --import tsx --test
  scripts/smoke-*.test.ts 'src/built-ins/modules/!(website-editor)/src/__smoke__/*.test.ts'`
  — and fix anything red before new work. Expect possible small failures in
  the kanban smoke (never run) and anything pinning clients/page.tsx or
  [slug]/page.tsx source.
- An in-flight design (Plan agent) for the proxy/access-kernel alignment (audit
  item A1) did not return before handoff — re-derive from
  AUDIT-2026-08-30.md's A1 row if needed.

## What landed today (all in this push)

Settings restructure (16 tabs, aliases, search, editable identity via new
/api/portal/agency/identity), timezone picker, logs pagination, Tools palette
(savedTools + savedToolUrl allow-list), Operations belt + luxury finish,
workspaces→Operations move, My Radar topbar control (+ gated
/api/portal/intelligence/my-radar), inbox merge (3 tabs + cog modal + combined
Needs-you count) + premium messaging redesign, scouting tab + outreach
(server-gated + server-recorded) + quota rings/streak, convert→fulfilment
handoff, growth governed workspace, Kanbans desk + custom boards
(/api/portal/pipelines/boards + /cards), MFA lockout fixes + cold-start
hydrate/flush, password-reset provisioning + scoped nonce restore, founder
email gate closed on the SEND path (name/reply-to too), per-send idempotency
keys, prospect-aware suppression, department stamp gating via
agencyBasePanels, role-filtered search registry, custom CSS actually injected
(?nocss=1 real), CSV formula defusal, realm-runtime LRU cap, getSession
request-memoization.

## Live queues (in priority order)

1. Canonical suite green (above).
2. AUDIT-2026-08-30.md — A1 (proxy↔kernel) and A8 remainder (lazy stations,
   settings pane splits, SMTP deadline, inbox waterfalls), activity-log races +
   windowed All, inbox URL resync, pipeline search → growth.leads.
3. LOOP-PROGRESS.md queue — command-centre regrouping design
   (scratchpad/design-command-centre.md may be gone on cloud; judged flags are
   reproduced in LOOP-PROGRESS), info-icons pass, website demo Stage 1
   (per-visitor realms — see the one-sentence rule in the demo plan: NOTHING
   demo ever in the live realm), performance re-measure.
4. ED-QUESTIONS.md — blocked on Ed (D1 customer passwords, Resend domain,
   Twilio, demo retention, terms).

## Rules that keep this codebase safe (hard-won today)

- Grep scripts/*.test.ts before "fixing" anything absent — tests pin decisions.
- Never run the smoke suite while a file-backend dev server shares .data.
- Browser-verify on a fork lane via 127.0.0.1 ONLY (localhost cookie jar is
  shared across ports and will clobber Ed's live session; allowedDevOrigins
  covers 127.0.0.1; /dev mints the cookie before its redirect hops host).
- docs/0*.md and docs/reference/* are GENERATED — edit sources, re-run
  consolidate-authored-docs.mjs / generate-symbol-reference.mjs.
- website-editor __smoke__ files need OPPOSITE node conditions — never sweep
  them into the main suite glob.
<!-- AQUACRM_SOURCE_END path="docs/development/CLOUD-RESUME.md" -->

---

<a id="source-docs-development-ed-questions-md"></a>

## Source document — `docs/development/ED-QUESTIONS.md`

<!-- AQUACRM_SOURCE_START path="docs/development/ED-QUESTIONS.md" sha256="379784a1246170ccd77969d495d85d49b8b81046c6ecfeac6c48c855f26a2c5a" -->
# Questions for Ed — blocked decisions, work continues around them

**Started 2026-08-30.** Per your instruction: anything needing your input is
written here and skipped; everything else proceeds. Answer inline or in chat —
each item says exactly what it unblocks.

---

## Q1 — Do end-customers get PASSWORD sign-in, or is magic-link their only door?

`smoke-mfa-doors.test.ts:56` says magic-link is their door, and their signup
provisions no Supabase identity — so today a password-reset email would arrive
and `/login` would still refuse them.

- **If passwords: yes** → I wire the login route (spec 4 edit 6, ready).
- **If magic-link only** → I change the customer portal's "Reset password"
  button to send a magic link instead.

*Everything else in the reset flow is already fixed and shipped either way.*
**Unblocks:** end-customer password reset. **Recommendation:** magic-link only —
fewer credentials to support, and the flow already exists.

## Q2 — Resend sending domain (ACTION, not a question)

`.env.local` uses `onboarding@resend.dev` — Resend's sandbox sender, which only
delivers to *you*. Until a real domain is verified in Resend (DNS records) and
`RESEND_API_KEY` + a real from-address are in Vercel, **no customer ever
receives an email in production**, whatever I build.

**Unblocks:** password reset, enquiry notifications, all transactional mail.

## Q3 — Twilio account + numbers

The outreach journey's calling half (press-to-call, number picker, inbound
answering) is built/being built against the existing telephony layer, but live
calls need: your Twilio account SID/auth token in Connections, at least one
purchased number, and the voice webhook URL set in Twilio's console to
`<production-domain>/api/webhooks/twilio/voice`.

**Unblocks:** real dialling and inbound answering. Everything ships
webhook-verified and dormant until then.

## Q4 — Public demo: how long before a visitor's sandbox is wiped?

The self-serve demo design is staged (per-visitor data realms). The consent
copy must state the retention period, and the reaper enforces it. Pick one:
**24h / 72h / 7 days**. **Recommendation:** 72h — long enough to come back
after a weekend, short enough to keep storage trivial.

Also: **do not publish any "we delete after X" wording until I confirm the
reaper is live** — deletion machinery didn't exist until this work.

## Q5 — Terms of service + privacy wording for the demo gate

I build the checkbox, record consent with a timestamp and version, and link the
pages — **the words are yours** (legal). A name + phone number is personal
data: it needs a lawful basis and sits under your governance/DPO erasure
surface (I'm wiring demo signups into it). You may want your solicitor's eyes
on the demo T&Cs before the gate goes live.

**Unblocks:** the public demo gate going live (build proceeds behind a flag).

## Q6 — Aqua as a public subscription product

You said: sell AquaCRM as a subscription to agencies. Pricing, plan tiers, and
Stripe products are yours to define. The demo/website work does NOT wait on
this — but the pricing page will ship with placeholder tiers until you set
real numbers.

## Q7 — Supabase cutover residue (from the live preflight)

1 portal user would be **locked out at cutover** and 2 auth users have no
role/agency. These need reconciling in the Supabase dashboard before cutover.
Run `node scripts/supabase-cutover-preflight.mjs` to see the current list.

## Q8 — Apply the written-but-unapplied database migrations (ACTION)

The immediate coordinated-storage path has **four ordered database
preconditions**, as defined by `docs/data/MIGRATION-PLAN.md`:

1. `20260809090000_atomic_datastore_patches_and_history.sql`;
2. `20260825130000_product_workspace_leases.sql`;
3. `20260902090000_merge_app_datastore_patch_objects.sql`; then
4. `20260902091000_product_workspace_lease_renewal_fencing.sql`.

The wider relational extraction still separately requires the enquiry agency
column, Master Inbox tables and a version-controlled `rls_auto_enable()`
definition; those are not extra members of this four-migration ordering.

**Unblocks:** live coordinated-storage/concurrency acceptance and later migration
phases. Apply through the controlled production migration process, then verify
schema status, RLS and the remote concurrency cases; checked-in SQL alone is not
deployment evidence.

## Q9 — Which response SLA is canonical?

Two "response compliance" numbers exist side by side: the Radar/command KPI
uses your **configured** guardrail (`speedToLeadTargetMinutes`), while the
commercial formula `response-sla` **hardcodes 5 minutes**. Dedup
(MIGRATION-PLAN phase 7) needs the business answer:

- **Recommendation:** the configured guardrail is canonical everywhere;
  5 minutes stays only as the default value of that guardrail.
- Alternative: keep a fixed 5-minute industry benchmark as a *separate,
  clearly-labelled* metric next to your own SLA.

**Unblocks:** folding `response-sla` onto the canonical calculation.

## Q10 — Which campaign ROAS is "the" ROAS?

`campaign-roas` exists twice (command KPI: zero-clamped, rounded 2dp over
built campaign rows; commercial formula: unrounded over raw records). They can
disagree in the same explorer, and custom KPIs resolve to the opposite one
than the picker does. **Recommendation:** the command KPI is canonical for
dashboards; the commercial twin gets a namespaced id and a "raw/unrounded"
label until retired. Saved custom-KPI definitions referencing it get a
backfill.

**Unblocks:** retiring the one descriptor-id collision
(pinned in `src/lib/data/metricRegistry.ts` until then).

## Q11 — First-cut Supabase tables: adopt or drop?

`clients`, `client_portals`, `client_portal_members`, `audit_events` exist
live (created by the initial security migration), are **empty**, and no
portal code reads them. The extraction phases will create real tables for
these concepts — reusing those names only works if we adopt and reshape them.
**Recommendation:** drop them in a migration once phase 1 designs the real
schemas, so nobody builds against the wrong model.

**Unblocks:** clean table naming for migration phases 1–2.

---

# Batch 2 — raised by the 2026-08-30 to-do campaign

All 131 documented to-dos were verified against source. **Sixteen** of them
cannot be finished without you — eleven blocked outright on a decision or an
account you own, five carrying a risk I should not take on your behalf. Three
more questions below (Q15's purge rule, Q16, Q17) came out of the campaign's
own implementation work rather than the triage, so nineteen items in total sit
here.

They are grouped by what you actually have to do: **decide**, **do (external
account)**, or **sign off**. Every one has had its decision-independent half
built already — none of these is blocking a line of code that could have been
written without you.

The other 115 to-dos needed no input from you. Where they are not finished, it
is because the closing evidence is a browser walk this container cannot run —
recorded honestly rather than ticked.

## DECISIONS — product or policy calls

### Q14 — Does form capture need consent, like telemetry does?

The Aqua Tag gates telemetry on consent, but the **form field-value capture**
path posts to `/api/public/form-capture` with no consent check on either side,
and the server hardcodes `consent:false` on capture-only inserts. That is
either correct (a submitted form is the consent) or a live compliance gap,
depending on a view I should not take on your behalf.

**Unblocks:** `todo:968`.

### Q15 — What happens when you retire something that is still referenced?

Dependency inventories now exist and are test-proven for SOPs, membership plans
and affiliates, and the deletion paths refuse rather than orphan. What is NOT
decided is the policy behind the refusal: archive/tombstone, require
reassignment first, or one transactional detach under a stated retention rule —
and specifically whether a plan with **billable subscribers** may ever be
purged, and what must be reconciled in Stripe before it is.

**Unblocks:** the policy half of `todo:751`, `todo:757`, issue #176.

### Q16 — If a campaign send crashes mid-blast, what should the campaign say?

Campaign delivery is now truthful — it reports what the provider actually did.
But a crash **during** a blast can strand a campaign in `sending` with some
recipients contacted and some not. Options: resume on next run (needs
per-recipient state, already partly there), mark it `partially-sent` and stop,
or fail the whole campaign and require a manual re-send.

I did not pick one: each is defensible and each is visible to your customers.

**Unblocks:** the last open major from campaign wave 2.

### Q17 — Durable job runner, or synchronous sending, permanently?

Campaign send is now **synchronous** — the option the to-do sanctioned —
because this app has no job-runner infrastructure at all. That is honest and it
works, but it ties up a request for the length of a blast and cannot retry.

A real queue/worker is a platform decision with real cost, not something to
introduce inside a to-do item.

**Unblocks:** `todo:99`'s remaining half.

### Q18 — Revoking someone's last grant currently WIDENS their access

Governance is recomputed from active grants, so revoking an identity's last
non-project grant flips `governed` back to false and they fall back to legacy
`manage` on every client element. Revocation makes them **more** powerful.

This is pinned deliberately by the release access matrix rather than changed
unilaterally, because the fix is a policy choice: fail closed (no grants = no
access) or keep the legacy fallback for un-migrated identities.

**My recommendation: fail closed.** But it can lock people out of surfaces they
use today, so it is yours.

**Unblocks:** issue #174.

### Q19 — Advisor "omega" upgrade: what is the vision?

The plan document is a placeholder that literally says "To fill once Ed
answers". Source confirms the pre-omega state: exactly 8 skill recipes, a
`gpt-5-mini` default, reactive-only behaviour. Nothing can start without the
shape you want.

**Unblocks:** `todo:942`.

### Q20 — What does a client actually SEE at each product-portal stage?

The four-mode enum (`onboarding|designing|developed-launch|maintenance`) types
every stage, but the client-facing content is one static blurb per mode. The
engineering half (stage carries an element payload) is mechanical. The half
that needs you is the experience: what elements, welcome video and tasks each
stage carries, and the "stunning standard" defaults replacing the eleven
existing blurbs.

**Unblocks:** `checklist:1947` (~5 days of work).

### Q21 — Extract a wizard engine, or leave the setup flows hand-written?

There is no wizard engine; the 711-line Aqua Tag setup is bespoke, and several
other setup flows repeat its shape. Extracting a steps-as-data engine is real
work that pays off only if you intend more setup flows.

**Unblocks:** `checklist:1951`.

## ACTIONS — external accounts only you can touch

### Q22 — Affiliate payouts need their OWN Stripe webhook secret

Automated affiliate payouts are currently **refused** rather than offered,
because `transfer.paid` is the only route a payout has to `completed` and it
arrives by webhook. With no verifiable webhook secret, an automated transfer
would really move the affiliate's money and then strand the payout with no
control left to finish it. Manual mark-paid carries the scope safely today.

To enable it: add a Connect webhook endpoint in your Stripe dashboard and put
its signing secret in the affiliates install config.

**Unblocks:** the automated half of `todo:506`.

### Q23 — The external-account queue (nothing here is code work)

Each of these is code-complete and waiting on an account action:

- **GitHub credentials for the editor publish walk** — promised 27 Aug, still
  outstanding. Connect GitHub *in the editor Settings tab* (one vault — do not
  create a second connection store), then walk save → diff → commit → PR →
  merge on a throwaway branch before any client repository. `todo:971`.
- **Meta/Instagram app review** — the self-serve Connect-now flow, webhook
  verification and multi-account routing are built and test-pinned.
  `todo:953`, `checklist:1620`.
- **Live Stripe credentials** — vault, checkout, signed webhooks and refunds
  all exist and are tested against test mode. `checklist:1614`.
- **Vercel env names + `CRON_SECRET`** — the required-env definitions, startup
  check and fail-closed cron guards exist. `checklist:1622`.
- **Apply the four ordered coordinated-storage migrations** — see Q8; then
  verify schema/RLS and remote concurrency before enabling that path.
  `checklist:1625`.
- **Re-enter the unrecoverable routing values** — `parseBlob` no longer wipes
  them, but the ones already lost cannot be recovered by code.
  `checklist:1984`.

## SIGN-OFF

### Q24 — Retention schedule needs a DPO or solicitor decision

The erasure sweep with disposition policy (delete/anonymise/RETAIN), a
preview-before-enforce retention control, and a reviewer-ready DPO pack all
exist in source. The retention **schedule** itself is a legal decision.
Follow-on code (expiry/purge for the RETAIN set) is designed and waiting.

**Unblocks:** `checklist:1629`.


---

## Answered items

### Q12 — Website Editor localStorage surfaces — answered 2026-09-01

Retire the parallel admin islands. Sections, Popups and legacy Page Detail were
removed or redirected; Customise now contains only an honest browser-local editor
preference plus canonical tenant-scoped site/export controls. Issue #31 is resolved.

### Q13 — Build custom portal wizard — answered 2026-09-01

Remove the dead `portal-export` wizard and route the CTA to the canonical Systems
workspace backed by `/api/tenants/client-projects/provision`. The code/path decision
is complete under #36; mounted provision/reload and configured-provider acceptance
remain, so the acceptance work stays in TODO rather than this decision queue.

*Answered items stay here with the decision and date so the section above remains
a live queue.*
<!-- AQUACRM_SOURCE_END path="docs/development/ED-QUESTIONS.md" -->

---

<a id="source-docs-development-loop-progress-md"></a>

## Source document — `docs/development/LOOP-PROGRESS.md`

<!-- AQUACRM_SOURCE_START path="docs/development/LOOP-PROGRESS.md" sha256="38954d1ad66e70e83fd0ffc9a9dde3aa8367aabe96449ebd2932eb40e859c216" -->
# Production-readiness loop — live ledger

**Loop:** every 20 min (cron 5ced36da), started 2026-08-30. Blocked-on-Ed items
live in [ED-QUESTIONS.md](ED-QUESTIONS.md) and are SKIPPED, not stalled on.
Suite baseline at loop start: **5,460 tests / 0 fail / tsc clean.**

## Data-architecture workstream (started 2026-08-30, branch claude/aquacrm-data-architecture-ia0vnx)

**Phase 0 SHIPPED — semantic groundwork.** Full survey of every store,
adapter, migration, KPI path and metadata bag, then the enforceable semantic
layer:

- `src/lib/data/semanticRegistry.ts` — 33 canonical entities (definitions,
  id rules, tenancy, source of truth, provenance, timestamps, sensitivity,
  retention, lifecycles, relationships), the six load-bearing distinctions,
  timestamp + value doctrines, and `PORTAL_STATE_COVERAGE` classifying every
  PortalState collection — **exact set-equality-enforced** by
  `smoke-semantic-registry.test.ts`, so a new collection cannot ship
  unclassified.
- `src/lib/data/metricRegistry.ts` — one canonical id + semantics for all 60
  metrics (20 command + 40 commercial), `computedBy` naming the single
  calculation authority, `radarFamilyId` joins, and every known competing
  calculation linked as `same-quantity`. `smoke-metric-registry.test.ts`
  pins set equality against the defining source files, pins the ONE existing
  bare-id collision (`campaign-roas`) so a new one fails, and adds 8 golden
  boundary tests (SLA boundary inclusive, 14-day staleness, decision
  denominators, even-count median, >100% directional ratio, null-not-Infinity
  ROAS). Descriptors now stamp `canonicalId` (`<kind>:<id>`).
- `src/lib/data/metadataContracts.ts` — all 124 metadata keys catalogued
  (carrier, namespace, owner, type, sensitivity);
  `smoke-metadata-contracts.test.ts` scans src both ways (uncatalogued key
  fails; dead entry fails) — the escape hatch is closed going forward.
- Real fix: `business-health` formulaText stated only the company index and
  omitted the 30% incident blend — corrected to the actual calculation.
- Docs: `docs/data/{ARCHITECTURE,SOURCE-INVENTORY,SEMANTIC-LAYER,
  DATA-DICTIONARY,MIGRATION-PLAN,LINEAGE}.md` + ADR-001…004. All describe
  what EXISTS, with target clearly separated.

**Phase 3 groundwork SHIPPED — transactional outbox** (`server/outbox.ts`,
`PortalState.outbox` incl. parseBlob/empty + promotion disposition entry #92):
record-inside-mutate (atomic with the domain change), emit-then-mark
handoff into the existing bus, idempotent record by id,
correlation/causation + occurredAt≠recordedAt envelope, 14d/5,000-cap prune
that never touches pending. First adopted site: `tenants.createClient` →
`client.created`, payload unchanged, pinned by source-scan.
`smoke-outbox.test.ts` (pre-dispatch crash-window replay included). The bus is
fire-and-forget: `delivered` means dispatched, not consumer-acknowledged, so
durable consumer ids, acknowledgement, retry/backoff and dead-lettering remain
in Phase 3. Also folded the
TRIPLICATED conversion-event predicate into `lib/shared/conversionEvent.ts`
(radarTelemetry + commandIntelligenceService + performanceAnalytics now
import it; restatement fails the suite) — first Phase-7 dedup that needed no
business decision.

**Phase 3 adoption COMPLETE for the foundation** (second pass, 2026-08-30):
all 28 remaining `emit()` sites adopted — every `src/server/**` domain module
(tenants, users, persons ×13, organisations ×3, completedActions,
productWorkspaces) plus the plugin lifecycle (runtime ×4 +
ensureLeadsPipelineInstall ×2). Manifest pin: plain `emit(` under src/server
is confined to eventBus.ts + outbox.ts, restatement fails the suite. The
drain became SYNCHRONOUS after the full suite caught an async delivered-mark
trailing into smoke-company-portal's "a GET does not write" pin — nothing in
the drain awaits, so async only detached writes from the caller's turn.
Deliberately still plain: the port adapters (the one seam that later makes
every plugin event durable at once) and module-internal emits.

**Phase 3 foundation adoption COMPLETE + correlation scope** (commits
241afa9 + this one): all 28 remaining foundation emit() sites announce
through the outbox; manifest pin confines plain emit( under src/server to
eventBus.ts + outbox.ts; drainOutbox made synchronous (suite-caught timing
fix). `runWithCorrelation` ALS scope groups an operation's events under one
correlationId; updateClient's updated/stage_changed pair shares correlation
with causation stage←update. Port adapters stay plain deliberately (the one
seam to flip for all plugin events). NOTE for Ed's machine: the container's
31 "environmental" failures are a Node/tsx ESM-interop artifact (named
imports through the CJS transform in spawned children — e.g.
BUSINESS_TIME_ZONE exists but the child can't see it); cross-backend
spawn-based contract tests are queued for an environment where those pass.

**Phase 5 first half SHIPPED — telemetry idempotency.** Beacons carrying
their own occurredAt get deterministic content+time ids
(`clientTelemetryService.ts`): a replayed request records NOTHING twice
(event, activity row, milestone sync) and doesn't consume the rate limit; a
beacon with no event time keeps a random id — never guess-suppress. The
suite surfaced a REAL pre-existing bug on the way: `cleanNumber`'s ±1e9
clamp flattened every genuine epoch-ms occurredAt, so event time had
silently been ingestion time for ALL telemetry — fixed with a
`cleanTimestamp` epoch-range validator. `smoke-telemetry-idempotency.test.ts`
(5 incl. rate-limit-starvation and stale-replay pins).

**Phase queue (from docs/data/MIGRATION-PLAN.md):**
1. Tenancy/identity/roles extraction (tables + RLS behind existing modules;
   blocked on Ed for `supabase db push` + DATABASE_URL — ED-QUESTIONS Q7).
2. People/organisations extraction (dedupe suites as parity oracle).
3. Transactional outbox (finish same-mutate adoption; table claim + durable
   consumer acknowledgement/retry/dead-letter; no event-sourcing claim).
4. Journey slice. 5. Telemetry out of the metadata bag + deterministic
   beacon ids (the double-count fix). 6. Comms/audit durability.
7. Metric dedup via `sameQuantityPairs()` (response-sla → configured
   guardrail first; campaign-roas collision retirement; ED-QUESTIONS Q8/Q9).

## Done this loop (newest first)

- **Ed's five findings, all fixed + pinned** — (1) search registry now
  role-filtered (destinationSearchItemsFor; staff/freelancers no longer shown
  owner/Dev doors); (2) department stamp server-gated via the NEW shared
  assembler `agencyBasePanels.ts` — departmentHasVisibleNav finally has its
  consumer, layout + route can never fork; (3) MFA verify route hydrates +
  flushes (cold-serverless safe); (4) custom CSS: POST→PUT, UserCssInjector in
  portal layout, ?nocss=1 real; (5) reset nonce restored on provider failure
  (releaseNonce added to both nonce adapters). Opt-out bypass (email route
  browser-phone trust + raw tel:/mailto:) still OPEN — queued with scouting
  Stage 1 which rebuilds those controls.
- **My Radar topbar control landed** (agent): 4 files, gated route, census→156,
  17 new assertions. One regression it introduced (static access-graph import
  in the hot path) caught by smoke-shared-graph-split and fixed by deferring.
- **Ops luxury finish applied** (materials/rail/discs/grain/sheen + dark +
  reduced-motion).

- **Operations luxury finish** — crate as material object (accent hairline,
  layered shadows, lacquered band, radial contact shadow), machined-metal rail,
  embossed discs, dot-grain floor, cinematic-gated sheen, full dark
  restatements + reduced-motion resets. 20 ops tests green.
- **Tools palette** — SavedTool on UserChromeLayout, allow-list URL validation
  (write + server read + client read), add/edit/reorder/remove cards,
  noopener+noreferrer, showcase-gated. 92 tests green incl. 12 new.
- **Convert → fulfilment handoff** — "Continue in fulfilment →" on the
  post-convert banner (`?client=` param existed all along).
- **Needs-you badge** — combines alerts + actions queue server-side, no double
  counting; showcase keeps null slot + zero count. Assertions repointed.
- **Scouting tab** — promoted out of the quick-filter strip; stage filters hide
  in scouting mode; #scouting deep links intact.
- **ED-QUESTIONS.md** created; docs consolidated (137 sources).

## In flight

- (none)

## Browser-verify status — WALK COMPLETE (2026-08-30)

The working recipe, hard-won — follow it exactly:
1. `node scripts/fork-sandbox.mjs <name> <port>` then start with its printed
   command (own state file + dist dir).
2. `allowedDevOrigins: ["127.0.0.1"]` is now in next.config.ts — REQUIRED, or
   assets are blocked cross-origin and hydration silently fails page-wide.
3. Browse ONLY via 127.0.0.1 (own cookie jar). NEVER touch localhost:<lane> —
   localhost cookies are shared across ports and my earlier localhost visits
   clobbered Ed's live :3051 session cookie (owned + told him).
4. Session: hit /dev once on 127.0.0.1 (cookie mints before its redirect hops
   host), then navigate back to 127.0.0.1 URLs directly.
5. After a lane restart, force-reload the tab — stale pre-restart assets also
   present as dead hydration.
6. The pane's screenshot scaling can glitch after restarts; DOM/JS probes are
   authoritative. NEVER run the smoke suite while a file-backend lane shares
   .data (contention fails the concurrent-writes test).

VERIFIED in-browser on the lane: ops luxury belt renders (discs/rails/bands);
My Radar popover opens with switcher+today+tasks+meters; Tools palette add →
card with rel="noopener noreferrer" target=_blank; javascript: URL refused
with the explanation and no card; Scouting tab selects and hides the stage
strip; inbox shows Needs you 5 / Inbox / Updates (badge no longer 0); cog →
Connections modal opens and Escape closes it.

## Design docs ready to build (scratchpad, judged 6–9 with fixes named)

Path prefix: /private/tmp/claude-501/.../scratchpad/
- `design-inbox-polish.md` — two-pane premium messaging. NOTE: judge flag — its
  proposed sub-12px pin fails as written (16 literals exist); drop that pin.
  Touches _UnifiedInboxWorkspace + _MasterInbox chip row ONLY.
- `design-command-centre.md` — station regrouping + progressive disclosure.
  Flags: attention-protection pins 'Attention shield'/'Focus protection'
  strings; the 220KB perf pin is real — CommandPanelShell adds bytes.
- `design-kanbans.md` — Journey Kanbans tab + custom boards. Flag: MUST keep
  `data-testid="pipeline-columns"` in [slug]/page.tsx source, and the Journey
  catch-all render branch needs the new desk value or it renders a blank.
- Scouting journey staged plan: `wd3bqii71` task output (also journal
  wf_ad38416b-aa8) — Stage 1 = call/email buttons + attempt logging on
  prospect rows; quotas reuse CommandCalendarEntry goal/target (auto-increment
  missing — that's the build); rewards hook into You-deserve-it later.

## Queue (priority order)

1. Radar agent lands → verify, full suite
2. ✅ Scouting journey Stage 1 (outreach buttons + logging + quota ring) —
   shipped in `7917318`; the queue entry was simply never struck through.
   Verified against source 2026-08-30 (14/14 dedicated smoke tests).
   Auto-increment of the quota target is deliberately still out.
3. ✅ Inbox premium messaging pass — shipped in `7917318` (inbox merge:
   three tabs + cog modal + two-pane messaging). Verified against source
   2026-08-30.
4. ✅ Kanbans tab (with the testid + catch-all fixes) — the tab and custom
   boards shipped in `7917318`; the remaining one-line defect (the desk
   rendered twice) was fixed and pinned in the 2026-08-30 campaign, wave 1.
   Live browser acceptance of the tab is still outstanding.
5. Command Centre regrouping (biggest; stage it)
6. Info icons / plain-English pass app-wide (Ed: "information icons everywhere
   where needed") — do per-surface as each is touched, then a sweep
7. Website demo Stage 1 (gate + /for-agencies + terms shell)
8. Performance re-measure + docs accuracy sweep + data-compliance check
   (demo PII → governance erasure surface)

## Rules every tick follows

- Plan → read existing code → check test pins → build; agents only on disjoint
  file sets. Full canonical suite + tsc before claiming done.
- `smoke:all` node glob EXCLUDES website-editor (its gate needs opposite
  conditions) — never sweep those files in.
- Blocked on Ed → ED-QUESTIONS.md, move on.
<!-- AQUACRM_SOURCE_END path="docs/development/LOOP-PROGRESS.md" -->

---

<a id="source-docs-development-todo-md"></a>

## Source document — `docs/development/TODO.md`

<!-- AQUACRM_SOURCE_START path="docs/development/TODO.md" sha256="596b0f059feb4ca5a793e1226ed897fe919e5077cd4dd8521f6b52bb17a20999" -->
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

## 🔒 Blocked on you — 10

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
- [ ] Choose Radar probe freshness: restore sub-daily probes or show evidence age on every affected surface → [#170](issues.md)

## P0 — before any production use — 1

- [~] Ecommerce public authority, allowlisted product/receipt DTOs and local end-to-end are verified; finish custom-domain + live Stripe/provider acceptance → [#69](issues.md)

## P1 — before broader launch — 55

- [~] Editor AI database coordination is implemented; live DB proof remains → [#18](issues.md)
- [~] Complete Editor dirty-state browser acceptance → [#19](issues.md) `⚠ disputed`
- [~] Public showcase capability boundary and shared fixture are repaired → [#21](issues.md) `⚠ disputed`
- [~] Continue repairing Website Editor API contracts; exact-scope AI gating is fixed and the dead-call ratchet is 14 → [#28](issues.md)
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
- [~] Aqua Tags stop-routing is non-destructive; mounted click acceptance remains → [#85](issues.md)
- [~] Make Aqua Tag form ingestion durable and order-independent → [#87](issues.md)
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
- [~] Team Chat and notification response-order code is repaired; mounted acceptance remains → [#147](issues.md)
- [~] Named core storage/provider waits are bounded; finish mounted/live acceptance → [#148](issues.md)
- [~] Execute relational extraction, backfill and RLS; semantic Phase 0, durable KPI identities and crash-safe post-commit outbox handoff are shipped, while cross-process claims and consumer acknowledgement/retry/dead-letter remain open → [data migration plan](../data/MIGRATION-PLAN.md)
- [~] Editor `requiresPlugin` gating is code/behaviour-complete and an enabled tenant palette is browser-proven; compare disabled state and disable/reload preservation → [#183](issues.md)
- [~] Consent-aware tenant contact capture and published Blog summaries/detail are built; connect submissions to the operator inbox and implement/remove the remaining Forms/Reservations/Newsletter/Themes promises → [#184](issues.md)
- [~] Sixteen exact public routes are now classified, including allowlisted Ecommerce and Website Editor visitor facades; continue one operation at a time → [#185](issues.md)
- [~] Isolated server/browser lane is restored; finish the remaining critical-flow acceptance  <sub>from todo-retired.md, no issue number</sub>

## P2 — quality and correctness — 15

- [~] Reference validation remains a broad open class; the audited client-route slice is fixed → [#20](issues.md)
- [~] Canonical staff workspace capability policy, reusable-role authoring and Staff Technical Hidden/View/Use/Manage plus same-cookie downgrade enforcement are source/isolated-browser proven; finish provider-backed live-persona/shared-credential acceptance → [#25](issues.md)
- [~] Shared plugin settings is operable and Marketing, Website Editor, Fulfillment and Memberships are truthful; Memberships is exact-build browser-proven, Ecommerce's low-stock default and Leads Pipeline's default source/capture column are now consumed and three dead Finance/Ecommerce/Leads declarations are removed, Client CRM's default tags and signup mirror are consumed and five stored-only promises (HR 2, Affiliates 2, Client CRM 1) are removed; the three that remain (HR staff-edit permission, Public Funnel redirect and session cookie) are safety-shaped access/session controls left labelled "Not connected" pending a security decision → [#44](issues.md)
- [~] Finance, Dev Team, Governance, Fulfilment, Actions and Performance mutation controls use checked response contracts; Actions (four viewports) and Performance (seven viewports) are exact-build browser-proven, while Client Centre, phase, SOP, Company and other families and their acceptance matrix stay open → [#47](issues.md)
- [~] Finish Notepad autosave browser acceptance → [#54](issues.md)
- [~] Mounted acceptance remains for settled utility controls → [#61](issues.md)
- [~] Agency Marketing campaign rows, channel indexes and reports are cross-process/crash-atomic on the file backend; finish native Supabase/Postgres constraints and live-provider acceptance → [#84](issues.md)
- [~] Finance settings now control new invoices/documents; browser acceptance remains → [#120](issues.md)
- [~] The route loader and Visual Builder boot expose one real live status, and the visual handoff is browser-proven; screen-reader announcement/removal/focus acceptance remains → [#136](issues.md)
- [~] Tabs, menus and listboxes now use honest roles and shared keyboard models; mounted representative acceptance remains → [#138](issues.md)
- [~] The real self-contained global error fallback is shipped; production root-fault/recovery acceptance remains → [#141](issues.md)
- [~] Chromium-required 192/512 and maskable PWA assets are shipped; eligible/dismissed/installed browser acceptance remains → [#142](issues.md)
- [~] Published current-page blocks are hydration-stable in default and explicit modes; mounted navigation acceptance remains → [#143](issues.md)
- [~] Private media has one tested 200/206/416 provider-aware byte-range contract; mounted playback/seek acceptance remains → [#144](issues.md)
- [~] Finish production-durable Dev Team authoring and live signals  <sub>consolidated from the retired lists; no issue number</sub>

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
<!-- AQUACRM_SOURCE_END path="docs/development/TODO.md" -->

---

<a id="source-readme-md"></a>

## Source document — `README.md`

<!-- AQUACRM_SOURCE_START path="README.md" sha256="78865db662380f9d9710ee4f46c1d65a05dc77dfa3abff0f57d86c8c677b434f" -->
# AquaCRM

A single Next.js application serving the AquaCRM public website, secure
sign-in, the internal agency workspace, and branded customer portals. Public
sites submit centrally to AquaCRM while preserving their trading brand,
source, campaign, requested services, and consent record.

## Documentation

- `CLAUDE.md` is the AI collaborator entrypoint.
- `docs/PRODUCT-ARCHITECTURE.md` defines domain ownership and the agency/client
  macro and micro model.
- `docs/CURRENT-IMPLEMENTATION.md` records implemented systems, integration
  truth boundaries, and recent upgrades.
- `docs/DEVELOPMENT-HANDOFF.md` covers repository workflow, persistence,
  testing, permissions, Git safety, and deployment.

## Local

```bash
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:3032`. The website is `/`, sign-in is `/login`, and all
authenticated workspaces live below `/portal`.

## Vercel

Import the `edstorm987/aquacrm` repository and set Vercel **Root Directory** to
`portal`. Keep the framework preset on Next.js and do not set a custom output
directory.

The production launch gate requires:

- Supabase: URL, anon key, service-role key, public bucket, and private upload
  bucket. `PORTAL_BACKEND=supabase` is optional because the app detects a
  complete Supabase configuration.
- Secure sessions: `PORTAL_SESSION_SECRET`, `NEXT_PUBLIC_PORTAL_SECURITY=strict`, and the HTTPS `NEXT_PUBLIC_PORTAL_BASE_URL`
- Email: Resend for access/security mail and enquiry notifications
- Payments: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- Private assistant: `OPENAI_API_KEY` and optional `OPENAI_ASSISTANT_MODEL`
- External assistant gateway: `MILESYMEDIA_ASSISTANT_API_TOKEN` and
  `MILESYMEDIA_ASSISTANT_AGENCY_ID` (defaults to `milesymedia`). The live,
  read-only OpenAPI contract is served from `/api/v1/openapi.json`; a reusable
  skill is in `assistant-integrations/milesymedia-api/SKILL.md`. Setup and
  endpoint guidance is in `docs/external-assistant-api.md`.
- Durable private uploads: `NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET` (normally
  `aquacrm-uploads`). Existing Vercel Blob references remain readable for
  migration compatibility, but new uploads use Supabase Storage.

Set `FOUNDER_EMAIL`, `FOUNDER_PASSWORD`, and `FOUNDER_AGENCY_NAME` for the first owner account. Rotate the local founder password before any public launch.

The assistant at `/portal/agency/assistant` is available to agency owners and
managers. It receives a fresh, redacted, read-only snapshot of the active
business with each request and stores chat history plus personal memories in
the portal backend. The API key stays server-side. ChatGPT subscriptions and
OpenAI API billing are separate, so a Platform API key is required.

Meeting invoices can collect one-off, recurring, or fixed-instalment card
payments through Stripe Checkout. Register
`/api/portal/leads-pipeline/commercial/stripe-webhook?agencyId=<agency-id>` as
the Stripe webhook endpoint and subscribe it to `checkout.session.completed`
and `invoice.paid`. Bank transfer and cash payments can also be recorded
manually, with references and emailed receipts retained in the audit trail.

The complete variable names and safety notes live in `.env.example`. Local
secrets belong in `.env.local`; never commit them.

After configuring Vercel, confirm:

- `/healthz` returns `200` for liveness.
- `/healthz/full` returns `200` and `"readyForProduction": true`.
- Agency Settings → Launch shows all four required services as ready.

The deep probe deliberately stays unready until required email, storage,
database, HTTPS, and session-security settings are present in production.
<!-- AQUACRM_SOURCE_END path="README.md" -->

---
