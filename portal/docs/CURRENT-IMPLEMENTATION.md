# AquaCRM Current Implementation

> **What this file is: the inventory of what systems EXIST.** It is not the
> "where do we stand" doc — that is **[development/checklist.md](development/checklist.md)**, and it
> is the only one. Two other files used to compete for that job; both were
> archived 2026-08-21 to the [history shelf](context/archive/README.md). Read this
> to find out whether a capability is built; read the checklist to find out
> whether it is finished, and [status.md](development/status.md) to find out whether it
> actually works.
>
> **Verification limit (2026-08-24):** this inventory says a system or surface
> exists; it does not upgrade source-shape coverage into runtime acceptance.
> Current launch-safety gaps include P0 session revocation; P1 showcase and
> erasure truth; incomplete Editor AI distributed coordination; file persistence,
> editor transition/prefill, staff policy, data-truth and browser-acceptance work.
> See the checklist before calling an implemented system production-ready.

Last updated: 27 August 2026 (configurable access, repository preview and measured speed pass)
Baseline commit: `1d46479` on branch `work/2026-08-20-parallel-session` (pushed to
origin; NOT merged to `main` — merging is what deploys production).
The previous baseline `b46d8ae` is 67 commits behind and no longer describes the tree.

## Current Release Summary

AquaCRM is now a connected local operating system rather than a static CRM
prototype. The current implementation includes real persisted domain models,
server APIs, role-aware workspaces, client-scoped operating surfaces, Radar
evidence, notification routing, and integration activation paths.

This document records what is present in the current source. It should be updated whenever a
change alters a domain boundary, persisted model, primary workflow, external
integration, or navigation contract.

### Unified Environment And Sandbox Mode

- **Settings → Environment** is the canonical operator surface. Sandbox can be
  switched off for live data or on with Empty, Demo or Production snapshot data.
- Sandbox access is explicitly writable or read-only. Demo data supports Owner,
  Staff, Customer and Freelancer personas without another server or login.
- The browser never chooses a database key. The server derives an opaque signed
  realm from the returning live identity and selected dataset.
- File and memory storage keep independent per-realm blobs; Supabase and generic
  Postgres use realm-specific datastore keys. Public `/showcase` uses its own fixed
  read-only realm.
- Legacy private Showcase and Dev persona endpoints remain compatibility adapters
  while new entries converge on the canonical sandbox service.
- Shared provider boundaries refuse live communication, billing, OAuth/calendar,
  connection-test, publishing and upload side effects from a sandbox realm.
- Focused Sandbox/Showcase/provider proof passes 46/46, the request-realm isolation
  regression passes 7/7 and TypeScript passes. A clean port-3032 browser walk entered
  Demo as Owner and exited back to live Settings; an earlier full persona walk covered
  Owner, Staff, Customer and Freelancer with the expected portal redirects.

### Configurable Access And Workspace Elements

- One canonical server evaluator resolves fresh identity and membership against
  exact agency, workspace, project or client scope and live or Sandbox environment.
- Roles are reusable templates, not blanket authority. Direct per-person grants,
  expiry/revocation and attributable permission requests support approve, narrow,
  deny, cancel and revoke without self-approval or delegation above the reviewer.
- Settings, People and Fulfilment mount one shared manager with Hidden, View,
  Use/Edit and Manage levels over stable `element.<key>` identifiers.
- Staff station and Fulfilment view projections consume those levels for navigation,
  direct pages and representative operations. Staff People page/API responses now use
  element-specific projections rather than serialising the full people graph to every
  visible Staff element. Fulfilment client list/create requires Services View/Manage.
  The client workspace registers
  11 exact-client elements: overview, relationship, fulfilment, marketing, systems,
  commercial, communications, files, portal, record and settings.
