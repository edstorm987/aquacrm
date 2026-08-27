# AquaCRM documentation — start here

> The catalogues, runbooks and entry-point instructions for people and agents.
>
> Consolidated 2026-08-27 from **6** source documents / **8,221 words**. Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.

## Source map

- [`AGENTS.md`](#source-agents-md) — 95 words · `63f2c50380ed`
- [`CLAUDE.md`](#source-claude-md) — 2,179 words · `ae4e3ec9616c`
- [`docs/DEVELOPMENT-HANDOFF.md`](#source-docs-development-handoff-md) — 1,552 words · `9199166a1f30`
- [`docs/development-workspace-cleanup.md`](#source-docs-development-workspace-cleanup-md) — 793 words · `bdb46a5cecd3`
- [`docs/development.md`](#source-docs-development-md) — 3,165 words · `a44b12ab7565`
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

<!-- AQUACRM_SOURCE_START path="CLAUDE.md" sha256="ae4e3ec9616c50f8fa57bee2fec5f06c5085b64d3baa8b1bf0e20b3de88b70c0" -->
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

<!-- AQUACRM_SOURCE_START path="docs/development.md" sha256="a44b12ab756520032bd8a5531d07a102887cc105c3129fff39b40f5a61e2ad61" -->
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
- **P0:** central session revocation is ineffective. A stale owner cookie created
  a working external-AI token after the live user was downgraded to staff.
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
