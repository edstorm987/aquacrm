@AGENTS.md

# AquaCRM Claude Handoff

## 🚨 CURRENT CONTINUATION BRIEF — 27 August 2026

**Read this section before dispatching a worker or editing anything.** It is the
current operational handoff and supersedes the stale status sentences at the
bottom of this file. It does not supersede source code or
`docs/development/checklist.md`: source is the final authority and the checklist
is the one current status document.

### First five minutes: preserve the working state

- Work in `aquaCRM/portal` on branch `work/2026-08-20-parallel-session`, currently
  at `1d46479`. The branch is even with its upstream, but almost all work since
  that commit exists only in the working tree.
- This is a **large, intentionally dirty, entirely unstaged tree**. The handoff
  audit saw 2,823 tracked changes and 286 untracked files. Run
  `git status --short` before touching a file and use narrowly scoped patches and
  diffs. Do not reset, rebase, checkout, clean, blanket-regenerate, stash, commit,
  push, deploy, or rewrite history unless Ed explicitly asks.
- Preserve the intentional deletion of the retired
  `docs/reference/files/**` stub tree and `src/app/manifest.ts`. The former is
  replaced by consolidated reference volumes; the latter is replaced by
  `public/manifest.webmanifest`. Preserve the new `docs/00-START-HERE.md` through
  `docs/08-HISTORY-AND-ARCHIVE.md` volumes and their manifest.
- A development server was already listening on port 3032 at handoff. Do not
  kill, restart, or reuse it casually. Use `npm run sandbox:fork` for an isolated
  browser/server lane. Do not delete ignored `.next*` outputs without resolving
  the exact owner and target first.
- Do not brief from `docs/context/state.md`,
  `docs/context/commander-handoff.md`, or anything in `docs/context/archive/`.
  Those records are history and contain stale persistence, Showcase, erasure,
  and implementation claims. Start from `docs/development.md`, then
  `docs/development/checklist.md`, and verify every claim in current source.

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
- The authored docs were consolidated into nine volumes from 127 sources, with
  20 canonical Library documents. Regenerate them; do not re-create thousands
  of retired one-file Markdown stubs.

### Exact continuation order

1. **P0 security — central session revocation.** Legacy `requireRole()` paths can
   still accept an old privileged cookie after a live user is downgraded. Make
   current-user existence, current `sessionRev`, current role, and live agency
   membership a central prerequisite for every authenticated request. Prove an
   old cookie cannot mutate after role downgrade, password/session rotation, or
   user deletion. Start at `docs/development/checklist.md` lines 547–560,
   `docs/development/issues.md` issue #22, and the auth/session helpers in source.
2. **Finish Dev Workspace phase 17.** Complete one repository-backed lifecycle:
   isolated branch/worktree → dependency/start readiness and logs → inspect →
   visual/source/AI edit → diff → save/reload → checks → commit/PR/merge,
   retaining state across restart. Cover dependency/start failure, occupied port,
   crash, stale preview, rejected AI change, dirty transitions, and cross-project
   denial. The owning plan is
   `docs/development/plans/dev-editor-finish.md`.
3. **Then phase 18 client embedding.** Decide the actual client-portal placement
   and browser-prove a real client owner/staff identity sees only its granted
   project/elements, retains edits, can request access, and never sees internal
   Dev Team material.
4. **Complete application-wide access adoption.** Classify remaining dynamic
   plugin handlers for Fulfilment, Client CRM, Ecommerce, Memberships and
   Affiliates; resolve freelancer-job and generic task/task-template scope; and
   converge HR/freelancer/customer legacy policies without deleting legitimate
   alternative authority.
5. **Run the release access matrix.** Use two people, two projects and two
   environments for create role → grant → request → narrow/approve/deny/
   cancel/revoke. Prove Hidden/View/Use/Manage positive and negative reads and
   writes, exact-client isolation, and immediate Live/Sandbox revocation.
6. **Close the recorded runtime residue.** This includes live two-instance
   Editor-AI database coordination, dirty-editor transitions, remaining Staff
   policy, unresolved references, dependency-safe retirement, and hidden
   render-time mutation. Use checklist/issues/todo, not memory.

### Required verification and truth labels

- During iteration: run the nearest focused test under the correct runtime,
  `npm run typecheck`, and `git diff --check`.
- Canonical full suite before calling a behaviour complete:

  ```bash
  PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
  ```

  Do not substitute `smoke:all`; it omits non-`smoke-` tests. The last complete
  whole-suite proof remains **3,621 pass / 0 fail / 1 missing-DATABASE_URL skip**
  from 23 August. Newer focused gates are valuable but are not a whole-suite run.
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

- Isolated Webpack production: 281 pages, 135,196.3 ms build, 1,479,314,365-byte
  output. Fresh-process first HTTP / repeat max: auth 619.1/7.7 ms, public
  593.1/9.8, Agency 727.8/28.3, Dev Team 726.4/31.2, Library 693.0/26.4 and Logs
  741.0/29.0; process readiness 205–308 ms. This is not deployed/CDN proof.
- Library measured 4.428→3.290 s cold; Logs 3.182→0.857 s first and
  2.702→0.868 s post-TTL. Its eager graph fell 47 modules / 469,232 bytes to
  3 / 15,433. Agency's static proxy closure fell 77.6%; no comparable final
  local runtime was claimed for that graph-only result.
- Latest broad focused code gate: **335 pass / 0 fail / 1 optional live-DB skip**
  with TypeScript clean. Loader/browser presentation: **127/127**, desktop
  1440×900 and mobile 390×844, no overflow or console errors. These focused
  gates do not replace the 23 August whole-suite result.

### External decisions and blockers

- `DATABASE_URL` was absent at handoff, so Supabase migrations and live
  two-instance Editor-AI claim coordination still need a configured environment.
- Ed must approve merge to main, real onboarding-code walkthrough, live
  Stripe/Meta credentials, deployment environment, and DPO/solicitor decisions.
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
- Run the FULL smoke suite
  (`PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts`)
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

Current operational snapshot: 27 August 2026 on `work/2026-08-20-parallel-session`
at `1d46479`, with all subsequent work intentionally uncommitted. The current
brief at the top of this file, source, and `docs/development/checklist.md`
supersede older status prose.