- A governed Staff/Fulfilment assignment cannot act as an implicit tunnel into every
  client. Exact-client or explicit agency-wide client-element policy is required on
  adopted paths. All tenant route files containing `clientId` are 35/36 canonical-
  gated, with the dev-only empty-store seeder as the sole tenant exception; 28
  completed mappings are source-pinned.
- The remaining genuinely unclassified client associations are dynamic plugin
  handlers for Fulfilment, Client CRM, Ecommerce, Memberships and Affiliates,
  freelancer jobs, and generic tasks/task-template application. Customer/session/
  relationship, Dev-project, workspace-create, website-source and output/derived
  routes intentionally retain their more appropriate authority.
- Governed client/end-customer collaboration branches for contracts, files, requests
  and project briefs now intersect their existing relationship/role ceiling with the
  matching Commercial, Files, Communications or Record element. Entirely ungoverned
  identities retain the documented legacy migration fallback.
- The access composer exposes only Workspace+Staff for exact Staff scope and only
  Workspace+Fulfilment for exact Fulfilment scope; it prunes stale capabilities when
  scope changes and sanitises grants/requests/review decisions again at submission.
  The inert generic Development workspace option is removed; Development authority
  continues through exact project scopes.
- The focused client boundary passes 62/62 including six direct tests; separate
  product-workspace cross-process proof passes 4/4; TypeScript and diff pass.
  Browser proof covers the manager at seven widths, restricted Staff and
  Fulfilment deep links, missing exact-client denial and responsive editor/preview
  slices. No browser actions were added by the API-inventory subtask, and the full
  grant/request decision mutation matrix remains open.
- The final access repair passes 92/92 focused/adjacent checks plus 11/11 exact-scope
  UI checks. A separate 32/32 regression proves `/dev` always provisions the explicit
  live realm, tolerates an access-revision update and refuses a rotated session revision.
  Full TypeScript and diff checks pass. On a clean restarted `:3032`, exact Staff and
  Fulfilment scopes rendered only their own registered element sets; the 390px grid had
  44px targets and no overflow, People Capacity fit at 390px, and browser warnings/errors
  were empty. The new-role composer also showed Agency/Workspace/Client/Project,
  Live/Sandbox and all 28 stable element groups; one `staff.pay` Hidden→View interaction
  was restored without submit. This is representative acceptance, not a persisted
  role/grant journey or the full mutation/persona matrix.
- The settled relevant combined gate is 130/130: 86 core access/Dev/workspace/
  client/People, 11 exact Access UI, 21 Dev Team performance and 12 Sandbox
  environment/protection checks. This is not a complete repository-suite rerun.

## Major Implemented Systems

### Command Centre And Personal Execution

- Day Command is the first operating station.
- Employee-style clock in/out and work sessions are persisted.
- Inactivity prompts distinguish work in Aqua, external work, breaks, and
  unconfirmed time.
- Clock-out requires a review rather than silently ending a session.
- Daily and weekly planning retain outcomes, planned hours, revenue targets,
  completed evidence, and execution measures.
- Calendar, Actions, briefings, Radar instruments, and KPI snippets are
  integrated into the Command Centre experience.
- Battle Table includes planning, projections, quarterly strategy, capacity,
  capital, ownership, investment, dividend, and governance concepts.
- Focus protection reduces visible overload while retaining the full queue.
- Performance Mode is the default server-readable lightweight path. It pauses Radar/
  KPI intelligence until an explicit scan. Executive, Radar, Actions, Calendar and
  Advisor server work is constructed only for the requested station, and the Executive
  JSX lives outside the default page module.
- Agency chrome uses a lightweight plugin metadata catalog instead of importing the
  executable plugin registry. Search runs only after the user opens it and types at
  least two characters; notification refreshes are stale-windowed and deduplicated.
  Company switching and the work-session monitor hydrate their initial projections
  from authenticated server state, eliminating their two automatic mount GETs.
