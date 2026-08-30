# AquaCRM documentation — start here

> The catalogues, runbooks and entry-point instructions for people and agents.
>
> Consolidated 2026-08-30 from **9** source documents / **11,553 words**. Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.

## Source map

- [`AGENTS.md`](#source-agents-md) — 95 words · `63f2c50380ed`
- [`CLAUDE.md`](#source-claude-md) — 3,545 words · `80e4ff9c47b9`
- [`docs/DEVELOPMENT-HANDOFF.md`](#source-docs-development-handoff-md) — 1,552 words · `9199166a1f30`
- [`docs/development-workspace-cleanup.md`](#source-docs-development-workspace-cleanup-md) — 793 words · `bdb46a5cecd3`
- [`docs/development.md`](#source-docs-development-md) — 3,248 words · `dd5efef22882`
- [`docs/development/CLOUD-RESUME.md`](#source-docs-development-cloud-resume-md) — 500 words · `03458cdf18bf`
- [`docs/development/ED-QUESTIONS.md`](#source-docs-development-ed-questions-md) — 558 words · `27df7b0c7b2a`
- [`docs/development/LOOP-PROGRESS.md`](#source-docs-development-loop-progress-md) — 825 words · `fae37c7c58de`
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

<!-- AQUACRM_SOURCE_START path="CLAUDE.md" sha256="80e4ff9c47b98744bf3ae4ecdf585cd0702ab35614d1fdea0af5905518afb2e0" -->
@AGENTS.md

# AquaCRM Claude Handoff

## 🚨 CURRENT CONTINUATION BRIEF — 27 August 2026

**Read this section before dispatching a worker or editing anything.** It is the
current operational handoff and supersedes the stale status sentences at the
bottom of this file. It does not supersede source code or
`docs/development/checklist.md`: source is the final authority and the checklist
is the one current status document.

### First five minutes: preserve the working state

- Work in `aquaCRM/portal`. **Corrected 2026-08-27:** the tree is on **`main` at
  `2f3995b`** ("chore(checkpoint): preserve complete AquaCRM workspace") — Ed
  committed the previously dirty `work/2026-08-20-parallel-session` state as a
  checkpoint. The older wording here described that branch and 2,823 unstaged
  changes; that is history. **Run `git status --short` first, always** — do not
  trust this paragraph over the command.
- The tree currently carries the **27 August session's work, uncommitted**: ~82
  changed files across source, tests and docs, including the P0 session-revocation
  fix. Use narrowly scoped patches and diffs. Do not reset, rebase, checkout,
  clean, blanket-regenerate, stash, commit, push, deploy, or rewrite history
  unless Ed explicitly asks.
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

*Status refreshed 2026-08-27 after a full working session. Items 1–4 moved; 5
and 6 have not started. Verify in source before acting on any line here.*

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
   credentials — promised, not yet supplied** (see todo.md); plus
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
   `DATABASE_URL`), dirty-editor browser transitions, remaining Staff policy,
   unresolved references, dependency-safe retirement, hidden render-time
   mutation. Use checklist/issues/todo, not memory.

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
- Canonical full suite before calling a behaviour complete:

  ```bash
  PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
  ```

  Do not substitute `smoke:all`; it omits non-`smoke-` tests.

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

*The isolated-production and Library/Logs numbers below are from before
27 August and remain the best available for speed. For access, session and
template work, the 27 August suites named in the continuation order are current.*

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
- **Ed's GitHub credentials for the Dev Editor publish walk — promised 27 August,
  not yet supplied.** Everything up to the publish boundary is proven; commit → PR
  → merge against a real repository cannot be walked without them. When they
  arrive: connect GitHub *in the editor* (one vault, do not fork a second
  connection store) and walk it on a throwaway branch before any client
  repository. **Never enter a real key yourself.** → `docs/development/todo.md`.
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

Current operational snapshot: 27 August 2026 on **`main` at `2f3995b`**, with that
day's session work (~82 files) intentionally uncommitted on top. The earlier
snapshot naming `work/2026-08-20-parallel-session` at `1d46479` is history — Ed
checkpoint-committed that state. The current brief at the top of this file,
source, and `docs/development/checklist.md` supersede older status prose, and
`git status --short` supersedes all of them.
<!-- AQUACRM_SOURCE_END path="CLAUDE.md" -->

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

<!-- AQUACRM_SOURCE_START path="docs/development.md" sha256="dd5efef22882db7c16a70d93acac0188750edfd77cbc8104187bf8b6eb1d2244" -->
# development.md — the law

**This is the master catalogue and build map for AquaCRM. Use it to find the
owning document, and update that document after every change.** The current
answer to “where do we stand?” is [development/checklist.md](development/checklist.md);
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
│   ├── checklist.md ..... ★ THE ANSWER to "where do we stand" — the only one
│   ├── todo.md .......... the working cleanup/finishing checklist
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
| **Where do we stand?** | **[checklist.md](development/checklist.md)** | Three files used to answer this. Two are now archived. |
| **What systems exist?** | **[CURRENT-IMPLEMENTATION.md](CURRENT-IMPLEMENTATION.md)** | An inventory, not a status report. Status lives in checklist.md. |
| **How do I run it locally?** | **[DEVELOPMENT-HANDOFF.md](DEVELOPMENT-HANDOFF.md)** | Despite the name it is the environment runbook, **not** a session handoff. Session handoffs are dated and archived. |

Everything dated — old summaries, session records, worker debriefs — lives on the
[history shelf](context/archive/README.md) and is never current.

---

## The books

| Book | What it's for |
|---|---|
| **[goals.md](development/goals.md)** | Why AquaCRM exists, who Ed is, the operating model, current strategic goals, and the principles that shape how we build. Read first to understand *what* we're doing. |
| **[roadmap.md](development/roadmap.md)** | **The roadmap — the outer view.** Every outcome that is coming, its horizon (Now / Next / Later / Someday / Shipped), its target date, and the plans that deliver it. Progress is COMPUTED from those plans' phases, never typed. Written and edited from the Dev Console (`/portal/dev-team/roadmap`); this supersedes phases.md. |
| **[checklist.md](development/checklist.md)** | **The single most reliable "where do we stand" summary** — what's yours (Ed's) vs mine, in order, generated at the end of a session. If you read one thing before working, read this. |
| **[architecture-noobie.md](architecture-noobie.md)** | The whole system explained in **plain English**, no jargon. Start here if you're new (human or agent) and the catalogue below is too dense. |
| **[development/plans/fulfilment-template-system.md](development/plans/fulfilment-template-system.md)** | **The template system** — portal/product templates edited once and seeded into every client instance, owned by Fulfilment (Ed's direction, 2026-08-27). Most of the spine already exists; the new idea is a cross-tenant *origin* template. |
| **[development/plans/dev-editor-finish.md](development/plans/dev-editor-finish.md)** | **Current Dev Editor plan.** The 22 Aug session handoff is preserved on the [history shelf](context/archive/dev-editor-handoff-2026-08-22.md), but it is no longer a current brief. |
| **[context/archive/](context/archive/README.md)** | 🗄 **The history shelf.** Dated records — superseded summaries, session handoffs, worker debriefs — kept because they are the only place some facts survive, and **never current**. `phases.md` (the old roadmap) lives here now. Nothing on this shelf should brief a worker. |
| **[plans/](development/plans/)** | One **phased plan per substantial item** (e.g. [radar-upgrade.md](development/plans/radar-upgrade.md), [mfa-login.md](development/plans/mfa-login.md)). Each plan's own `**Status:**` line is the authority on that item. Shipped plans may be moved to [plans/archive/](development/plans/archive/). |
| **[audits.md](development/audits.md)** | The **independent auditor's verdicts** — the record of what has been *verified*, not just claimed. A 🔴 finding gets a loud banner at the top of that file. Read before trusting a "complete" claim. |
| **[todo.md](development/todo.md)** | The working **checklist** of cleanup & finishing work — Finish / Clean up / Decide / Prove, with launch-blockers flagged. Tick items off as they land. |
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
1. Read [checklist.md](development/checklist.md) (where we actually stand), then [goals.md](development/goals.md) (if you don't know the direction) and [roadmap.md](development/roadmap.md) (what's actually next). **Nothing in [context/archive/](context/archive/README.md)** — that shelf is history.
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
  [checklist.md](development/checklist.md).
- **P1:** showcase GET/OAuth mutations bypass the read-only proxy assumption;
  erasure can report live failures as success, strand retry and retain the client
  name in its audit; Editor AI's database coordination remains incomplete;
  editor transitions/prefill and staff capability policy remain uneven.
- **Other reliability queue:** file persistence/corrupt-state recovery, invalid
  client references, truthful website empty states, read-path performance and
  critical browser journeys. The exact order is
  [checklist.md](development/checklist.md).
- **The three former 🔴 launch blockers are all FIXED** (source-verified 2026-08-20): freelancer preview escalation (`api/auth/preview-as-freelancer/route.ts:49,101` stashes/restores `previewReturnUserId`), finance create-surface idempotency (`agency-finance/src/lib/idempotency.ts`, wired into invoices · plans · operations · expenses · payments · income), and erasure email-in-log (`leads-pipeline/src/server/contacts.ts:168,227,252,279` log an **id**, never an address).
- **RLS is ON in live Supabase** (verified across 14 tables with the public anon key, 2026-08-20). What remains is **engineering, not an Ed decision**: the RLS policies ARE version-controlled — 14 migrations in `aquaCRM/supabase/migrations/`, 13 of them predating 2026-08-20. An earlier note here said there were none; that was wrong, written by looking inside `portal/` only, `brand_enquiries` has no `agency_id`, ~37 service-role refs bypass it — see [rls-enable](development/plans/rls-enable.md).
- **MFA on login is BUILT — all four phases** (verified 2026-08-21). The server gate is `api/auth/login/route.ts:320` (`loginMfaStep`), session assurance is `raisedToSecondFactor` at `:399`, and RECOVERY CODES are built too: `consumeRecoveryCode` (`lib/server/auth/mfa.ts:500`) called from the `check-recovery` branch (`login/route.ts:338,353,358`), with the login form's code step at `app/login/LoginForm.tsx:253-272`. Native form posts carry the code through (`login/route.ts:151`). See [mfa-login](development/plans/mfa-login.md) for what genuinely remains.
- **Real emailed connect codes are SHIPPED** (`lib/server/connectionConfirmation.ts` — 6-digit, HMAC-hashed, 15-min TTL, single-use; `00000` is dev-mode-gated only). A Resend sender is configured and `inspectProductionReadiness()` reports email READY. Only the code-step **browser walk** is unwalked.
- **Standard portal = one Website product**; Aqua Tags setup steps **1, 2, 3 and 6 are done**, step 4 (link the repo) is next, step 5 (seed into the editor) is planned — `agency/fulfilment/_AquaTagsWorkspace.tsx:85-90`.
- **Open decisions** (genuinely Ed's): **Aqua Tag form-capture consent**, and **when to merge `work/2026-08-20-parallel-session` to `main`** (the merge is what deploys production). The first commit is DONE, and Agency-vs-TradingCompany was SETTLED — the three-tier model is stated in code at `src/app/api/portal/agency/companies/[companyId]/portal/route.ts:24-29`. See [checklist.md](development/checklist.md) and [issues.md](development/issues.md).
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
- Full current-state detail: **[checklist.md](development/checklist.md)** — it is now the *only* live "where we stand" doc. The two that used to compete with it are on the [history shelf](context/archive/README.md).

---

*This document is the entry point named by `CLAUDE.md`. If you change how the
project is documented, change this page too — it is the one thing everything
else hangs from.*
<!-- AQUACRM_SOURCE_END path="docs/development.md" -->

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

<!-- AQUACRM_SOURCE_START path="docs/development/ED-QUESTIONS.md" sha256="27df7b0c7b2ad5cf1c1e4ee73e31f30fe143b9c6598f36437d4e692e8aaac3b6" -->
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

---

*Answered items: move them to the bottom with the decision and date, so this
file stays a live queue.*
<!-- AQUACRM_SOURCE_END path="docs/development/ED-QUESTIONS.md" -->

---

<a id="source-docs-development-loop-progress-md"></a>

## Source document — `docs/development/LOOP-PROGRESS.md`

<!-- AQUACRM_SOURCE_START path="docs/development/LOOP-PROGRESS.md" sha256="fae37c7c58deda4060a2d4a3d1031a83b609dea212e9337442d8ef24dca4066f" -->
# Production-readiness loop — live ledger

**Loop:** every 20 min (cron 5ced36da), started 2026-08-30. Blocked-on-Ed items
live in [ED-QUESTIONS.md](ED-QUESTIONS.md) and are SKIPPED, not stalled on.
Suite baseline at loop start: **5,460 tests / 0 fail / tsc clean.**

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
2. Scouting journey Stage 1 (outreach buttons + logging + quota ring)
3. Inbox premium messaging pass
4. Kanbans tab (with the testid + catch-all fixes)
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