- The main port-3032 development scripts use Turbopack with a dedicated persistent
  cache; explicit Webpack fallbacks remain and production builds stay on Webpack. A
  post-clean cold `/dev` → Agency browser journey measured about 5.8 seconds and the
  cold Agency server render 4.5 seconds. Once compiled, Agency server requests commonly
  measured 10–118ms and a fresh browser default load after HMR measured 1.06 seconds.
  The final settled command shell measured 497ms in browser / 442ms in the server log,
  without busy/loading state or horizontal overflow. The default document is about
  209–224KB rather than the earlier roughly 270KB.
- The first contextual Executive open can still pay about 3.2 seconds of development
  compilation. A full Radar scan completed in 476ms and retained all 2,967 checks across
  subsequent lightweight RSC station navigation; removing the one-shot scan query does
  not strand station state.
- Dev Team Home uses a compact concurrent snapshot rather than loading the complete Dev
  Docs graph. The static route graph fell from 104 to 54 modules, about 47% fewer source
  bytes. A recurring 5.0–5.4-second post-TTL tail was traced to Home recursively reaching
  `scanWorkerSignals()` through roadmap/task construction; it now reads active check-ins
  directly. In the final expired-TTL probe, headers arrived in 329ms, the dashboard marker
  in 430.4ms and the stream completed in 457.7ms. A fresh in-app browser Home visually
  settled in 538ms without busy/loading state or overflow; the development access log
  separately recorded the probe at 440ms and the browser's streamed app request at 916ms.
  Those clocks are evidence from different layers, not interchangeable response metrics.
  The intentional first drawer-open world load measured 967ms.
- Shared development chrome suppresses speculative Link prefetch, loads Search only on
  user intent, leaves the work-session monitor idle when no session exists and serves the
  PWA descriptor from `public/manifest.webmanifest` instead of a dynamic route module.
- The earlier `ENOSPC` incident remains cleared and guarded: approved generated-output
  cleanup did not touch source/state/uploads/docs, every dev entry refuses startup below
  2 GiB without deleting anything and TypeScript expansion remains narrowed from 6,869
  to 1,796 files. This pass does not establish whole-app production speed. Pristine cold
  starts, contextual station compilation, Library/Logs, Dev Docs, providers and the
  complete role/responsive matrix remain open.

### Adaptive Radar

- Radar has live, learning, paused, not-applicable, seasonal, and retired
  policy states.
- Checks distinguish authoritative targets from learned historical baselines.
- Evidence confidence and readiness are shown independently from health.
- Radar retains scan memory, evidence points, hourly rollups, recurring issues,
  flapping sources, blind spots, and recovered issues.
- Full scans can be triggered manually and show last-run state.
- Source and KPI inspection surfaces expose underlying evidence rather than
  only aggregate counts.
- Recommended actions are evidence-backed and enter Actions only after
  acceptance.
- Client Radar provides scoped relationship, commercial, delivery, portal, and
  systems health, then contributes to agency-level monitoring.

### Master Inbox And Communications

- Needs Attention is the first inbox view.
- All, social, enquiry, chatbot, support, client message, update, and channel
  views are available.
- Unified conversation profiles can retain channel and contact context.
- Outbound communication infrastructure supports choosing sender/channel where
  configured.
- Meta messaging activation is documented in `docs/meta-master-inbox.md`.
- Website enquiry replies and classifications are persisted.
- Enquiries can be classified as sales, existing client, supplier, partner,
  marketer, recruitment, spam, or another relationship.
- Attention rows now show exact resolution guidance with Resolve, Remind later,
  and Dismiss controls.
- Task alerts link to an exact task; focus protection promotes that task and
  opens its editor.
- Lead meeting alerts link to the exact lead record.
- Finance, delivery, and system alerts no longer open a contact conversation
  based only on a name match.

### Actions And Reconciliation

- One All queue combines manual, Radar, Advisor, and CRM work.
- Origin filters expose specialised views without duplicating tasks.
- Tasks support status, priority, staff owner, client, dates, reminders,
  recurrence, SOPs, notes, outcomes, and evidence.
- Agency Actions can assign work to nested staff/client scopes.
- Radar reconciliation records whether accepted work fixed the underlying
  issue, remains firing, is unverifiable, or reopened.
- External AI proposals remain pending, parked, accepted, or rejected until a
  human decision.

### Journey, Identity, And Scouting

- Clients, Journey, Contacts, identity review, Staff, and combined contact
  views are connected through one relationship system.
- Lead and contact categories preserve how the relationship was sourced,
  including personal network, networking, referrals, and imported/scraped
  prospects.
- Identity resolution links enquiries, social contacts, leads, and existing
  contacts while preserving ambiguous matches for manual review.
- Lead timing records enquiry age, first response, follow-up, and wait state.
- Journey supports kanban pipelines and direct client workspace access.
- Cold Scouting includes prospect qualification, channel strategy, notes,
  follow-up, recontact timing, and conversion into the normal Journey.
- Meetings include booking, rescheduling, reminders, outcomes, no-shows,
  recordings, links, notes, and related commercial actions.
- Booking funnels are owned by Marketing and can be used by Journey.

### Fulfilment And Product/Service Operations

- Fulfilment combines client delivery, portals, product workspaces, and
  technical/development operations.
- Product/service catalogue entries can be draft, live, or archived.
- Product workspaces hold modules, stages, steps, SOP connections, portal
  requirements, pricing, and operating configuration.
- Stage boards provide portfolio summaries and focused stage detail.
- Stages can be created, edited, ordered, and applied per service.
- Client product assignments support bespoke variations without changing the
  base product.
- Service tasks can be created from the client workspace and assigned through
  agency Actions.
- Client-scoped marketing delivery reuses internal marketing capability for
  social media and ads services.
- Development dashboards, projects, performance, website operations, toolkit,
  vault, and workflow are available through Fulfilment technical routes.

### Internal Client Workspace

- Each client has a persistent internal workspace with Overview,
  Relationship, Fulfilment, optional Social & ads, optional Systems, Finance,
  Communications, Files, Portal, and Record lenses.
- The workspace sidebar is expanded, service-aware, permission-aware, and has
  attention indicators.
- Product assignments determine relevant modules and service-stage controls.
- Services can progress independently.
- Client finance can create and manage client-scoped commercial records without
  sending staff to Agency Finance.
- Contracts support templates, uploads, client publication, and configured
  email delivery.
- Payment plans and payment evidence are client-scoped and feed portfolio
  finance.
- Files accept documents, images, audio, video, spreadsheets, archives, and
  other operating evidence through private upload storage.
- The client Record combines calls, messages, notes, files, contracts,
  payments, delivery events, and activity in one chronology.
- Linked buyer workspaces can be read as one relationship history while their
  operational records remain isolated.
- Client workspace entry/exit transitions respect Performance Mode.
- The client layout, tabs, Settings, plugin catch-all and representative mutations
  resolve the active person's level for the exact client. Files/contracts/payment/
  finance/portal/properties/requests are classified across the first runtime pass.
  Expense attachments do not carry client identity and therefore cannot honestly be
  called exact-client gated; agency-wide/global branches remain agency surfaces.

### Portals And The Editor

- Master templates and product-specific portal seeds exist.
- Client portal instances and design versions are persisted.
- There is **one universal editor**, `src/engines/editor/DevEditor.tsx`. It is not a
  portal feature and there is no separate "Portal Studio", website editor or code
  editor; a client portal is one of the targets it can be pointed at. Two routes
  open it — `/portal/agency/portals/editor` and `/portal/dev-team/editor/studio` —
  and both mount the same component. (It lived at
  `app/portal/agency/portals/editor/_ClientPortalStudio.tsx` until 2026-08-21.)
- Pointed at a client portal, the editor supports stage and portal selection,
  pages, blocks, responsive settings, data sources, visibility rules, media,
  custom pages, and controlled custom code.
- Product modules compose into a portal while preserving a usable standalone
  experience for a single product.
- Assigned trading company controls the provider brand shown to the customer.
- Separate client workspaces can produce separate portals for one buyer.
- Customer portal records include only inherent or deliberately client-visible
  information.
- The reusable `/portal/dev-workspace` lists only exactly granted projects and
  separates view, code, AI, explorer, local preview and publication capabilities
  from the founder-only Dev Team control plane.
- A server-owned `aqua-preview.config.json` drives a local/test-only supervised
  loopback preview. The browser cannot supply root, command, arguments, environment,
  port or shell. The mounted browser has completed Start, Restart and Stop; responsive
  Preview/Code panes switch correctly and `/aqua-tag.js` returned HTTP 200.
- **Repository preparation landed 2026-08-27 (opt-in).** A record carrying
  `isolatedWorktrees` gives each project its own git worktree on its draft branch
  `aqua-editor/<projectId>`, created or resumed under
  `<trusted root>/.aqua-preview-worktrees/`, so an uncommitted edit survives
  stop/restart and the shared checkout is never mutated. A record may also declare
  `installCommand`/`installArgs`/`installTimeoutMs`: the supervisor then reports an
  `installing` state, runs that command in the project's own worktree, streams its
  output into the operator log, and skips it while the dependency fingerprint
  (lockfiles + `package.json`) is unchanged. The install command passes the same
  allowlist as the launch command, and **declaring one without `isolatedWorktrees`
  is refused** — an install must never rewrite the shared checkout. AquaCRM's own
  committed manifest therefore declares no install command. Clone-from-remote, and
  authoring/AI/diff/check/PR, failure and dirty-state browser acceptance, remain.

### Ecommerce And Storefront Commerce

- Ecommerce checkout accepts stable product/variant ids and quantity, rejects browser-authored
  money, and resolves current price, currency, stock, discount, shipping and tax on the server.
- One durable immutable checkout operation owns provider-session replay, inventory/value
  reservations, paid settlement and expiry release. Gift-card/custom-code limits, paid-only card
  issuance, exact-zero checkout and the full-refund restoration policy share that operation.
- Configured fixed, weight and free shipping plus inclusive/exclusive tax produce one minor-unit
  quote used by Checkout Summary, Stripe lines and the stored order; provider-side repricing is
  disabled for this contract.
- Orders use a durable retryable provider-delivery ledger, cumulative refund accounting and
  constrained audited fulfilment transitions. Reporting groups gross/refund/net/cancelled/pending
  and customer net spend by source currency.
- Products have server-owned stable ids, archive-first retirement, scoped versioned details/
  variants commands, recoverable slug/collection migration and lossless rich option metadata.
- Website Editor commerce blocks share the catalogue/search/cart/variant/quote/by-session DTOs and
  tenant/store/version cache keys. Guest/end-customer route authorization and literal two-store
  browser/live-Stripe acceptance are still pending; source/service/package proof passes 39/39.

### Finance, Company, Staff, And Experience

- Finance supports GBP-first multi-currency records, income, expenses,
  invoices, reports, budgets, allocations, operations, and planning.
- Normal invoice collection is limited to sent/overdue balances; direct,
  mark-paid, mounted Income and Stripe Checkout share the live outstanding
  calculation, and coordinated partial writes cannot exceed it.
- Finance create and post-patch services validate exact fields, supported currency/enums,
  safe whole-cent money, bounded rates/quantities, coherent dates, recurrence, nested invoice
  lines and expense attachments before persistence; invalid handler/import-shaped writes leave
  the plugin store unchanged.
- Finance plan assignment validates the agency client and target before mutation, serialises
  competing moves across processes, and replays a durable versioned marker after interrupted
  writes so plan membership and per-client reverse lookup converge on the next read.
- Recurring Finance expenses use schedule ID plus due timestamp as one durable occurrence. A
  recoverable per-schedule operation persists the deterministic child result before advancing,
  so double-click, process race and retry/reload return one child without skipping a period.
- Finance reporting uses one selected-currency accounting snapshot. Payment receipts and reimbursed
  cash costs are distinct from invoiced/accrual revenue, approved commitments and pending costs;
  partial receivables and receipt tax share the same ledger rules. Overview, Reports, Budgets,
  Planning, P&L and report APIs use those named fields without implicit FX.
- Finance refunds are immutable provider-identified negative allocations. Cumulative Stripe events
  reconcile only their unrecorded delta; partial/full invoice state, net receivables, cash, tax,
  Reports, P&L, Overview, Income and client summaries share those rows. Disputes persist separately.
- Workspace Settings is the canonical source for invoice payment terms, default tax and seller/tax
  identity. New invoice forms and service defaults consume it, and each invoice captures an issuer
  snapshot so later business-detail changes do not rewrite historical HTML exports.
- Client Payment Plans are the canonical per-client commercial schedule; Agency Finance Plans are
  reusable editable multi-currency templates. Mounted Finance controls assign, move and cancel
  clients, snapshot terms onto the client schedule and preserve old invoices. MRR/ARR, Planning,
  portfolio and Deposits read active linked schedules; deposits use an explicit invoice link, and
  replayed cancellation cannot cancel a later assignment.
- Company health, projections, objectives, capacity, and executive plans feed
  Command Centre and Battle Table.
- Hiring capacity intelligence uses evidence and area-specific constraints to
  identify high-impact hiring needs.
- Company capital models include share classes, shareholders, transactions,
  holdings, dividends, distributions, and governance decisions.
- Legal records cover contracts, insurance, HMRC, policies, company records,
  status, evidence, and renewal/action dates.
- Staff models cover applications, employee access, onboarding, commission,
  leave, shifts, training, and employee workspaces.
- Experience models support client, staff, partner, and personal audiences,
  packages, fulfilment steps, events, trips, welcome moments, and rewards.

### Search And External Assistants

- Workspace search indexes pages and operating records including clients,
  contacts, enquiry content, tasks, finance, activity, and additional domain
  context.
- The private Aqua Advisor receives a fresh redacted business snapshot.
- Advisor skills have explicit policies and constrained capabilities.
- External assistants use scoped API keys, read APIs, MCP tools, and a proposal
  inbox rather than unrestricted database mutation.
- Setup is documented in `docs/external-assistant-api.md`.

## Integration Truth Boundary

The application contains working configuration surfaces and server adapters,
but an adapter cannot produce live third-party data without credentials and
provider setup.

Values/setup still required per environment may include:

- Supabase URL, anon key, service-role key, and storage buckets;
- `GITHUB_TOKEN` and `GITHUB_OWNER` — required by the Dev Editor's repository
  path and by `openPullRequest()` / `mergePullRequest()`
  (`src/lib/server/env.ts:74-75`, `.env.example:167-168`). Without them the
  editor reads only the local working tree;
- Resend/SMTP email credentials and verified senders;
- Stripe secret and webhook configuration;
- OpenAI API key and model;
- Meta app, page, Instagram, webhook, and token values;
- Google Calendar OAuth credentials and connected accounts;
- Google Search Console credentials;
- external assistant API tokens;
- Vercel project/team tokens for repository and deployment operations.

The UI must label unconfigured, stale, learning, and connected states honestly.
Do not turn a configured-but-empty source into a healthy pass.

## Recent Update Log

### Canonical people, resolvable actions — SHIPPED

Committed and pushed. This section previously read "Working tree only; not yet
committed" against baseline `b46d8ae`; that work is now 57 commits in the past.

**New persisted aggregates** in `PortalState` (all optional in parsed blobs;
the storage parser injects empty records, so existing state loads unchanged):

- `persons` - the canonical human. `Lead`, `Contact` and `Client` are facets
  pointing back via `personId` and are never deleted on reclassification.
  Carries multi-value `emails`/`phones`, classification history, company
  membership decisions, and hand-recorded meetings/calls/notes.
- `organisations` - the customer company, distinct from `TradingCompany`
  (which is one of Ed's own brands). Groups people by email domain.
- `completedActions` - what was actually finished. Separate from the alert
  because alerts are derived from live evidence and cease to exist once it is
  healthy, taking any "done" flag with them.

`AgencyTaskOrigin` gained `"inbox"`. Existing rows have no such value and
still default correctly, so no migration is required.

**Behaviour changes**

- Reclassifying an enquiry no longer destroys records. `leads.delete()` and
  `contacts.delete()` are gone from the classification route; the lead is
  retained with its classification stamped, which `isLeadJourneyEligible`
  already filters on across all six Journey surfaces. `ensureLeadCard`
  restores the kanban card when a lead re-enters Journey.
- `WebsiteEnquiry` now exposes `consent`, `consentPurpose`, `consentVersion`
  and `consentCapturedAt`. These were captured at submission and previously
  never selected from the database or surfaced anywhere.
- Every enquiry resolves to a `Person` on read, in
  `synchroniseWebsiteEnquiryIdentities`.

**Resolution layer**

Every operational alert now declares `kind` (`in-app` / `off-system` /
`judgement`), `focus` and `clearsWhen`, stamped centrally in
`withResolutionContexts`. Alert hrefs carry `?resolve=&focus=` so the
destination can explain itself; `ResolutionBanner` and `ResolutionSpotlight`
are mounted in the agency layout. Multi-step jobs derive their steps from live
records rather than storing a checklist.

Contract tests read the alert families out of `operationalAlerts.ts`, so a new
family cannot ship without a classification, a clearance condition, a focus or
next-step guidance.

**Navigation contracts**

- New: `/portal/agency/contacts`, `/portal/agency/contacts/[personId]`,
  `/portal/agency/contacts/companies/[organisationId]`.
- Clicking a person resolves by state via `personDestination`: contact card,
  lead card, or client workspace.
- Actions gained `Today` and `Completed` views; `Needs attention` was merged
  into `CRM` (the row badge preserves provenance).

**Local development**

`npm run dev:sandbox` pins `PORTAL_BACKEND=file`; `/dev` signs into the
`Bare Co` tenant when `PORTAL_DEV_MODE=true` and the backend is file or
memory. See `DEVELOPMENT-HANDOFF.md`.

### `b46d8ae` - Actionable Inbox alerts

- Added category-aware resolution routing.
- Added Resolve, reminder presets, and evidence-change dismissal.
- Added exact task and lead deep links.
- Made linked tasks bypass the protected queue only long enough to resolve the
  requested record.

### `10f7d26` - Client operations and task assignment

- Expanded client Radar and service workspaces.
- Added product process and client variation APIs.
- Improved product assignment, stage operations, client task assignment, and
  Fulfilment client command surfaces.
- Added relationship categories and agency task assignment tests.

### `cc45c37` and `5533d6d` - Client operating system

- Added client workspace transition and Performance Mode handling.
- Added the client record ledger, relationship history, identity resolution,
  product assignment adaptation, portal studio, payment plans, contracts,
  files, and customer-portal visibility controls.

### `b625755` - Multi-company portal branding

- Added client-to-company assignment.
- Customer portals now resolve the assigned trading company as provider.

### `0d7fbed` - Operational resilience

- Added focus/overload protection and date resilience.
- Improved command navigation, Radar controls, client service operations, and
  financial/payment safety.

### `07d49da` and `619dd52` - Scale and acquisition

- Added evidence-backed capacity and hiring recommendations.
- Added the cold scouting command workflow and search/index support.

### `8bca878`, `a067b41`, and `a4c64dd` - Command operating layer

- Unified Day Command, Command Centre, Battle Table, Calendar, Radar, Actions,
  commercial intelligence, lifecycle metrics, source inspection, and
  recommendation workflows.
- Added the command visual mode, transitions, responsive behaviour, and
  notification drilldowns.

## Updating This Document

Add a dated section when a change introduces any of the following:

- a new primary workspace or ownership boundary;
- a new persisted aggregate or lifecycle;
- a new external integration;
- a new customer-visible data path;
- a significant migration or compatibility rule;
- a new operational safety contract.

Do not list cosmetic changes unless they alter interaction or accessibility.


## 21 August 2026 — the Dev Editor becomes the one editor

Branch `work/2026-08-20-parallel-session`, HEAD `28bafd5`. Not merged to `main`.

- **One editor, not several.** There is no separate portal editor, website
  editor or code editor: one Dev Editor that adapts to what it is pointed at.
  `/portal/dev-team/editor` is the PROJECTS workspace; the canvas is
  `editor/studio?project=<id>`, and exiting returns to the list.
- **`DevProject`** binds repository + branch + the GitHub/Vercel CONNECTION IDS
  + an Aqua Tag. Secrets stay in the integrations vault and are resolved at call
  time; a cross-agency connection id is rejected. There is no project "type" —
  "what is it?" is free text, because a project is often several things at once.
- **The editor surface**: CodeMirror 6 with the real VS Code Dark+ theme and
  language grammars, file-type icon tints, multiple files open at once, session
  resume per project, and a mode switch (Just tell it / Visual builder / Dev —
  "Just the words" merged into Visual 2026-08-22; a saved `simple` migrates to
  `visual` by name) with a per-mode accent and cutscene.
- **The browser renders at REAL device sizes** *(2026-08-22, phase 10)*:
  `DeviceControl` mounts the module's 26-preset device system (custom W×H,
  rotate, zoom) in place of the width-only `BreakpointControl` (deleted); the
  iframe lays out at exact device CSS pixels (no `maxWidth` squash), the pane
  scrolls at 1:1 with zoom as an explicit transform, the Responsive BOX has
  pointer-captured drag handles whose size becomes the custom dimensions, and
  the choice persists per project. A resize never remounts the iframe. Pinned
  by `smoke-editor-device-sizing`.
- **Reading was broken and is fixed**: `readable` and `editable` were the same
  question, so anything outside a narrow list rendered blank.
- **Writing exists and is hardened.** POST on `/api/portal/site-editor/files`,
  founder + Dev Mode only. An adversarial review found five real defects — a
  race where two saves both won, a truncate-in-place write, a fingerprint not
  bound to its path, `.data/` being writable, and a symlink escape — all fixed
  and pinned in `smoke-editor-write-path`. Creating files and folders uses the
  same guards.
- **Presence** marks files that moved under you, reusing the Dev Team's existing
  check-ins and mtime scan. Advisory; the fingerprint is the real protection.
- **Aqua Editor AI** has its own project-scoped provider/configuration and history
  path. It proposes; a person applies. Claim/coordinator pieces exist, but the
  cross-instance database/RPC contract is incomplete and not production-proven.
- **PR management**: commit to a branch, then `openPullRequest()` and
  `mergePullRequest()` — two steps, so a preview exists before anything reaches
  main.
- **Also**: `src/engines/{editor,sop,data}/` is real; Operations and Tools are
  single flat sidebar rows onto hub pages; pinned pages ship as chrome; the
  cross-tenant `brand_enquiries` read is closed.

Known gaps, deliberately: binary upload, saved components, the env "are you
sure" overlay, the funnel/client-side editor convergence
(Phase 6 of `docs/development/plans/dev-editor-checklist.md` — the
`super-editor.md` this used to name was never written), and a React hydration failure on
`/portal/agency/portals/editor` that breaks interactivity on that route.
