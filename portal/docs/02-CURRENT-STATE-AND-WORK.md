# Current state and work

> The current readiness assessment, one task list, status history, roadmap, goals, decisions and working queue.
>
> Consolidated 2026-09-08 from **7** source documents / **57,076 words**. Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.

## Source map

- [`docs/CURRENT-IMPLEMENTATION.md`](#source-docs-current-implementation-md) — 4,627 words · `d110c036ab5a`
- [`docs/development/goals.md`](#source-docs-development-goals-md) — 532 words · `62f18b439951`
- [`docs/development/notes.md`](#source-docs-development-notes-md) — 1,730 words · `f68ea59936dd`
- [`docs/development/PRODUCTION-READINESS.md`](#source-docs-development-production-readiness-md) — 2,257 words · `69689073325f`
- [`docs/development/roadmap.md`](#source-docs-development-roadmap-md) — 21,704 words · `f3ef33649d6f`
- [`docs/development/status.md`](#source-docs-development-status-md) — 22,045 words · `10c744ce76c8`
- [`docs/development/TODO.md`](#source-docs-development-todo-md) — 4,181 words · `1803d5dd4755`

---

<a id="source-docs-current-implementation-md"></a>

## Source document — `docs/CURRENT-IMPLEMENTATION.md`

<!-- AQUACRM_SOURCE_START path="docs/CURRENT-IMPLEMENTATION.md" sha256="d110c036ab5aa5eb014e3997f8f8ff8eb84e01eb29b98514d74789cdad7174ff" -->
# AquaCRM Current Implementation

> **What this file is: the inventory of what systems EXIST.** It is not the
> “where do we stand” doc. Read
> **[development/PRODUCTION-READINESS.md](development/PRODUCTION-READINESS.md)**
> for the current assessment, [development/TODO.md](development/TODO.md) for the
> one task list, and [status.md](development/status.md) for verification history.
> `checklist.md` and `todo-retired.md` are retained history, never current inputs.
>
> **Verification limit (reconfirmed 2026-09-08):** this inventory says a system or surface
> exists; it does not upgrade source-shape coverage into runtime acceptance.
> Current launch gaps include live email, apex TLS/custom-domain and Stripe
> acceptance, truthful Railway readiness status, recovery activation/restore,
> CI, monitoring, the remaining distributed data/outbox work and browser/provider
> acceptance. Do not call an implemented system production-ready from this file.

Last status-pointer review: 8 September 2026.
Evidence baseline for the current assessment: `a808bb3f` on clean `main`, matching
GitHub `main`. Feature sections below retain the dated evidence attached to them.

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
- Journey is the master acquisition board. Active Prospect intake and later
  Lead stages are projected into that one board; the Scouting, Researching,
  Outreach Command, Meetings, Inbox, and Contacts views are workbenches over
  the same records rather than mandatory sequential gates or separate stores.
- Scouting includes a supported Google Maps Embed canvas, manual/networking
  capture, mapped CSV/TSV/XLSX intake, prospect qualification, channel plans,
  notes, follow-up, recontact timing, and guarded conversion into Journey.
  Research is optional and can be revisited before, during, or after outreach.
- Website enquiries classified for Sales are admitted through the authenticated
  Lead write path, receive an acquisition dossier, and deep-link to the exact
  Journey record.
- Lead and Contact acquisition paths attach a canonical agency-scoped Person;
  promotion preserves the exact `personId` and explicit Lead lineage. Shared
  email addresses or phone numbers are not treated as proof that two records
  are the same person.
- Calls and emails support reviewed device handoff or configured providers,
  server-side suppression and recipient checks, stable replay protection, and
  separate attribution for the initiating operator and the person who records
  the final human outcome. DM, SMS, WhatsApp, and in-person work remain manual
  logged channels rather than unguarded automatic sends.
- Twilio, Resend, and SMTP execution requires one uniquely resolved CRM subject
  before the external provider is called. Unknown or ambiguous recipients are
  refused with a conflict; device/manual handoff remains available and records
  only the action Aqua can truthfully prove.
- Outbound provider replay is tenant-scoped, stores no raw recipient or message
  content, carries exact Prospect/Lead/Contact/Client erasure lineage, and
  expires after 30 days. Subject-linked call, email, and replay records are
  removed by exact ids during client erasure without deleting an unrelated
  shared-address record. A legacy identity-only erasure that resolves to more
  than one disconnected acquisition subject fails closed and retains the client
  for operator review and retry instead of claiming success.
- Contact-to-client conversion claims the exact request before creating the
  client, so matching concurrent requests converge and changed options conflict.
  Spreadsheet preview and import share a 5 MB streaming bound, XLSX expansion
  ceilings, and a 500-row pre-write limit.
- Meetings include booking, rescheduling, reminders, outcomes, no-shows,
  recordings, safe links, notes, actor-attributed interaction history, and
  related commercial actions across the same Lead and Contact records. Meeting
  edits use one bounded mutation with server-owned time and actor evidence.
- Every declared Leads Pipeline API method has an explicit Growth element
  policy and unknown methods fail closed. The signed public Stripe webhook is
  the sole explicit element-policy exemption.
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
<!-- AQUACRM_SOURCE_END path="docs/CURRENT-IMPLEMENTATION.md" -->

---

<a id="source-docs-development-goals-md"></a>

## Source document — `docs/development/goals.md`

<!-- AQUACRM_SOURCE_START path="docs/development/goals.md" sha256="62f18b4399512606edf934dcb6d1a62485e8032538c5989e819be5b2aa5c720e" -->
# Goals

← Back to [development.md](../development.md) (the law)

Why AquaCRM exists and what "done" looks like. Update when the direction moves.

## The one-liner
AquaCRM is **Ed's business operating system** — a single solo-founder platform
that runs an agency and every client it serves, and gives each client (and their
end-customers) their own portal. Not a collection of CRM pages: one operating
surface for the whole business.

## Who / where it stands
- **Solo founder, advanced beta, with a Railway deployment but not yet approved
  for broad paid production.** Do not assume
  every record is disposable test data: local file state and the configured
  Supabase project are separate, and development paths can still reach live
  tables. Use an isolated sandbox and clearly labelled fixtures.
- Next.js 16 App Router, React 19, TypeScript strict, at `aquaCRM/portal/`.
- **Current evidence baseline (2026-09-08):** the committed `main` is clean at
  `a808bb3f`, matching GitHub `main`, but the **working tree is not clean** — it
  carries uncommitted local work (a doc reconciliation + a 2026-09-08 engineering
  pass). Re-check Git before acting; never discard another worker's uncommitted
  files.

## The operating model (the non-negotiable shape)
- **Agency workspace** = the macro/portfolio view (Ed's whole business).
- **Client workspace** = the *same* capabilities at a single-client micro level.
- **Customer portal** = only the deliberately-shared surface for end-customers.
- Four spines: **Journey** (people/sales/enquiries), **Fulfilment** (delivery),
  **Finance** (money), **Command Centre** (Ed's day + monitoring/Radar), tied by
  the **Master Inbox** (communication + actionable attention).

## Current strategic goals
1. **Ship the standard portal.** One **Website** product, phases Onboarding → Design → Develop → Published. Rebuild the rest of the catalogue one product at a time (deliberate scope-down — don't re-sprawl).
2. **Get enquiries + websites flowing in cleanly** via the Aqua Tag → inbox, with correct routing (agency vs client).
3. **The Aqua Tag as the spine of acquisition + a consent-gated tag manager** — one tag that captures forms, tracks telemetry, respects consent, and injects configured GA/PostHog/Meta only after consent. Dogfood on Ed's own sites first; production routing values still need re-entry.
4. **Trustworthy monitoring** — Radar tells the truth (health vs evidence vs readiness; missing evidence is a visible blind spot, never a pass).
5. **Compliance-grade data handling** — real erasure, consent, audit trails.
6. **Launch** to real clients.

## Immediate finish line (source/runtime-reviewed 2026-08-24)

Before “launch” means reliable rather than merely broad, close P0 central session
revocation, then P1 erasure false-success/retry/audit and showcase mutation/
isolation. After those, close storage/recovery, the Editor AI distributed
contract, editor transition/prefill and staff-policy drift, data truth and
read-path performance; then complete the named browser journeys.
[TODO.md](TODO.md) owns the live order and
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) owns the current launch verdict.

## Principles that shape how we build
- **Guess, then human-confirm** — matching/classification suggests; a human accepts. Never auto-commit suggested work.
- **Honesty over vanity** — no fabricated numbers; missing data shows "—"/"Learning"/"blind", never a fake healthy value.
- **Reuse → repurpose → simplify** before building new — the codebase already duplicates several features; don't add a third.
- **Plain and simple** — Ed's been at this for months; short, honest, no walls.

_Related: [roadmap.md](roadmap.md) (the roadmap), [notes.md](notes.md) (decisions),
and the memory notes `aquacrm-project-shape`, `portal-products-scope-down`,
`aqua-tag-as-consent-tag-manager`._
<!-- AQUACRM_SOURCE_END path="docs/development/goals.md" -->

---

<a id="source-docs-development-notes-md"></a>

## Source document — `docs/development/notes.md`

<!-- AQUACRM_SOURCE_START path="docs/development/notes.md" sha256="f68ea59936dd3e761e7e166cd9336913316dc79edf7c9b76d951a4906f3025ff" -->
# Notes & decisions

← Back to [development.md](../development.md) (the law)

Durable context and decisions that aren't obvious from the code — the "why", so
nobody re-litigates a settled call or gets caught by a non-obvious fact. Newest
at the top.

## What a new agency inherits from the origin — Ed's answers (2026-08-27)

Asked the three questions the origin template hinged on, Ed settled all of them:

> "just for now be a real agency i operate for now i need to get this out for
> myself first! but it will be both … and yes it will do designs too … and no
> phases sops individually written ones wont transfer … contract templates
> branded no, templates sure."

Which reads as:

| | |
|---|---|
| **What the origin IS** | A real agency Ed operates — for now. It will **also** be a system-owned artefact later, so nothing may assume which. Named by `AQUA_ORIGIN_AGENCY_ID`; `projectAgencyOrigin()` takes an agency id, so a synthetic origin only has to produce one. |
| **Portal designs** | Transfer. |
| **Phases, SOPs, written material** | Do **not** transfer. Individually written work is the agency's own voice, and phases are its own lifecycle. |
| **Contract & task templates** | Transfer — the template, never the branding, and never a client's actual agreement. |

**The branding rule, since "branded no" cannot be automated honestly.** Branding
lives in free body text; a regex pretending to remove it would be worse than
saying so. So the line is drawn where it CAN be drawn: a contract template
created from a real client contract (`sourceContractId` present) is that client's
agreement in template clothing and does not transfer **at all**; the rest do, and
come back in `needsRebrand` so a person rewrites the wording deliberately.

**Ordering consequence worth remembering:** Ed's "I need to get this out for
myself first" means the origin is Milesymedia and the first consumer is Ed. Do
not build multi-tenant origin governance before the single-tenant path he
actually needs works.

## Where a client touches the editor — Ed's placement decision (2026-08-27)

Asked where a client should find their editor for phase 18, Ed drew the line by
**audience**, not by feature:

> "inside the client internal workspace is for internal employees. if the client has a
> website or software then we will optionally toggle to embed it into their portal…
> client internal we will have one anyway but we can face it to their portal for updates
> etc, but **for clients anything they touch is inside their portal**."

So the rule is:

- **`/portal/clients/<clientId>` is INTERNAL.** It is the agency-side workspace for Ed and
  his employees. The editor mounts there anyway, for internal work on that client's site.
- **A client's own portal is where the client touches anything.** When a client has a
  website or software project, the editor is **optionally toggled ON per client** and faced
  into their portal. Off by default: having a project does not automatically hand the client
  an editor.
- The toggle is a per-client decision Ed makes, not a role or a template. It composes with —
  and never replaces — the exact project grant: the toggle decides whether the surface is
  offered at all, the grant decides what it can do.

**Known tension — investigated 2026-08-27, and it is smaller than it looked.**
`src/app/portal/page.tsx:20` does redirect `client-owner`/`client-staff` INTO
`/portal/clients/<clientId>`. But the internal MUTATION surface is already
internal-only, by role, before any grant is consulted: `client-properties` is
`requireRoleForClient([...AGENCY_ROLES])` (`:144`) and `customer-portal-control`
401s anything failing `isAgencyRole(session.role)` (`:100`). A client role is
refused there even holding `client.portal.manage` on its own client — pinned by
`scripts/smoke-client-role-workspace-boundary.test.ts` (6/6), which also proves
an agency identity still works, so the boundary is about audience rather than a
dead route.

So Ed's rule is **already true for what a client can DO**; what remains is where a
client is SENT and what they SEE — a product/UX separation, not an exposure. That
matters for sequencing: it is safe to build the client-facing surface deliberately
rather than urgently.

**The destination — SETTLED by Ed, 2026-08-27.** Asked whether the client's portal
should be a new surface or whether the existing customer portal is meant to be it,
Ed answered: *"existing customer portal actually meant to be."*

So `/portal/customer` **is** the client's portal. The `end-customer` role name is
the legacy artefact, not the design: the portal already renders exactly what a
client is given — their project stage, invoices, files, support — and
`/client-preview/<id>` is the agency-side preview of that same portal.

**What that makes the work:** re-point client roles at it rather than build a
second portal. Concretely, `src/app/portal/page.tsx:20` stops sending
`client-owner`/`client-staff` into the internal workspace, and the customer
portal's `requireRole("end-customer")` gate (`app/portal/customer/layout.tsx:30`)
widens to the client roles it was always for. Both are small; the care needed is in
what the portal then shows each audience, and in not breaking the end-customer
journeys (orders, membership, bookings) that share the surface. Its own scoped
change, with its own browser matrix.

## The template system lives in Fulfilment — Ed, 2026-08-27

Ed asked for portal templates and product portals to be integrated into the
editor, "to make a system so I can edit and seed everything that will follow…
the original product will be the agency for everyone, with all products
services" — then immediately corrected the home himself: *"actually this should
mean it all lives in fulfilment."*

That is his own contract applied: `CLAUDE.md` says Fulfilment owns the
product/service operating model, and a library of product portal templates that
every client instance is seeded from is exactly that.

**Grounding, because most of this already exists:** `ClientPortalTemplateRecord`
and `ClientPortalInstanceRecord` already give template → instance with
`templateVersionId` pinning; `ensureProductPortalTemplate` provisions a template
per product; the Dev Editor already edits templates at
`/portal/agency/portals/editor`; and every page there is **already** gated on
`fulfilment.portals`. So the authority is already Fulfilment's — what is missing
is placement (the library is a top-level route, not inside the Fulfilment
workspace) and the genuinely new idea: a **cross-tenant origin template**, since
templates are `agencyId`-scoped today and `baseTemplateId` inherits only within an
agency. Full write-up:
[fulfilment-template-system.md](plans/fulfilment-template-system.md).


## Architecture / naming
- **Milesymedia = Aqua (legacy names).** The product is branded "Aqua Advisor" / "AquaCRM", but legacy identifiers still say Milesymedia (`askMilesymediaAssistant`, default agency id `"milesymedia"`, env `MILESYMEDIA_ASSISTANT_API_TOKEN`, `/milesy-tag.js`). Same tenant — don't treat them as separate.
- **Two persistence concerns, don't conflate:** the whole `PortalState` is one JSON blob (file / postgres `portal_kv` / supabase `app_datastores`), *separate* from the discrete Supabase tables (`brand_enquiries`, `inbox_*`, etc.). Which blob backend is live depends on `PORTAL_BACKEND`. (See [database.md](../workspace/database.md).)
- **File-backed persistence contract was repaired 2026-08-25.** Whole-state commits
  now use a same-directory temp file, fsync and atomic rename; failed saves are
  surfaced and mark the backend unwritable; malformed JSON fails closed instead of
  becoming an empty writable state. Keep the recovery regression with any storage
  change. Cross-process collection transactions are still a separate concern.
- **State goes through `getState()` / `mutate(fn)`** (`src/server/storage.ts`) — never mutate returned objects directly. New collection → add to `types.ts` `PortalState`.
- **Auth is enforced in the server layer, not middleware.** `middleware.ts` matches `/portal/*` but is a pass-through no-op. Don't add auth there expecting it to run first.
- **Integrations ⇄ settings are always both — two views, one source (Ed's principle).** A connection (Meta, email, SMS, …) should be manageable from **both** "Your connections" *and* Agency settings — the user shouldn't have to hunt for where it lives. **But** it's stored **once** (the integration-connection record); settings *renders the same record*, it does not hold a second copy. Two stores would drift (see [hazards](../workspace/hazards-and-duplication.md)) — "both" means both surfaces, one source of truth.

## Verification discipline (Ed's point — a passing test ≠ working ≠ usable)
- Most tests are **static-source contract tests** — they assert code *shape*, not runtime behaviour. Green means "structure intact", not "it works". The generated docs share the limit — they were parsed, not run.
- **Never claim a feature works without running it.** Distinguish: coded → static-tested → runtime-verified → user-reachable. Record the real level in [status.md](status.md).
- When something matters, **exercise it** (click the flow / hit the live endpoint) and prefer a behavioural test (renders/calls and asserts the *result*) over another source-shape assertion.
- Editor AI now includes an opt-in two-independent-Node-process Postgres claim test,
  but it is skipped when `DATABASE_URL` is absent. Matching DDL and green local
  tests still do not establish that production has the migration applied; run the
  database test against the deployed contract before claiming production acceptance.

## Product decisions (settled — don't re-open without Ed)
- **Scope-down is deliberate.** The standard portal is *one* Website product; the rest of the catalogue gets rebuilt one at a time. Don't re-sprawl the product list.
- **Guess, then human-confirm.** Matching/classification always suggests; a human accepts. Every advisor/radar/external-AI suggestion requires acceptance before it becomes committed work — enforced in code (`createAgencyTask` behind a click). Don't build anything that auto-commits.
- **The Aqua Tag runs on Ed's own sites first (dogfood) before any client.** The client version is the same flow repackaged.
- **Radar's three axes are separate on purpose** — health ≠ evidence-confidence ≠ readiness. Missing evidence is a visible `blind` spot, never a healthy `pass`. Don't collapse them.
- **Action types are a contract** — `in-app` (Resolve button) / `off-system` (Mark done) / `judgement` (Evidence, no Resolve). Never offer Resolve for off-system/judgement work. Enforced at `AttentionControls.tsx:71`.

## Gotchas learned
- **`.npmrc install-links=true`** vendors plugins into `node_modules` — **re-run `npm install` after editing plugin source** or the change isn't picked up.
- **Two lockfiles** — npm is canonical (`.npmrc` + Vercel use npm); the `pnpm-lock.yaml` is stale/secondary.
- **Full test suite, not `smoke:all`** — 7 test files lack the `smoke-` prefix and are missed by the narrow glob. (See [tests.md](tests.md).)
- **Dev/demo inbox is empty by design** (`session.isDemo ? []`) — don't conclude enquiry features are broken from the sandbox.
- The assistant model is **`gpt-5-mini`** (default), via the OpenAI Responses API, non-streaming, 45s timeout.

## People
- Ed: solo founder, has been building this for months, pre-launch, burned out — communicate plainly and honestly, no dense walls. All data is his own test data.

_This file is for context that would otherwise be lost. Code structure lives in
the [file map](../WORKSPACE-FILE-TREE.md); issues/risks live in
[issues.md](issues.md); the running log is [updates.md](updates.md)._
<!-- AQUACRM_SOURCE_END path="docs/development/notes.md" -->

---

<a id="source-docs-development-production-readiness-md"></a>

## Source document — `docs/development/PRODUCTION-READINESS.md`

<!-- AQUACRM_SOURCE_START path="docs/development/PRODUCTION-READINESS.md" sha256="69689073325f254a4639a7af63e847988e74c1cfbbac89dd5e34d0fcfedcb536" -->
# Production readiness — current assessment

**Last verified:** 8 September 2026
**Evidence commit:** `a808bb3ff41808c7cc78d5c95530d47b213ffde1` on `main`
**Assessment:** advanced beta; suitable for a supervised pilot after the red gates below; **not production-grade for a broad paid launch today**.

This is the one current readiness assessment. It is a dated evidence snapshot,
not a second task list: [TODO.md](TODO.md) owns remaining work, [issues.md](issues.md)
owns detailed findings, and [status.md](status.md) retains the verification
history. Older readiness plans are historical once this file records a newer
verification.

> **UI Wave 9 (2026-09-08, uncommitted on `integration/ui-final-20260908`).** UI gate:
> **PASS — all ten items closed.** Closed with direct evidence: a harness that
> can no longer report a false pass, all 8 write journeys driven through the UI, a real
> date-determinism bug class fixed (a `/^\d+$/` regex typo + ~30 missing
> `Europe/London`/`UTC` pins — including **GDPR breach-deadline timestamps**, which are
> launch-relevant, and finance month labels that showed the wrong month in any zone behind
> UTC), and a green uncontended suite (final: 6842 tests, 6840/0/2 + WE 49/49). The two initially-blocked
> items were validated on a clean isolated PRODUCTION build (Supabase left unconfigured →
> the app's file backend; no live data touched): all four roles render on the prod build
> ×Chromium/WebKit/Firefox (11/12 cells clean), and a pre-hydration lost-click on the
> "New client" SSR control was CONFIRMED + quantified (~251 ms @ 1× silent-loss window),
> then — with Ed's approval — FIXED via an accessible `useHydrated()` boundary and proven
> on a rebuilt prod dist (132 ms visible pending state @ 1×; the first click once enabled
> always lands). See
> [UI-WAVE9-EVIDENCE.md](UI-WAVE9-EVIDENCE.md). Not committed/deployed; shared data and the
> live Supabase project untouched; no live Supabase data written.

## Headline rating

| View | Rating | Meaning |
| --- | ---: | --- |
| Product/application quality | **8.1/10** | A substantial, differentiated and broadly usable CRM/business operating system. |
| Production readiness | **6.2/10** | Core code is strong; live configuration, recovery, monitoring, provider acceptance and release automation are not yet strong enough. |

Readiness is bottleneck-weighted. A failed recovery or live-configuration gate
blocks launch even when most product capabilities and tests are green.

## Local engineering pass — 2026-09-08 (later, additive)

A code/tests/CI pass closed the safely-implementable red gates below. **No**
migration, credential, deployment, DNS or live-service change; the shared `.data`
state file was untouched. Distinguish *locally fixed* from *live-proven*: these
fixes are **not yet deployed to Railway**.

- **#187 health truth — FIXED, runtime-verified locally.** `/healthz/full` now
  enforces readiness on Railway/generic substrates (not Vercel-only) and both
  health routes expose a real SHA; verified against a Railway-equivalent server
  (200 local, **503** when unready, real `sha`+`platform:railway`). Not yet live.
- **#190 Webpack verification lane — FIXED, runtime-verified.** `npm run dev:verify`
  compiles and serves public + authenticated routes.
- **#189 Command Centre + login contrast — FIXED, axe-verified.** Two distinct
  serious color-contrast findings closed (CommandMoreButton 1.18→7.6:1; login
  footer 4.07→≈6:1); authoritative axe-core scan of `/login` + `/portal/agency` at
  1280/1920 = **0 violations**.
- **#188 CI pipeline — AUTHORED LOCALLY, UNCOMMITTED, NEVER RUN ON GITHUB**
  (`.github/workflows/ci.yml`). Valid YAML, but it is not tracked, has had no green
  GitHub run, and is not yet a required branch-protection check — so this is NOT
  "CI-proven" or "enforced". It closes the *authoring* gap only.
- **Observability** — error logging reworked to a single allowlist redaction
  boundary: production console logs and Sentry context carry ONLY a correlation id,
  a validated error class/name, the canonical route PATTERN, method and
  shape-validated tenancy ids — never the raw error object, message, stack, request
  path, query values or free-form extras (fake-email/password/token/query/PAN
  sentinel tests prove nothing leaks). The `@sentry/nextjs` install remains Ed-gated.
- Canonical suite **6,802/6,800/0 fail/2 skip**; typecheck 0; isolated production
  build **247/247** (clean isolation, no Supabase-hydration warnings); audit **0**.
  **All of the above is implemented + independently verified locally, but
  UNCOMMITTED and UNDEPLOYED.**

## Current gate ledger

*Rows marked "fixed locally" reflect the 2026-09-08 engineering pass and are NOT
live-deployed yet. The original snapshot rows are preserved where the state is
unchanged.*

| Gate | Result on 2026-09-08 | Boundary |
| --- | --- | --- |
| Git checkout and handoff | **PASS (committed) + UNCOMMITTED WORK PRESENT** | The committed `main` is clean at `a808bb3ff41808c7cc78d5c95530d47b213ffde1` (local HEAD = `origin/main`). **The working tree is NOT clean:** it carries the documentation reconciliation plus the uncommitted 2026-09-08 engineering-pass changes (health/observability/contrast/CI). Nothing is committed or pushed. |
| Focused readiness/security/data gate | **PASS — 144/144** | Production readiness, secret policy, observability, session revocation, release access, Ecommerce public checkout, consent capture, RLS coverage and schema-status source tests. |
| Canonical repository suite | **PASS — 6,800/6,802; 0 fail; 2 skip** (was 6,772/6,774) | 1,143+ suites; +28 new tests (healthz-readiness ×24, observability ×4). The two optional live-database lanes stay NOT TESTED. Website Editor 49/49. |
| TypeScript | **PASS** | `npm run typecheck`, exit 0. |
| Production build | **PASS — 247/247 (isolated, clean)** | The 2026-09-08 engineering-pass build ran with an explicitly isolated file backend + isolated data file/dist and emitted **no** Supabase-hydration warnings (74s compile, exit 0). *(An earlier NON-isolated build had emitted failed Supabase coherent-state/sidecar hydration warnings; that is a property of a non-isolated build, not of the code.)* |
| Production dependency audit | **PASS** | `npm audit --omit=dev --audit-level=moderate`: 0 vulnerabilities. The full dependency tree has one low-severity development `esbuild` advisory affecting its Windows development server. |
| Safe local browser matrix | **PASS — 1,326/1,326; 0 fail; 0 serious-critical** (#189 fixed) | Full 13-page × 17-viewport re-run on a FRESHLY-built turbopack lane (a stale `.next-dev-turbo-*` cache had served pre-fix CSS). Both serious color-contrast clusters fixed (Command Centre `mm-command-more-button`; login `.mm-auth-brand-foot`); authoritative axe-core scan of `/login`+`/portal/agency` at 1280/1920 also = 0 violations. Was 1,314/1,326. |
| Deep UI/UX·responsive·a11y acceptance (Waves 1–9, #191) | **PASS (Wave 9, uncommitted)** | Waves 1–8 closed every confirmed defect; Wave 9 closed the coverage: harness hardened against false passes (mutation-proven self-tests), all 8 write journeys driven through the rendered UI + persisted, date determinism fixed (+regression tests), all four roles rendered on a clean isolated PRODUCTION build ×Chromium/WebKit/Firefox (11/12 cells clean, 12th a benign WebKit RSC-prefetch), and the production-confirmed pre-hydration lost-click FIXED via the accessible `useHydrated()` boundary (proven on a rebuilt prod dist; pinned by `smoke-hydration-boundary`). Final suite 6842/6840/0/2 + WE 49/49. See [UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08](UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08.md) + [UI-WAVE9-EVIDENCE](UI-WAVE9-EVIDENCE.md). |
| Normal local development path | **PASS** | Turbopack served the isolated file-backed `/dev` and portal path successfully. |
| Documented Webpack verification path | **FIXED LOCALLY (#190) — PASS** | `npm run dev:verify` compiles and serves `/healthz`, `/`, `/login` and (via `/dev`) `/portal/agency`. Root cause was the Node-only radar/email graph entering the Edge instrumentation bundle; fixed with a `NEXT_RUNTIME !== "edge"` DCE guard + lazy nodemailer. |
| Required CI release pipeline (#188) | **AUTHORED LOCALLY — UNCOMMITTED, CI-UNPROVEN** | `.github/workflows/ci.yml` exists in the working tree (valid YAML; `verify` + bounded `browser` axe gate; secretless; live lanes excluded). It is **untracked, has never run on GitHub, and is not a required branch-protection check.** Not "remotely proven" or "enforced". Owner steps: commit/push → first green GitHub run → require both checks in branch protection. |
| Local launch audit | **BLOCKED — 3/4 required ready** | Local handoff configuration lacks production secure-access readiness. This does not override the separate live result below. |
| Live `www` deployment | **PARTIAL (fix pending deploy)** | Homepage and liveness respond. `readyForProduction:false` (email `needs-setup`), SHA `null` — the **#187 fix** (correct 503 + Railway SHA) is code-complete and locally proven but **not yet deployed**; redeploying `main` after these fixes ships it. Required email is still an Ed task. |
| Apex `aqua-crm.com` | **FAIL** | TLS certificate hostname validation fails; `www.aqua-crm.com` is the working host. |
| Live provider acceptance | **NOT PROVEN** | Real Stripe settlement/webhooks, Meta, production email and the complete provider-backed persona journeys were not exercised in this review. |
| Backup and recovery | **PARTIAL / BLOCKED** | Encrypted self-managed backup tooling exists and was locally rehearsed historically. Activation, off-site delivery, a downloaded live-artifact restore, timing and missed-backup alert proof remain open; PITR is off. |
| Live schema/RLS status | **PARTIAL CURRENT EVIDENCE** | The live health probe proves database connectivity. The repository records a successful 2026-09-03 migration/RLS run, but this review did not independently reconnect to Supabase to re-verify schema, policy, account or backup state. |

## Live deployment truth

> This describes the **deployed** app, which still runs committed `a808bb3f` — the
> local #187 fix is uncommitted and undeployed, so the live behaviour below is
> unchanged until a redeploy.

Read-only requests on 8 September 2026 observed:

- `https://www.aqua-crm.com/` returned HTTP 200;
- `/healthz` returned `ok:true`, `env:"production"` and `sha:null`;
- `/healthz/full` returned HTTP 200 while also returning
  `readyForProduction:false`; required email was `needs-setup`;
- the response was served by Railway, while `healthz/full` only folds readiness
  into HTTP status when `VERCEL_ENV === "production"`. On Railway that condition
  is false, so monitoring can receive HTTP 200 for an explicitly unready release;
- billing and monitoring are classified optional by the health model. The health
  model is therefore necessary operational evidence, not the complete release gate;
- the apex domain failed TLS hostname validation.

The live deployment must not be called production-ready until the detailed probe
is truthful on Railway, required email is ready, the apex-domain policy is fixed,
and the deployment SHA is traceable.

## Browser finding — SUPERSEDED (fixed locally 2026-09-08, #189)

> **This original finding no longer holds.** The twelve serious `color-contrast`
> failures were fixed locally on 2026-09-08 (#189) and the full 13×17 matrix now
> passes **1,326/1,326, 0 serious/critical** — see the "Safe local browser matrix"
> gate row above and `issues.md` #189. This section is retained as the dated
> original finding, not a current claim; the fix is uncommitted and undeployed.

*Original finding (before the 2026-09-08 fix):* The 13-page × 17-viewport matrix
recorded 1,326 checks with **twelve failures** — duplicate instances of the same
serious `color-contrast` finding on `/portal/agency` and on `/login`. The affected
labels were **Key numbers, Projections, Advisor, Actions and Calendar**, measured
at approximately `#040404` on `#1a1b18` (1.18:1; 4.5:1 required). Root cause turned
out to be the legacy global `[class*="-button"]` rule in `globals.css` clobbering
the Tailwind `mm-command-more-button`, plus a separate login `.mm-auth-brand-foot`
finding; both are now fixed and axe-verified 0.

The retained machine-readable result is
`.artefacts/browser-matrix/records.json`. That artefact is local and ignored; it
is evidence for the run, not a tracked release deliverable.

## Production blockers, in order

1. Configure and prove required production email on Railway.
2. Repair the apex TLS/custom-domain path and complete real Stripe checkout,
   signed webhook, settlement and digital-delivery acceptance for Ecommerce #69.
3. ~~Make `/healthz/full` enforce readiness on the actual production substrate and
   expose a deployed commit SHA.~~ **DONE locally 2026-09-08 (#187), pending deploy.**
4. Set `PORTAL_BACKEND=file` and a dedicated `PORTAL_DATA_FILE` for local work;
   rotate the Supabase database password and access token recorded as exposed in
   the 2026-09-03 transcript.
5. Activate encrypted backups, deliver them off Supabase, restore a downloaded
   live artefact into an isolated target, record RPO/RTO and exercise the missed-
   backup alert. Revisit the decision to operate without PITR.
6. Add a required CI release pipeline — **workflow AUTHORED locally 2026-09-08
   (#188, `.github/workflows/ci.yml`), but UNCOMMITTED and never run on GitHub.**
   Not closed until: commit/push → first green GitHub run → required in branch
   protection.
7. Install/configure and live-prove a production error-monitoring sink. (Code path
   complete incl. structured/correlated logging; only the `@sentry/nextjs` install
   + DSN remain — Ed.)
8. ~~Close the Command Centre contrast regression and restore the documented
   Webpack verification lane.~~ **DONE locally 2026-09-08 (#189, #190).**
9. Run production-exact mutation journeys with real roles and providers, including
   onboarding, email, uploads, Stripe and failure/retry/reconciliation paths.
10. Continue the relational extraction and durable outbox work for identity,
    communications and money before relying on horizontal scale.

## Architecture and operations residue

- AquaCRM remains a large modular monolith: about 2,097 TypeScript/TSX files,
  418,000 source lines, 124 page routes and 259 API route files at this checkpoint.
- The PortalState/blob system remains the primary truth for much of the product.
  Semantic Phase 0 is shipped; extraction Phases 1–7 remain partial.
- The in-blob outbox has durable groundwork but lacks a cross-process claim,
  durable per-consumer acknowledgement, retry/backoff, poison-event dead-lettering
  and replay. A rejected asynchronous handler or crash after in-process handoff
  is not retried.
- Telemetry still uses a capped metadata collection. Critical financial and
  communications records should move before convenience data.
- The only **committed** GitHub Actions workflow is database backup. A
  pull-request/release verification workflow (`.github/workflows/ci.yml`) now
  exists **in the working tree but is uncommitted and has never run on GitHub**, so
  the release gate is not yet CI-enforced.

## Realistic distance

Assuming scope is frozen and the necessary account access is available:

- **supervised internal/controlled pilot:** about 1–2 focused weeks;
- **defensible paid production launch:** about 4–8 focused weeks, plus provider,
  DPO and credential waiting time;
- **all P1 acceptance plus every relational-extraction phase:** a larger multi-
  month programme and not a prerequisite for a deliberately narrow first launch.

## Evidence boundaries

No source, tracked configuration, migration, provider account or live customer
record was changed during the assessment. Browser work used an isolated file
backend. Live checks were read-only HTTP requests. The two database-dependent
test lanes were skipped, so historical Supabase migration/RLS evidence remains
historical rather than being promoted to a current live verification.

Historical counts in `status.md`, `tests.md`, plans and update logs remain valid
for the dated commits they name. They must not be quoted as the current baseline
when this document records a newer result.
<!-- AQUACRM_SOURCE_END path="docs/development/PRODUCTION-READINESS.md" -->

---

<a id="source-docs-development-roadmap-md"></a>

## Source document — `docs/development/roadmap.md`

<!-- AQUACRM_SOURCE_START path="docs/development/roadmap.md" sha256="f3ef33649d6f5b6404a5c1a8216e93313090263e719b34d02228028b13ee2e90" -->
# Roadmap

← [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) · [TODO.md](TODO.md) · **The strategic outer view.**

> **Planning boundary, corrected 2026-09-08:** the outcomes below retain the
> horizon/progress last written through the Dev Console and include historical
> narrative. They are product planning, not current release evidence. Current
> launch truth lives in `PRODUCTION-READINESS.md`; actionable work lives only in
> `TODO.md`. Re-check source before moving a horizon or claiming an outcome done.

_Written and edited from the Dev Console (`/portal/dev-team/roadmap`). Each item is an
OUTCOME; the plans under it are how it gets built, and their phases are the tasks. Progress
is computed from those tasks — never typed here — so this file cannot drift on its own._

**Horizons:** `Now` in flight · `Next` queued · `Later` after launch · `Someday` ideas and
requests · `Shipped` done.

> **2026-08-24 scope correction:** a later same-day read-only review reopened
> security/compliance. The P0/P1 work in the current `Now` outcome supersedes
> the earlier non-security-only note.

---

## Now
_In flight — someone is on it._

### Mission critical: make the whole app and development loop fast
**Id:** mission-critical-app-speed · **Status:** building · **Size:** L · **Added:** 2026-08-26 · **Source:** ed-live-runtime
**Files:** next.config.ts, package.json, tsconfig.json, scripts/dev-preflight.mjs, public/manifest.webmanifest, src/app/portal/agency/layout.tsx, src/app/portal/agency/page.tsx, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_ExecutiveCommandWorkspace.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/layout.tsx, src/lib/server/dev/devTeamHomeSnapshot.ts, src/components/chrome/DeferredPortalSearch.tsx, src/components/chrome/LibrarianDrawerControl.tsx, src/components/editing/LibrarianPanel.tsx, src/lib/chrome/sharedChromeLinkPrefetch.ts, scripts/smoke-command-center-perf.test.ts, scripts/smoke-dev-team-perf.test.ts, scripts/smoke-dev-team-shell.test.ts, scripts/smoke-shared-chrome-speed.test.ts
**Why:** Port 3032 was too slow to inspect, browser-verify or use comfortably. The clean pre-fix /dev → Agency path was 13.15 seconds, with earlier cold API fan-out at 24–34 seconds and common warm Agency renders at 0.8–1.4 seconds. This supersedes the old historical Shipped row named “The app loads fast.”

Measure before and after every change. Remove eager route graphs and hidden server work from the
critical path; stop inactive Command Centre stations from executing before selection; make
notifications/search/company switching warm deliberately instead of racing first paint; retain
truthful loading and failure states. Acceptance targets: interaction response under 100ms, ordinary
warm local navigation under 300–500ms, non-provider local API p95 under 250ms, cold development
route under 3–5 seconds, no reload storm, and no repeated work without a data-freshness reason.
`0.01ms` is not a valid end-to-end target: rendering and even one process/network boundary are
orders of magnitude slower.

**2026-08-26 measured pass:** Performance Mode is now the default lightweight path; Search no
longer warms on mount; notifications are stale-windowed and deduplicated; Agency chrome uses a
small metadata catalog instead of the executable plugin registry; Demo seed code is loaded only
for Demo operations; server-backed stations are selected by URL and Actions/Calendar/Advisor use
true lazy client boundaries; CompanySwitcher and SmartWorkSessionMonitor hydrate from signed
server state rather than issuing mount GETs. The shared Agency layout shrank **13.95MB → 2.27MB**, the page client
chunk **7.82MB → 3.47MB**, the server page **26.73MB → 13.42MB**, and the client-reference manifest
roughly **154KB → 49KB**. Webpack first improved `/dev` → Agency **13.15s → 9.80s**. The normal
3032 scripts now use Turbopack's disk cache with explicit Webpack fallbacks: an isolated pristine
cache was **7.10s**, a first Agency request after restart was **1.23s**, final 3032 first Settings
was **4.0s**, first Search **2.61s**, and seven warm Agency requests had a **0.164s median**. Agency,
Calendar, Actions, Demo Sandbox entry and return to live passed on the final server with zero
console warnings/errors. Status remains **Building** because a pristine cache still misses 3–5
seconds. Next physically split optional stations into real route-specific clients, then migrate
product/pipeline/plugin repair out of GET renders for correctness and read-only realm integrity.

**Current P0 correction and repair:** those Agency measurements do not describe the whole app.
An authenticated cold `/portal/dev-team` request returned zero bytes after **120.006s** because
the compiler hit `ENOSPC`: accumulated generated Next outputs left **1.3 GiB** free on a 100%-used
volume. With approval, 15 exact generated outputs under `portal/private/tmp` (about **18 GiB**)
were removed without touching source, state, uploads or docs, restoring **23 GiB** free. A new
non-destructive preflight blocks every dev entry below 2 GiB, and narrowed TypeScript includes
reduce project expansion from 6,869 to 1,796 files (about 1.78s to 84–108ms). Full-source isolated
file-backed HTTP is now Turbopack **6.875s cold / 0.208s warm** and Webpack **9.423s cold / 0.200s
warm**; Dev performance **21/21** and TypeScript pass. The hang is diagnosed, cleared and guarded,
but both cold figures still miss the 3–5s target and do not prove whole-app speed.
A later clean restarted browser made Dev Team Home visibly ready on mobile in **3.897s** and
completed warm 1280px navigation in **367ms**, without overflow or browser warnings/errors.
Library/Logs, Dev Docs, outside-edit freshness and the wider cold matrix were still open at that
checkpoint; the 2026-08-27 completion evidence immediately below supersedes that residue.
Exact heavy Editor and Findings links now disable prefetch while preserving click navigation.
A clean >9-second Home network window issued only `GET /portal/dev-team 200 in 3.7s`, with no
Editor/Findings request, H1 present, no overflow and no browser warnings/errors; proof is **3/3**.

**2026-08-27 completion evidence:** the bounded engineering, local measurement, isolated production
benchmark and representative browser acceptance are done. The wider outcome remains **Building**
only for the queued deployed geo/CDN/provider latency follow-up; that does not reopen the completed
local phase.
A clean isolated Webpack benchmark built **281 pages in 135,196.3ms**
with a **1,479,314,365-byte** dist. Each target used its own fresh production process after a
TCP-only readiness probe: auth first/repeat-max **619.1/7.7ms**, public **593.1/9.8**, Agency
**727.8/28.3**, Dev Team **726.4/31.2**, Library **693.0/26.4** and Logs **741.0/29.0**. All
responses were 200 and within payload budgets; process readiness was **205–308ms**. Build and host
filesystem/page caches were shared, so this is fresh-process—not cold-machine or deployed-CDN—proof.

Local development evidence remains separate. Agency's retained baseline was about **3.8s compile
+ 315ms app cold / 784ms warm**. The final static proxy closure then fell **1,139,995→255,050
bytes (-77.6%)**; no comparable post-change runtime was recorded because a concurrent external
`tsconfig` alias blocked a clean start. Library improved **4.428→3.290s cold / 146→142ms warm**.
Logs improved **3.182→0.857s first**, **2.702→0.868s post-TTL**, with a later warm sample of
**109ms TTFB / 252ms total**; its eager graph fell **47 modules / 469,232 bytes → 3 / 15,433**.
Canonical Library scanning measured **67.6→1.0ms** and Logs activity scanning **95.4→38.5ms**.
At 1280px, fresh Agency Day settled without loading/overflow and showed Radar paused, not scanned
and unknown instead of false-clear values; Battle settled with content, Library rendered its
heading and Logs streamed `Where work is happening` within five seconds. At **390×844**, Logs,
Agency Day and Battle matched the 390px document width with content and no loading/overflow. The
browser warning/error log remained empty. The paused Radar/KPI/Advisor/client-attention behavior is
also source/behaviour-green **49/49 + TypeScript**: no completed scan remains unknown, while a
completed loaded zero is zero.

The speed work also hardened shared waits and caches instead of trading correctness for latency.
Named provider deadlines emit duration/status telemetry and preserve unknown-write outcomes;
Sandbox fences stop network calls at shared boundaries. Radar, Search and Dev Console caches are
realm-keyed, and Search includes current effective access so hidden Staff candidate families do
not leak and revocation is immediate. Editor AI generation now uses the same provider boundary,
realm-scopes local claims/deduplication and retains ambiguous claims instead of duplicating work;
its focused gate is **35 passed / 1 optional live-Postgres skip**. The final combined code release
gate is **335 passed / 0 failed / 1 expected live-database skip**, with full TypeScript green; it
is not a new whole-suite run. The production harness owns disposable state/dist/config, validates
cleanup targets and restores `next-env.d.ts` only if its exact generated bytes remain.
The deliberate residue is completed-scan station navigation carrying `scan=1`, which can rerun
until a safe server-issued result token replaces it. Do not turn that or deployment latency into a
false claim that the measured local/isolated-production work did not land.

**2026-09-02 release measurement:** the newer isolated benchmark built in **158,476.1ms** with a
**1,584,943,643-byte** dist. Fresh-process first/repeat-max was auth **765.9/9.2ms**, public
**641.4/6.0ms**, Agency **949.4/53.1ms**, Dev Team **869.2/38.9ms**, Library **803.6/30.4ms** and
Logs **892.8/30.7ms**; process readiness was **304.3–309.1ms**, all responses were 200 and every
failure list was empty. The first-load station boundary passed **8/8** fresh cacheless Chromium
contexts: Day transferred **674,535B** of JS/CSS, with Executive **+4,473B**, Battle **+36,102B**,
Calendar/Actions **+42,174B**, Advisor **+12,528B**, Dev Team **+21,059B** and Radar Inspector
**+34,731B**. Transfer is not execution or paint. The broad responsive matrix is **1,177 passed /
0 failed / 149 evidenced aborted speculative RSC-prefetch observations / 0 missing** across all
**1,326** checks; the corrected Settings run is **92 / 0 / 10 / 0** across **102** checks. A final
exact-width **6/6** probe covers Settings Environment at 768px, Studio at 390/1024/1440 and
Fulfilment Roles at 390/1280 with HTTP 200 and zero console/page/request/HTTP errors. Shared host
caches mean the timing remains fresh-process rather than cold-machine or deployed-CDN proof; live
provider credentials, deployed geography/CDN timing and production telemetry remain operational
acceptance. That probe retained an unchanged source hash. The isolated-production Staff Technical
matrix passed **50/50** through six same-cookie Hidden → View → Use → Manage → View → Hidden
transitions with zero failures, errors or overflow; hidden pages use valid streamed Next not-found
content (document HTTP 200 or 404), and the exact API downgrade returned 403. Fulfilment checked
mutations passed injected failure/alert/no-reload/rollback-or-retain/retry acceptance at 390px and
1280px. The final primary production webpack build compiled in **47s**, completed TypeScript in
**5.1s** and generated **245/245** pages in **489ms**. The final canonical `smoke:all` Node phase
executed **6,417 tests across 1,093 suites: 6,415 passed / 0 failed / 2 skipped in
94,027.354917ms**; Website Editor passed **49/49 files in 11.8s**.

### Mission critical: launch the repository-backed Dev Workspace
**Id:** repository-backed-dev-workspace-launch · **Status:** building · **Size:** XL · **Added:** 2026-08-26 · **Source:** ed
**Plans:** dev-editor-finish
**Files:** docs/PRODUCT-ARCHITECTURE.md, docs/development/plans/dev-editor-finish.md, docs/workspace/aqua-tag.md, src/app/portal/dev-team/, src/engines/editor/, src/lib/server/dev/, src/lib/server/integrations/githubProjectPublisher.ts, src/server/types.ts
**Why:** The launch product is not a production-site mutation trick. AquaCRM connects or creates a

repository, checks out an isolated branch/worktree, starts that project's declared local development
server under supervision, renders its loopback preview inside the editor, maps visual selections to
source, lets AI or a human propose file changes, shows the diff, runs checks, and publishes through
commit/PR/merge. GitHub stores the code; AquaCRM owns the controlled workspace and preview process.

For an owned or explicitly authorised site with no repository, capture the public frontend and
assets, identify routes/forms/auth/data/providers, create a repository and reconstruct it with AI
under a parity checklist. Never promise an exact backend clone from public HTML alone. Aqua Tag is
optional for repository previews and remains the consented marketing/telemetry/tag-injection and
remote-inspection bridge when source is unavailable; it is not the code source of truth.

The same workspace can be exposed from a client portal only through project/workspace grants.
Effective human access is default-deny and intersects actor membership, project, workspace,
resource, environment and explicit capability. Global developer/staff/freelancer/customer labels
remain persona/templates, never blanket resource access. The implemented vocabulary separates
workspace/project view and management, edit, AI, preview, local-process control/logs, PR, publish,
deploy, access governance and stable element levels. Live and Sandbox use the same evaluator over
different resource realms. AI/service principals and expiring share links must adopt the same exact
scope, issuer ceiling and revocation model when implemented; the human UI does not ship them
implicitly.

**2026-08-26 implementation checkpoint:** the first trusted local-repository supervisor/control,
exact-project Dev Workspace and direct Dev API capability gates are implemented. The
supervisor is manifest-driven, local/test only, loopback-bound and does not accept browser-supplied
paths, commands, ports, environment or shell. The reusable workspace projects view, edit, AI,
explorer and publish separately and leaves internal Dev Team outside the grant. A repository-backed
browser journey now proves Start, Restart with a replacement loopback process, Stop, responsive
Preview/Code panes and HTTP 200 for `/aqua-tag.js`. The remaining lifecycle—repository preparation,
inspect/edit/AI/diff/save/reload/checks/PR plus crash, dependency, occupied-port and dirty-transition
paths—remains the launch gate. Repository clone/worktree/install automation, no-repository migration
and final client embedding are not made complete by the supervisor alone.

### Mission critical: configurable access, permission requests and workspace parity
**Id:** configurable-access-workspace-parity · **Status:** building · **Size:** XL · **Added:** 2026-08-26 · **Source:** ed
**Plans:** configurable-access-and-workspace-parity, dev-editor-finish, runtime-verification
**Files:** docs/PRODUCT-ARCHITECTURE.md, docs/development/plans/configurable-access-and-workspace-parity.md, docs/development/plans/dev-editor-finish.md, docs/development/plans/runtime-verification.md, src/server/accessControl.ts, src/server/types.ts, src/components/access/, src/app/api/portal/access/, src/app/portal/agency/settings/, src/app/portal/agency/people/, src/app/portal/agency/fulfilment/, src/app/portal/dev-workspace/, src/app/api/portal/dev/, src/lib/server/sandbox/sandboxEnvironment.ts
**Why:** AquaCRM must let Ed configure each person's real access instead of treating a broad job

title as resource authority. This work started earlier than the old third-phase sequence and now
has an implemented broad first adoption wave; security, durability and other P0 release gates remain separate.

One canonical server evaluator now resolves fresh live identity against exact agency, workspace,
client or project scope, live/Sandbox environment, explicit base capabilities and stable registered
`element.<key>.view|use|manage` capabilities. Persisted reusable role templates, direct grants,
expiry/revocation and idempotent permission requests support approve-as-requested, narrowed approve,
deny and cancel without self-approval or delegation above the reviewer ceiling. The shared manager
is mounted in Settings, People and Fulfilment with Hidden/View/Use/Manage controls and exact
disclosed scope/environment choices. Staff stations and Fulfilment views now derive their
navigation/direct pages and representative server operations from those levels. Client workspaces
register 11 stable elements and enforce exact-client access across layout, tabs, Settings,
plugin catch-all and representative mutations; identities with an unrelated governed grant no
longer retain an implicit tunnel into every client. All tenant route files containing `clientId`
are **35/36** canonical-gated; the sole exception is the dev-only empty-store seeder, and the
source contract pins 28 completed mappings. The final focused set passes **62/62** including six
direct tests, separate product-workspace cross-process proof passes **4/4**, and TypeScript/diff
pass. Expense attachments lack client identity and agency/global branches remain agency surfaces.
Dynamic plugin handlers for Fulfilment, Client CRM, Ecommerce, Memberships and Affiliates plus
freelancer-job and generic task/task-template associations are classified and enforced under
#172. Customer/session/
relationship, Dev-project, workspace-create, website-source and output/derived routes retain their
named alternative authority; this is deliberately not every-client-API parity.

The final static/browser closure repaired the remaining concrete holes found in this wave:
Fulfilment client list/create requires Services View/Manage; Staff People page/API results are
element-specific DTO projections; governed client/end-customer collaboration actions enforce
their matching client element; the inert generic Development workspace scope is removed; and
the exact Staff/Fulfilment access composer cannot retain cross-workspace elements. `/dev` also
uses the explicit live realm even when an old Sandbox cookie arrives. Focused **92/92 + 11/11 +
32/32**, TypeScript and diff pass. On a clean restarted browser, Staff exposed only six base plus
six Staff keys, Fulfilment only six base plus five Fulfilment keys, and the 390px selector/People
Capacity surfaces had no overflow or alerts. The Role template composer visibly exposed all four
scope kinds, Live/Sandbox and all **28** stable element groups; a label click changed
`staff.pay` Hidden→View and was restored without submitting. The complete repository suite and
cross-persona mutation/accessibility matrix were not run in this wave.
The settled relevant combined gate is **130/130**: 86 core access/Dev/workspace/client/People,
11 exact Access UI, 21 Dev Team performance and 12 Sandbox environment/protection checks.

The first project consumer is also implemented: `/portal/dev-workspace` lists only exactly granted
projects, mounts the shared editor with separate view/code/AI/explorer/publish gates, and direct Dev
APIs re-check project plus element capability. Live state governs identities/templates/grants/
requests while the signed active Sandbox realm supplies resources; safe non-owner Demo entry cannot
reset the shared dataset or choose a privileged persona, and live revocation invalidates an old
Sandbox session. Focused regressions cover active resource-agency ids, non-governor read-only
enforcement and the dynamic-loopback preview CSP.

Representative browser proof now covers the access manager at 360/390/430/768/1024/1280/1680,
real Overview-only Staff and Fulfilment identities plus their hidden direct routes, denial of a
client workspace/Settings without an exact client grant, Freelancer phone/desktop rendering,
responsive editor panes and preview Start/Restart/Stop. A later isolated-production Staff Technical
matrix passed **50/50** through six same-cookie Hidden → View → Use → Manage → View → Hidden
transitions with zero failures, errors or overflow; hidden routes used valid streamed Next not-found
content and the exact API downgrade returned 403. Status remains **Building**. Preserve the
completed dynamic-module/freelancer-job/task classifications while finishing evaluator adoption
across remaining customer/freelancer/legacy reads and mutations; decide AI/service
principals and expiring share links; and complete the real two-user/two-project/two-environment
create/grant/request/approve/revoke mutation matrix, positive exact-client journey, accessibility,
failure and remaining Dev editor lifecycle. The Staff result is isolated-browser evidence, not the
still-open provider-backed live-persona/shared-credential acceptance.

### Runtime reliability and truthful state
**Id:** runtime-reliability · **Status:** building · **Size:** L · **Added:** 2026-08-24 · **Source:** source-review
**Files:** docs/development/checklist.md, docs/development/issues.md, docs/development/status.md, src/app/api/portal/dev/projects/route.ts, src/lib/server/auth/auth.ts, src/app/api/portal/settings/external-ai/route.ts, src/proxy.ts, src/server/clientErasure.ts, src/app/api/portal/clients/[clientId]/erase/route.ts, src/server/storage.ts, src/server/storagePostgres.ts, src/server/storageSupabase.ts, src/engines/editor/server/editorAiReply.ts, src/engines/editor/server/editorAiReplyClaim.ts, src/engines/editor/DevEditor.tsx, src/engines/editor/unsavedEditorWork.ts
**Why:** The product is broadly built. The production build, file persistence, showcase boundary/fixture, erasure failure contract and audited editor/data slices are repaired. Central session freshness and role revocation are resolved under issue #22; an old privileged cookie no longer survives downgrade across the shared session boundary.

The transactional owned-sidecar path is source/mocked verified, and its
migrations were recorded applied to live PostgreSQL on 2026-09-03. The
2026-09-08 review did not rerun the live concurrency exercise, so provider-backed
acceptance remains open.

Finish the remaining work in this order: apply and live-prove the Editor AI and
owned-sidecar database contracts; complete the dirty-state editor browser matrix;
finish provider-backed live-persona/shared-credential Staff acceptance;
reject or explicitly policy-bound unresolved client/task/template/product/
KPI/Custom-AI/Development/People/Team-Chat/inbox references and Finance, HR,
Marketing, Leads Pipeline, Client CRM, Memberships and Email Sender relations,
including nested assignments/audiences and parent deletion; make Lead Archive
recoverable and reconcile its surviving foundation card; make Membership/Affiliate
and SOP retirement dependency-safe; then profile/remove hidden read work. The named
client-route bypasses and fabricated website default are closed, but the broader
reference class remains. Fresh-process
probes persisted the expanded missing-reference matrix and deletion orphans while
focused Finance and built-in suites stayed **5/5** and **82/82**. Current launch
evidence is in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md), remaining work
is in [TODO.md](TODO.md), and detail remains in [issues.md](issues.md).

Erasure's failure mode is now behaviorally closed in isolation: three forced
live-delete failures preserve the client and produce retryable HTTP 502 plus
de-identified outcomes; the retry succeeds, deletes the client and retains no name
in the permanent audit. Production-provider acceptance remains separate.

### Marketing workspace
**Id:** marketing-workspace · **Status:** parked · **Size:** M · **Owner:** marketing · **Added:** 2026-08-20 · **Source:** ed
**Plans:** marketing-workspace-overhaul
**Files:** docs/development/plans/marketing-workspace-overhaul.md, scripts/smoke-marketing-customer-profiles.test.ts, scripts/smoke-marketing-intelligence.test.ts, scripts/verify-marketing-runtime.ts, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx, src/app/portal/agency/marketing/_marketingViews.ts, src/app/portal/agency/marketing/page.tsx, src/lib/people/customerProfileScope.ts, src/lib/server/marketingIntelligence.ts
**Why:** Marketing is where spend turns into enquiries; without it attribution is guesswork.

P1–P4 and attribution shipped. BLOCKED ON ED for P6 — consolidate the 12 views, and fixed KPIs vs an explorer.

### Onboard the clients who are waiting
**Id:** onboard-the-clients-who-are-waiting · **Status:** building · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** connect-flow-real-codes
**Why:** Ed has clients waiting and deadlines. Everything else on this roadmap is worth less than a client actually logged into their portal.

THE CHAIN: client exists → connection link → they sign in → they see their portal. The source path is built; the fourth step has never been walked in a browser. `connect-flow-real-codes` is shipped and server-runtime-verified 13/13 and 14/14 (code generation, HMAC bound to connection+user, constant-time verify, 15-min TTL, single-use, 5-guess lockout, resend throttled 5/15min, real Resend email). The immediate acceptance step is the code click-through. An isolated sandbox (`npm run sandbox:fork`) makes that walk possible without sharing state. Onboarding readiness must also account for the open runtime-reliability outcome above.

---

## Next
_Queued — starts when a slot frees._

### Browser-verify everything that shipped unseen
**Id:** verify-sweep · **Status:** planned · **Size:** M · **Added:** 2026-08-20 · **Source:** commander
**Plans:** connect-flow-real-codes, dev-team-finish, marketing-workspace-overhaul, finance-command-surface, kpi-intelligence-overhaul
**Files:** docs/development/finance-command-surface-HANDOFF.md, docs/development/plans/connect-flow-real-codes.md, docs/development/plans/dev-team-finish.md, docs/development/plans/finance-command-surface.md, docs/development/plans/kpi-intelligence-overhaul.md, docs/development/plans/marketing-workspace-overhaul.md, scripts/smoke-close-deal-route.test.ts, scripts/smoke-dev-team-portal.test.ts, scripts/smoke-finance-aging.test.ts, scripts/smoke-finance-budget-control.test.ts, scripts/smoke-finance-channels.test.ts, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-finance-delight-expense.test.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-operations.test.ts, scripts/smoke-finance-stripe.test.ts, scripts/smoke-kpi-registry.test.ts, scripts/smoke-kpi-targets.test.ts, scripts/smoke-marketing-customer-profiles.test.ts, scripts/smoke-marketing-intelligence.test.ts, scripts/smoke-portal-connections.test.ts, scripts/smoke-radar-kpi-scorecard.test.ts, scripts/smoke-universal-search.test.ts, scripts/verify-marketing-runtime.ts, src/app/api/portal/connections/accept/route.ts, src/app/api/portal/connections/request-code/route.ts, src/app/api/portal/kpi-registry/custom/route.ts, src/app/api/portal/kpi-registry/evidence/route.ts, src/app/api/portal/kpi-registry/targets/route.ts, src/app/api/tenants/close-deal/route.ts, src/app/connect/[connectionId]/_ConnectFlow.tsx, src/app/connect/[connectionId]/page.tsx, src/app/portal/agency/_CommandCentreKpiTrajectory.tsx, src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx, src/app/portal/agency/marketing/_marketingViews.ts, src/app/portal/agency/marketing/page.tsx, src/app/portal/agency/page.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/dev-team/_ui.tsx, src/app/portal/dev-team/auditor/_Section.tsx, src/app/portal/dev-team/auditor/page.tsx, src/app/portal/dev-team/layout.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/working/_Board.tsx, src/app/portal/dev-team/working/page.tsx, src/built-ins/modules/agency-finance/, src/lib/chrome/sidebarLayout.ts, src/lib/people/customerProfileScope.ts, src/lib/performance/kpiRegistry.ts, src/lib/server/clients/clientDelightExpense.ts, src/lib/server/closeDeal.ts, src/lib/server/connectionConfirmation.ts, src/engines/data/server/kpi/customKpis.ts, src/lib/server/dev/devTeamAuditor.ts
**Why:** Several things shipped typecheck-clean but were never looked at in a browser — "complete" is not "launch-safe".

Unverified: dark mode, Inspector, the finance UIs (pay-by-card, close-the-deal, AR/AP aging), the connect-flow code step, the enquiry card on real data, the KPI custom builder, and the deliberate dirty-state Editor transition matrix recorded in issue #19. Logs is no longer in this list: it settled at 1280px and 390×844 without overflow during the speed phase. Paused-inner-Day is also closed: mounted Day retained paused/not-scanned/unknown truth with no false-clear labels, and Battle settled after navigation. Page SEO/Element Insert response ordering and mode/surface/lifecycle/hide/split/refresh source guards are now regression-covered, and the live editor renders; the remaining matrix must intentionally dirty and discard each state without saving. The current production build is green. Browser isolation is available through `npm run sandbox:fork`, which gives each verifier its own state file, build dir and port.

### Measure deployed geography and provider performance
**Id:** deployed-performance-and-scan-result-token · **Status:** planned · **Size:** S · **Added:** 2026-08-27 · **Source:** speed-acceptance
**Files:** scripts/benchmark-production.mjs, src/app/portal/agency/_CommandCentreClient.tsx, src/app/portal/agency/page.tsx, src/lib/server/radar/businessIssueRadar.ts
**Why:** The local production benchmark is green, but it deliberately excludes deployment geography, CDN/edge behavior and real-provider latency.

The scan-result half is resolved under #186: a protected POST issues one short-lived,
revision- and element-access-bound shared result handle; Day→Battle reuses it without
rerunning, and missing/unavailable state fails closed to paused. Run the remaining
route/payload budgets from representative deployed regions, separate edge/origin/
provider clocks and retain the local benchmark as the control.

### Repair the website-editor route contract
**Id:** repair-website-editor-route-contract · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/[...rest]/page.tsx, src/built-ins/modules/website-editor/src/pages/EditorPage.tsx, src/built-ins/modules/website-editor/src/pages/SitesPage.tsx, src/built-ins/modules/website-editor/src/lib/funnels.ts, src/built-ins/modules/website-editor/src/lib/splitTests.ts, src/built-ins/modules/website-editor/src/lib/promote.ts, src/built-ins/modules/website-editor/src/api/handlers/promote.ts, src/built-ins/modules/website-editor/src/api/routes.ts
**Why:** The Server-to-Client boundary is repaired and all 11 management pages now browser-render (#153 closed). Controls still call missing or legacy APIs; promote is a pending stub; and image variation/inpaint routes are absent. Management rendering is restored, but create, split-test, publish/promote and image AI still need real operational contracts.

The serializable client-page boundary and complete manifest browser render are done. Next inventory every editor request against both route tables, repoint implemented operations to canonical module paths, implement or remove unfinished families, require durable outcomes (including a real branch/commit/PR for promote), add one resolver-backed regression over every literal request, and browser-walk funnel creation, split assignment, content save/publish/promote and reload.

### Make published functional blocks operational
**Id:** make-published-functional-blocks-operational · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/blockRegistry.ts, src/built-ins/modules/website-editor/src/components/pageTemplates.ts, src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/FormEmbedBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/FormRenderBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/BookingWidgetBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/NewsletterSignupBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/AffiliateSignupBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/AffiliateLeaderboardBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/DonationButtonBlock.tsx, src/app/api/public/contact/route.ts
**Why:** A publishable block is a promise to the visitor. Several use absent or role-gated APIs; Affiliate enrolment promises an email it never sends, its leaderboard hides a missing route as empty data, and Donation labels a one-off checkout as monthly.

Choose the public tenant-routing contract for each block, reuse `/api/public/contact` where its founder-agency semantics are actually intended, implement the missing domain services or hide them from publishable palettes, and accept only browser interactions that return the expected content or create the expected durable record. Include signed-in customer cases plus referral-code/email generation and a genuine recurring-payment assertion.

### Make website export reachable and faithful
**Id:** make-website-export-reachable-and-faithful · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx, src/built-ins/modules/website-editor/src/api/routes.ts, src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts, src/built-ins/modules/website-editor/src/server/staticExport.ts, src/built-ins/modules/website-editor/src/components/pageTemplates.ts, src/built-ins/modules/website-editor/src/__smoke__/r033-static-export.test.ts
**Why:** The visible export button calls a missing route, the separate handler is not registered, and its renderer silently empties most blocks in the first-party Homepage template.

Choose whether this product exports deployable source or a static snapshot, expose exactly one working route with honest UI copy, render every supported publishable block faithfully or fail with an explicit unsupported-block report, and regression-compare representative live pages/templates with their exported HTML and browser render.

### Unify or retire the browser-local editor admin stations
**Id:** unify-or-retire-browser-local-editor-admin · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/pages/SitesPage.tsx, src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx, src/built-ins/modules/website-editor/src/pages/SectionsPage.tsx, src/built-ins/modules/website-editor/src/pages/PopupsPage.tsx, src/built-ins/modules/website-editor/src/pages/PageDetailPage.tsx, src/built-ins/modules/website-editor/src/lib/sitesAdmin.ts, src/built-ins/modules/website-editor/src/server/sites.ts, src/built-ins/modules/website-editor/src/lib/customise.ts, src/built-ins/modules/website-editor/src/lib/loginCustomisation.ts, src/built-ins/modules/website-editor/src/lib/sidebarLayout.ts, src/built-ins/modules/website-editor/src/lib/sections.ts, src/built-ins/modules/website-editor/src/lib/popup.ts, src/built-ins/modules/website-editor/src/lib/customPages.ts
**Why:** These screens present shared site/domain/panel/storefront/page controls, but currently save into disconnected localStorage stores with no live consumer. Even the main Sites registry and live/domain state are separate from the server host-routing store; Page Detail additionally reads the wrong route parameter and has no public renderer.

Decide which capabilities belong in the canonical Website Editor, portal designer or company settings. Persist the kept settings under one real tenant/site/page scope, remove the parallel site/page models and stale `/admin`/`/account` assumptions, then browser-prove creation, live/draft, domain routing and the visible effect after reload and from a second session. Delete controls that remain intentionally local-only or label true per-browser preferences explicitly.

### Make campaign email delivery truthful
**Id:** make-campaign-email-delivery-truthful · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/server/campaigns.ts, src/lib/server/leadsPipelinePorts.ts, src/built-ins/modules/email-sender/src/server/delivery.ts, src/built-ins/modules/leads-pipeline/src/pages/CampaignsPage.tsx, src/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace.tsx
**Why:** Campaigns currently enqueue mail, mark it sent and stamp leads contacted without a provider attempt, while readiness only means the email plugin was automatically enabled.

Choose synchronous provider delivery or a durable queue dispatcher with leases/retries. Model queued, attempted, sent and failed separately; derive readiness from real provider/identity state; make UI copy and contact stamps match that state; then run the real leads-pipeline + email-sender containers through success, unconfigured provider, transient failure and retry.

### Wire paid Memberships to the real Stripe adapter
**Id:** wire-paid-memberships-to-real-stripe · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/runtime/foundation-adapters/membershipsFoundation.ts, src/built-ins/modules/memberships/src/server/foundationAdapter.ts, src/built-ins/modules/memberships/src/server/plans.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/index.ts
**Why:** Production always supplies a throwing Stripe stub but reports it available and healthy, so only free membership works while paid plan/checkout/webhook/self-service flows are unreachable.

Resolve the enabled client-scoped ecommerce Stripe configuration into a real Memberships `StripePort`; return null when it is genuinely absent; make health and installation expose paid capability/partial seed failure; then drive Stripe test mode through paid plan creation, Checkout, signed subscription/invoice webhooks, customer portal, change, pause/resume and cancel.

### Wire Affiliate Stripe Connect into the live product
**Id:** wire-affiliate-stripe-connect · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/runtime/foundation-adapters/affiliatesFoundation.ts, src/built-ins/modules/affiliates/src/server/foundationAdapter.ts, src/built-ins/modules/affiliates/src/server/onboarding.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx
**Why:** The service layer and fake-port tests cover connected-account onboarding and transfers, but production never supplies the optional Connect port, so every visible automated-payout path is unreachable while manual mark-paid is the only working mode.

Resolve one client-scoped Stripe/Connect configuration into a production `StripeConnectPort`, expose capability before showing onboarding or transfer controls, keep manual payout explicitly separate, and exercise Stripe test mode through account creation, hosted onboarding, status/webhook reconciliation, idempotent transfer and completion.

### Make Membership and Affiliate retirement dependency-safe
**Id:** dependency-safe-membership-affiliate-retirement · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/memberships/src/server/plans.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/server/benefits.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/codes.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts
**Why:** Plan DELETE leaves a subscriber row but hides it from admin lists and removes benefits without reconciling billing; Affiliate DELETE leaves active codes, attributions and payouts tied to a missing parent.

Use the existing plan archive and Affiliate removed states for ordinary retirement. Define an explicit exceptional purge/retention transaction, preserve subscriber access and historical financial records, reconcile external billing/payout state, and add active-dependant, reload and failure/retry coverage before exposing destructive deletion.

### Make SOP retirement dependency-safe
**Id:** dependency-safe-sop-retirement · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/sop-library/_SopLibrary.tsx, src/app/api/portal/sops/route.ts, src/engines/sop/server/sops.ts, src/engines/sop/server/sopGuides.ts, src/server/tasks.ts, src/server/agencyProducts.ts, src/server/developmentToolkit.ts, src/server/taskTemplates.ts, src/server/people.ts
**Why:** Permanent SOP deletion removes only the source row. Guides, tasks, products and other operational records retain the id, while several mounted surfaces silently filter the missing procedure and stop presenting required work.

Build a dependency inventory used by both confirmation UI and the server command. Prefer archive/tombstone for historical procedures; otherwise require explicit reassignment or one transactional detach policy with an audit. Prove guide, task, product/process, client-delivery, Development, template and training behavior across reload and every failure boundary.

### Enforce Company capital and governance integrity
**Id:** enforce-company-capital-governance-integrity · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/server/company.ts, src/server/types.ts, src/app/api/portal/company/route.ts, src/app/portal/agency/_CapitalOwnershipWorkspace.tsx
**Why:** The UI calls this the authoritative cap table, but the server retains duplicate ids, dangling class/owner/approval links, impossible dividend totals and combined votes above 100%. Mounted owner and decision deletion can strand financial-history links.

Validate the complete nested plan atomically with server-owned unique ids, resolved internal references, dividend/payment/allocation and vote invariants, plus an explicit linked-record retirement policy. Return field-level conflicts instead of silently retaining contradictions, and browser-prove create, edit, delete, summaries and reload.

### Version Battle Table writes and immutable quarterly reviews
**Id:** version-battle-table-and-retain-review-history · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/_BattleTableWorkspace.tsx, src/app/portal/agency/_QuarterlyStrategyReview.tsx, src/app/api/portal/company/route.ts, src/server/company.ts, src/server/types.ts
**Why:** Every planning station replaces the complete profile without comparing updatedAt, so a stale successful save can erase another station's newer work. “Lock review” also reopens and overwrites the completed decision/evidence snapshot instead of retaining history.

Use station-scoped mutations or a required compare-and-swap version with visible conflict/merge and retry. Make completed reviews immutable, create explicit amendments/superseding versions, and retain who/when/evidence provenance. Browser-prove two-tab and out-of-order writes plus complete, attempted edit, amendment, history and reload.

### Make legal-document retirement dependency-safe
**Id:** dependency-safe-legal-document-retirement · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/company/_LegalCompliancePanel.tsx, src/app/api/portal/company/legal/route.ts, src/server/legalDocuments.ts, src/built-ins/modules/agency-finance/src/server/operations.ts, src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx, src/server/company.ts, src/app/portal/agency/_CapitalOwnershipWorkspace.tsx
**Why:** Permanent Delete removes only the legal-register row even though archive exists. Finance obligations and Company governance decisions retain the missing id; one UI silently loses its evidence action while the other still presents the id as linked.

Make archive/tombstone the ordinary legal lifecycle and inventory every dependant before exceptional purge. Require reassignment or one explicit auditable detach/retention transaction, coordinate register and binary outcomes, and browser-prove Finance, governance, search/posture/alerts, reload and each record/provider failure boundary.

### Make Governance company scope truthful
**Id:** truthful-governance-company-scope · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/governance/_governanceData.ts, src/app/portal/agency/governance/_GovernanceWorkspace.tsx, src/app/api/portal/governance/route.ts, src/server/legalDocuments.ts, src/server/tradingCompanies.ts, src/server/tenants.ts
**Why:** The page-level company selector scopes posture and HIPAA only. Legal rows, declarations, sub-processor agreement matching and erasure clients remain agency-wide, so one brand can appear documented by another brand's paperwork and show its clients as destructive targets.

Define each Governance view as explicitly holding-group-wide or company-scoped. For scoped views, include that company plus deliberate shared records, derive vendor flags and declarations from the same set, and restrict erasure candidates. Browser-prove agency and every brand, shared records, create/reload, failed reload and no cross-brand destructive target.

### Make Ecommerce Checkout server-authoritative end to end
**Id:** server-authoritative-ecommerce-checkout · **Status:** building · **Size:** L · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/ecommerceBridge.tsx, src/built-ins/modules/website-editor/src/components/blocks/PaymentButtonBlock.tsx, src/built-ins/modules/ecommerce/src/components/CartDrawer.tsx, src/built-ins/modules/ecommerce/src/api/routes.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/stripe/server.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/server/orders.ts, src/built-ins/runtime/_pageScope.ts
**Why:** The non-security core shipped on 2026-08-26. One strict ids/quantity request rejects browser money; current catalogue, variant, price, currency, stock, discount, shipping and tax become an immutable durable operation; provider creation and paid settlement replay against that stored snapshot. Focused Ecommerce/package proof passes 39/39.

Finish the deliberately deferred guest/end-customer route authorization, then browser/live-Stripe prove success/cancel URLs, stale tabs, reload and duplicate/out-of-order delivery. Do not mark shipped from source tests alone.

### Unify the Ecommerce storefront bridge
**Id:** unify-ecommerce-storefront-bridge · **Status:** building · **Size:** L · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/useProducts.ts, src/built-ins/modules/website-editor/src/components/ecommerceBridge.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductCardBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductGridBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/VariantPickerBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/CartSummaryBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/OrderSuccessBlock.tsx, src/built-ins/modules/ecommerce/src/api/routes.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/products.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** The non-security contract core shipped on 2026-08-26. Catalogue, search, actual cart actions, variants, quote and pending/ready order confirmation now share Ecommerce DTOs/minor units, and catalogue caching is keyed by tenant/store/version.

Finish #29/#69 public-route authorization, then browser-prove two stores through browse, search, rich variant, cart, authoritative quote, real Checkout and confirmed order without cache carry-over.

### Make Public Funnel capture transactional and retry-safe
**Id:** transactional-public-funnel-capture · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/public-funnel/src/server/services.ts, src/built-ins/modules/public-funnel/src/api/handlers.ts, src/built-ins/modules/public-funnel/src/server/ports.ts, src/lib/server/pluginStorage.ts, src/built-ins/modules/public-funnel/src/__smoke__/funnel.test.ts
**Why:** Authoritative by-id reads, stable completion ids and a global process transaction now collapse same-process replay and canonical-email races across configured installations. Anonymous completion is pending-only: it creates no User, session or CRM identity and emits only non-PII pending summaries. A server-only promotion command requires exact mailbox proof or an authenticated actor and records exact capture-to-CRM lineage; no public proof endpoint invokes it yet.

Add database-native cross-process canonical uniqueness, durable address/installation/IP budgets and a durable outbox/idempotent consumer boundary. Build and verify the mailbox-proof promotion endpoint before exposing conversion, then fault every capture/erasure/promotion effect and race separate processes before marking the funnel fully reliable.

### Make Leads Pipeline identity changes conflict-safe
**Id:** conflict-safe-lead-identity · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx, src/built-ins/modules/leads-pipeline/src/server/leads.ts, src/built-ins/modules/leads-pipeline/src/server/contacts.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/server/pipelines.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** Same-process identity ownership is now explicit: email/phone conflicts return 409, concurrent mutations serialise, pointer cleanup is owner-safe, ambiguous legacy card matching is refused and a failed sales-record save retains its draft. The service/boundary gate passes 46/46. Cross-process storage writers can still race.

Finish with a database/storage-native conditional identity claim. Race separate processes through edits, imports and qualification, retry every boundary and prove one unambiguous identity after reload.

### Make opportunity invoicing and payments transactional
**Id:** transactional-opportunity-ledger · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** Same-process races are repaired: invoice numbers reserve unique slots, payments use independent ledger rows, canonical required references make retries idempotent, conflicts return 409 and every commercial mutation serialises. The focused commercial/boundary gate passes 8/8. Cross-process provider delivery is not yet transactional.

Finish with database-native uniqueness and a durable outbox/idempotent consumers for Finance, Stripe, receipts, activity and events. Fault every before/after boundary and race separate instances through retry and reload.

### Make mounted Marketing records concurrency-safe
**Id:** transactional-marketing-record-storage · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-marketing/src/api/handlers.ts, src/built-ins/modules/agency-marketing/src/api/handlers-customer-profiles.ts, src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx, src/app/portal/agency/marketing/_FunnelsWorkspace.tsx, src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx, scripts/smoke-marketing-customer-profiles.test.ts
**Why:** Per-id rows, legacy tombstones, an in-process mutation queue and mounted updatedAt checks now preserve acknowledged creates and return 409 for stale edit/status/delete. The focused package/handler/UI gate passes 25/25. Cross-process CAS is not yet native.

Finish with a database-native version/compare-and-set constraint. Race two processes through create/edit/status/delete and verify Channels, Funnels and Customer profiles after reload.

### Make Agency Marketing lead identity canonical
**Id:** canonical-agency-marketing-lead-email · **Status:** building · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-marketing/src/server/leads.ts, src/built-ins/modules/agency-marketing/src/api/handlers.ts, src/built-ins/modules/agency-marketing/src/__smoke__/marketing.test.ts, scripts/smoke-agency-marketing-lead-identity.test.ts
**Why:** Canonical compare/lookup/re-key/store, an agency process lock and ownership-safe pointer cleanup now prevent the demonstrated whitespace split and same-process duplicate races. The API returns 409 and the package/handler gates pass 24/24 plus 2/2. Cross-process identity ownership is not yet atomic.

Finish with database-native conditional pointer ownership. Prove separate-process create/edit/import/contact races, retry and reload while retaining one canonical owner.

### Make Agency Marketing campaign records and reports truthful
**Id:** truthful-agency-marketing-campaign-ledger · **Status:** building · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-marketing/src/server/campaigns.ts, src/built-ins/modules/agency-marketing/src/server/reports.ts, src/built-ins/modules/agency-marketing/src/api/handlers.ts, src/built-ins/modules/agency-marketing/src/pages/ReportsPage.tsx, src/built-ins/modules/agency-marketing/src/__smoke__/marketing.test.ts, scripts/smoke-agency-marketing-campaign-truth.test.ts
**Why:** Complete-row/runtime validation, valid report windows, same-process mutation coordination and currency/KPI-separated createdAt reporting now replace the impossible edits and mixed-unit totals. Package 24/24, handler/UI 3/3 and the live 3032 report labels pass. Cross-process campaign index mutation is not atomic.

Finish with database-native campaign index coordination and separate-process create/update/delete plus reload proof.

### Separate Aqua Tag rerouting from site deletion
**Id:** safe-aqua-tag-site-rerouting · **Status:** building · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx, src/app/api/portal/website-sources/route.ts, src/server/websiteSources.ts, src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx, scripts/smoke-website-sources.test.ts, scripts/smoke-aqua-tag-injections.test.ts, scripts/smoke-import-forms.test.ts, scripts/smoke-aqua-tag-stop-routing.test.ts
**Why:** Both mounted stop controls now use a dedicated route-to-inbox action that preserves the registration/config; permanent deletion separately names every dependency and supports cancel. The focused gate passes 68/68 and live Tags renders. An isolated mounted click/reload walk remains.

Finish an isolated mounted reroute/reload plus delete-cancel/delete-confirm browser walk with configured tools and imported forms.

### Make Aqua Tag form ingestion durable and order-independent
**Id:** durable-aqua-tag-form-ingestion · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/integrations/aquaTagSource.ts, src/app/(website)/LaunchGateForm.tsx, src/app/api/public/form-capture/route.ts, src/app/api/public/brand-enquiry/route.ts, src/lib/enquiries/submissionIdentity.ts, src/lib/server/enquirySubmissionOperation.ts, src/server/activity.ts, src/server/automations.ts, scripts/smoke-aqua-tag-ingestion-order.test.ts, scripts/smoke-form-capture.test.ts, scripts/smoke-enquiry-dedupe.test.ts, scripts/smoke-tag-form-capture.test.ts
**Why:** Stable browser submission ids now join both public paths; same-process delivery is serialised, thin rows are promoted, reverse-order capture is retained, failed persistence is a retryable 503 and tag retry reuses the id. The real-handler gate passes 5/5 and the wider focused gate 120/120. Database uniqueness and a durable side-effect outbox remain.

Finish with a database-native unique submission claim and crash-safe outbox/idempotent consumers for lead, notification, automation, activity and ledger work. Race separate instances and fault every before/after boundary.

### Make Dev Team source-of-truth writes cross-process safe
**Id:** transactional-dev-team-truth-writers · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/dev/devFileTransaction.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devDocEdits.ts, src/app/portal/dev-team/docs/_DocEditor.tsx, src/app/api/portal/dev-team/docs/route.ts, scripts/worker-thoughts.mjs, scripts/smoke-dev-cross-process-writes.test.ts
**Why:** Filesystem-visible locking, atomic replacement, exclusive finding create and exact SHA-versioned document saves now preserve separate-process accepted work and bind attribution to the winning bytes. Real child processes plus direct-writer CAS pass in the focused 104/104 gate. Document and ledger commits are still two renames and therefore not crash-atomic.

Lock release and stale reaping now atomically rename the canonical directory to a unique tombstone before removal, closing the demonstrated successor-lock ABA race; repeated Inbox concurrency and Dev cross-process 7/7 pass. Finish with a recoverable document+ledger intent journal or one transactional source and crash/reload proof. Close or constrain the final compare/rename interval for non-cooperating direct writers; keep plan creation's existing exclusive `wx` path.

### Make Membership plan changes one provider-backed lifecycle
**Id:** durable-membership-subscription-lifecycle · **Status:** building · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/server/ports.ts, src/built-ins/modules/memberships/src/lib/domain.ts, src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts, src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx, src/built-ins/modules/memberships/src/components/SubscribersList.tsx, src/built-ins/modules/memberships/src/pages/MyMembershipPage.tsx, scripts/smoke-membership-subscription-lifecycle.test.ts
**Why:** One per-user durable command now coordinates provider and local state for paid→paid, paid→free, free→paid and cancellation, including accepted-provider recovery after a local write failure. Free cancellation has an immediate terminal boundary.

Focused failure/retry/reload/concurrency plus mounted-source proof passes 2/2; the widened Membership/customer/discount chain passes 49/49 and TypeScript/diff pass. Finish by wiring the separately tracked production Stripe foundation (#33), then browser- and live-provider-prove the full lifecycle before moving this item to Shipped.

### Make Membership webhooks durable, retryable and scoped
**Id:** durable-membership-webhook-inbox · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/server/webhook.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/server/index.ts, src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/memberships/src/server/ports.ts, src/built-ins/modules/memberships/src/lib/domain.ts, scripts/smoke-membership-webhook-inbox.test.ts
**Why:** A scoped per-event inbox now retries failed/interrupted/legacy work, completes only after state and synchronous effects, persists payment truth, validates install metadata and returns 503 for processing failure.

Faulted subscriber/payment side effects, fresh-container retry, concurrency, legacy pre-seen recovery and missing/cross-scope refusal pass 4/4; combined Membership dedicated 6/6 and widened 53/53. Finish by wiring #33 and proving signed live-provider delivery before moving this item to Shipped.

### Claim Affiliate commissions into one payout
**Id:** exclusive-affiliate-payout-claims · **Status:** building · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/ports.ts, src/built-ins/modules/affiliates/src/lib/domain.ts, src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx, scripts/smoke-affiliate-payout-ownership.test.ts
**Why:** Affiliate-scoped scheduling now claims each approved attribution into one recoverable payout; manual/Stripe completion stages owned rows and derives earnings from canonical paid attributions. The mounted admin can schedule its first payout.

Scheduling/completion faults, reload, concurrency, legacy duplicate refusal and mounted source pass 3/3; package+focused 17/17 and combined Membership/Affiliate 70/70. Finish production Connect #45 plus mounted/live-transfer acceptance before moving this item to Shipped.

### Preserve currency and refund truth in Affiliate accounting
**Id:** currency-aware-affiliate-accounting · **Status:** building · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/affiliates/src/lib/domain.ts, src/built-ins/modules/affiliates/src/server/ports.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx, src/built-ins/modules/affiliates/src/components/AttributionsList.tsx, src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx, src/built-ins/modules/ecommerce/src/server/orders.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/runtime/foundation-adapters/_crossPluginPorts.ts, src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts, scripts/smoke-affiliate-currency-refund.test.ts
**Why:** Currency/settlement snapshots, eligible-order admission, currency-bound payout composition and replay-safe pre/post-transfer refund offsets are now implemented and visible on both mounted Affiliate views.

Mixed GBP/USD, pending-order exclusion, pre-payout cancellation, post-payout partial/full cumulative refund, event replay, locked Stripe currency and admin/affiliate source proof pass 3/3; package+focused passes 20/20 and widened Membership/Affiliate/Ecommerce passes 79/79. Finish production Connect #45 plus literal mounted/live-provider acceptance before moving this item to Shipped.

### Validate Membership and Affiliate commercial state at runtime
**Id:** validate-membership-affiliate-domain · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/memberships/src/lib/runtimeValidation.ts, src/built-ins/modules/memberships/src/server/plans.ts, src/built-ins/modules/memberships/src/server/benefits.ts, src/built-ins/modules/memberships/src/server/subscriptions.ts, src/built-ins/modules/memberships/src/api/handlers.ts, src/built-ins/modules/affiliates/src/lib/runtimeValidation.ts, src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/codes.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/api/handlers.ts, scripts/smoke-membership-affiliate-runtime-validation.test.ts
**Why:** Complete service candidates now validate allowlisted fields, identity, enum/currency, bounded money/rates/dates, references, category/provider relationships and payout composition before mutation.

Blank/unknown/NaN/negative/out-of-range plan, benefit, subscription, affiliate, code, order and payout inputs return field errors while the complete plugin store remains byte-identical. Focused proof passes 3/3 and widened Membership/Affiliate/Ecommerce passes 82/82. Finish literal mounted invalid-submit/error/reload acceptance before moving this item to Shipped.

### Make Aqua Advisor turns durable and retry-idempotent
**Id:** durable-advisor-turn-operations · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/assistant/route.ts, src/app/portal/agency/assistant/AssistantWorkspace.tsx, src/lib/server/assistants/assistantStore.ts, src/server/productWorkspaceCoordinator.ts, src/server/types.ts, scripts/smoke-assistant.test.ts, scripts/smoke-assistant-turn-operations.test.ts
**Why:** The premature visible-write defect is repaired. A client operation id survives failure/reload; a durable lease owns generation; provider output is persisted before one atomic user/assistant/memory commit; stable ids plus idempotent activity make retry/replay converge. Stale attempts are ignored and thread deletion cancels pending work. Dedicated proof passes 7/7, widened Advisor/health 15/15.

Before Shipped, force every provider/parse/provider-result/completion/activity/persistence and response-loss boundary through the literal route and mounted composer for first and existing threads, including reload. Record provider unknown-outcome retry/cost separately from the already-convergent visible history.

### Enforce Radar sweep cadence, scope and failure isolation
**Id:** enforce-radar-sweep-schedule · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/engines/data/server/radar/radarSweeps.ts, src/app/api/cron/inbox/route.ts, src/app/api/cron/radar-probes/route.ts, vercel.json, scripts/smoke-radar-sweeps.test.ts, scripts/smoke-radar-sweep-isolation.test.ts
**Why:** Evidence is declared hourly but only runs manual/daily; the daily tenant loop repeats app-wide Infra per agency and an Infra failure prevents that tenant's evidence rollup until the next day.

Separate app-wide Infra from per-tenant Deep/Pulse/Evidence work, schedule Evidence at its real declared cadence or relabel it honestly, and isolate failure domains. Add fake-clock/call-count tests for zero/one/many agencies, overlap, Infra failure, tenant failure and retry; require at most one Infra probe per tick and one intended evidence sample per healthy tenant.

### Mount and prove application observability
**Id:** mount-application-observability · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** package.json, src/lib/server/observability.ts, src/lib/server/requestLog.ts, src/lib/server/productionReadiness.ts, src/app/error.tsx, src/components/ui/ErrorBoundary.tsx, scripts/smoke-observability.test.ts
**Why:** Error and request monitoring is described as active and readiness can call it ready, but no production entry point invokes either wrapper, the capture dependency is absent and the visible fallback promises an event was logged without a sink.

Install and configure one real client/server monitoring integration, instrument browser, server and API boundaries with appropriate route/tenant context, adopt the request logger or remove its active claim, and make readiness verify capability. Prove synthetic browser and API failures reach a fake/real test transport and flush before completion.

### Keep shared account navigation inside the current role shell
**Id:** role-aware-account-navigation · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/account/page.tsx, src/app/portal/account/permissions/page.tsx, src/app/portal/not-found.tsx, src/components/chrome/ProfileMenu.tsx, src/lib/server/auth/postLoginRedirect.ts, scripts/smoke-nav-audit.test.ts
**Why:** Agency-staff Account/Permissions exits are repaired and browser-proven. Client/freelancer destinations and the portal 404 still assume the agency shell, so shared recovery is not role-complete.

Define one role/client-aware home and settings resolver for the remaining shared account/recovery surfaces. Preserve the proven staff behavior and browser-prove profile, permissions and bad-deep-link exits for every role without redirect bounce.

### Make customer install onboarding revisitable
**Id:** revisitable-customer-install-onboarding · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/setup/_CustomerSetup.tsx, src/app/setup/page.tsx, src/app/api/portal/customer/setup/route.ts, src/app/portal/customer/_CustomerPortalViews.tsx, src/server/users.ts, scripts/smoke-customer-setup.test.ts
**Why:** Password completion closes the only install-help route, while the setup screen tells customers they can find that missing help later under Support.

Persist welcome/password/install progress independently or mount the install prompt/manual instructions under Support/account until explicitly completed or dismissed. Await prompt choice and browser-prove iOS guidance, Android/desktop accept/decline, close/reopen and later revisit.

### Standardise modal keyboard and focus behavior
**Id:** accessible-modal-focus-contract · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/a11y/useFocusTrap.ts, src/components/ui/ConfirmDialog.tsx, src/components/attention/TaskTemplates.tsx, src/app/portal/agency/actions/_ActionsWorkspace.tsx, src/app/portal/agency/_NewClientButton.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/modules/agency-hr/src/components/NewStaffModal.tsx
**Why:** Sixty-four true modal declarations span 50 TSX files, but only three of those files use the existing focus containment/restoration hook. Forty-seven modal files remain untrapped and only four of those handle Escape.

Prefer one shared accessible Dialog primitive; otherwise enforce the same hook, name/description, deliberate initial focus, background inoperability, safe Escape semantics and opener restoration everywhere. Add an inventory regression and component/browser keyboard walks covering ordinary forms, destructive actions and nested dialogs.

### Expose the Command Centre loading status to assistive technology
**Id:** accessible-command-centre-loading · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/agency/loading.tsx
**Why:** The route skeleton places aria-hidden on its root and then nests the only role="status" aria-live="polite" message inside that hidden subtree, so screen readers receive no progress update.

Keep skeleton geometry hidden separately, expose one concise live status and remove it when the real route resolves. Component/browser-prove one announcement, no duplicate chatter and stable focus across navigation, completion and retry.

### Replace labelled HTTP widths with exhaustive real responsive acceptance
**Id:** real-responsive-accessibility-gate · **Status:** planned · **Size:** L · **Added:** 2026-08-25 · **Source:** ultra-review, ed
**Plans:** runtime-verification
**Files:** scripts/smoke-ux.mjs, package.json, docs/development/plans/runtime-verification.md, src/app/portal/agency/people/, src/app/portal/team/, src/app/portal/agency/fulfilment/, src/app/portal/clients/, src/app/portal/customer/, src/app/portal/freelancer/, src/app/portal/dev-team/, src/engines/editor/
**Why:** The UX smoke loops 375/768/1280 but puts the value only in a User-Agent string and checks

server HTML substrings. A manual 2026-08-25 continuation supplies representative visual/overflow/
console evidence, but it is not repeatable and did not exercise the new access states, orientations,
real mutations, keyboard/screen-reader behaviour or forced failures.

Run this as the final gate after configurable access/workspace parity lands. The shell/access layer
must pass at 375x812 mobile portrait, 812x375 mobile landscape, 768x1024 tablet portrait,
1024x768 tablet landscape, 1280x800 desktop and 1920x1080 wide, plus a 320x568 minimum-width smoke,
200% zoom and breakpoint-boundary probes. Then run the mutation-heavy Staff, Fulfilment, project,
portal and Dev Editor journeys at mobile portrait, tablet landscape and desktop. Cover owner,
manager, differently granted staff, client owner/staff, end customer, freelancer, Project-A-only
developer and read-only Sandbox/share/Showcase personas; granted, denied, request-pending, narrowed,
approved, expired, revoked and provider-failure states; nav, direct URLs and APIs; orientation/resize,
reload and unsaved work; overflow, touch targets, keyboard/focus, accessibility tree/axe, console and
network output. Preserve screenshots, traces/videos and negative Project A/Project B evidence, and
fail the release gate for lost state, sensitive-content flash, unexpected errors, inaccessible primary
actions or any mismatch between visible navigation and server authority.

### Make tabs, menus and listboxes keyboard-truthful
**Id:** accessible-composite-widget-contracts · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/a11y/useArrowNav.ts, src/app/portal/agency/settings/SettingsTabs.tsx, src/app/portal/clients/_PeopleHub.tsx, src/components/editing/EditorCodeCanvas.tsx, src/components/chrome/ProfileMenu.tsx, src/components/chrome/CompanySwitcher.tsx, src/built-ins/modules/website-editor/src/components/editor/PagePickerToolbar.tsx
**Why:** All 12 declared tablist components and nine production menus omit their role-specific roving and arrow-key behavior; Settings references panel ids that are never rendered, one editor listbox has no item-navigation model and the existing arrow-navigation hook has no production caller.

Create or adopt shared Tabs, Menu and Listbox primitives with honest roles, selected/current focus, arrow/Home/End, activation, Escape/opener restoration and real controlled-panel relationships. Add inventory and component keyboard regressions, then browser-walk Settings, People, editor files, Profile/Company menus and page picker.

### Give every important control a stable accessible name
**Id:** accessible-control-name-contract · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/team/_TeamWorkspace.tsx, src/app/portal/agency/people/_PeopleCommand.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/agency/automations/_AutomationsWorkspace.tsx, src/app/portal/agency/company/_CompanyWorkspace.tsx, src/app/portal/agency/company/_LegalCompliancePanel.tsx, src/app/portal/agency/actions/_ActionsWorkspace.tsx, src/app/portal/agency/sop-library/_SopLibrary.tsx, src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/BookingWidgetBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/NewsletterSignupBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/DonationButtonBlock.tsx
**Why:** At least 13 manually confirmed internal icon-only actions have no programmatic name, while central published visitor fields rely on placeholder text as their only prompt and become anonymous once typing begins.

Add visible labels or stable aria naming to every control, include row and state in repeated action names, hide decorative icons and announce validation/status changes. Build an AST/component guard that distinguishes intentionally hidden controls, then browser-inspect Team, Development, modal and representative published-form accessibility trees.

### Make business calendar dates timezone-safe
**Id:** timezone-safe-business-dates · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/shared/formatDateTime.ts, src/app/portal/agency/_NewClientButton.tsx, src/app/portal/agency/people/_PeopleCommand.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/modules/agency-finance/src/components/CommercialPlansManager.tsx, src/built-ins/modules/agency-hr/src/components/NewStaffModal.tsx, src/built-ins/modules/agency-hr/src/components/EmployeeListClient.tsx, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, scripts/smoke-business-calendar-date.test.ts
**Why:** The source/domain defect is repaired. One explicit Europe/London calendar contract owns the affected record defaults, preserves date-only strings, rejects impossible dates and adds calendar days safely across DST; UTC provider/export stamps remain explicit. Focused 5/5, affected People/Finance/HR 56/56, adjacent client-plan/Leads 61/61 and TypeScript pass.

Before Shipped, browser-save/reload/export representative onboarding, expense, income, invoice/payment-plan and staff records at a controlled midnight/DST boundary.

### Cover root failures with the real global error boundary
**Id:** global-root-error-recovery · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/error.tsx, src/app/global-error.tsx, src/app/layout.tsx, src/lib/server/observability.ts, scripts/smoke-observability.test.ts
**Why:** The custom segment error file is described as top-level, but no project global-error file exists, so Next 16 uses its built-in fallback for root-layout and App Router failures instead of Aqua's recovery and future capture path.

Add the required global client boundary with its own html and body, use the same proven monitoring transport and preserve scoped segment recovery. In a production browser build, fault root and child segments separately and prove the correct fallback, single capture and successful reset, reload or back recovery.

### Make customer portal installation genuinely eligible
**Id:** chromium-customer-pwa-installability · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** public/manifest.webmanifest, src/app/setup/_CustomerSetup.tsx, public/favicon-default-192.png, public/favicon-default-512.png, scripts/smoke-customer-setup.test.ts
**Why:** Customer setup depends on beforeinstallprompt to reveal its install button, but the served manifest and public assets have no 512px icon, so they do not meet Chromium's current 192px-plus-512px install-promotion criteria.

Create and safe-zone-check a genuine 512 icon, retain the 192 fallback, validate the served manifest and await and clear the one-use prompt result. Browser-prove engagement eligibility, accept, dismiss, repeat interaction, appinstalled, already-installed and ineligible fallback states while keeping later help revisitable.

### Make current-page website blocks hydration-stable
**Id:** hydration-safe-current-page-blocks · **Status:** planned · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/website-editor/src/components/blocks/ShareButtonsBlock.tsx, src/built-ins/modules/website-editor/src/components/blocks/BreadcrumbBlock.tsx, src/built-ins/modules/website-editor/src/components/blockRegistry.ts, src/built-ins/modules/website-editor/src/__smoke__/r017-block-library-polish.test.ts
**Why:** Blank Share Buttons and auto Breadcrumb derive URL state from window during the first render, so their server output has empty social targets or no markup while the first client tree differs and React 19 does not safely patch the mismatch.

Pass the request URL and path through published block context or defer derivation behind hydration-stable markup. Test server output through browser hydration for default and explicit props, client navigation, functional social and copy targets, current breadcrumb structure and zero recoverable hydration errors.

### Support byte-range playback for private media
**Id:** private-media-byte-range-delivery · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/portal/inbox/media/content/route.ts, src/lib/server/inbox/inboxMedia.ts, src/app/api/portal/website-enquiries/calls/recording/content/route.ts, src/app/api/portal/sops/content/route.ts, src/lib/server/privateUploadStorage.ts, scripts/smoke-unified-master-inbox.test.ts, scripts/smoke-master-inbox-communications.test.ts
**Why:** Mounted inbox and call-recording audio players use private content routes that ignore Range and always send full 200 responses; SOP training media shares that contract for objects accepted up to 250 MB, and several provider paths fully buffer the object before responding.

Create one provider-aware media delivery primitive that validates a single range, returns exact 206/Content-Range/Accept-Ranges/Content-Length headers, reports unsatisfiable requests as 416 and preserves safe full downloads. Avoid whole-object buffering where each provider can stream a slice. Test start/middle/end/suffix/open-ended/invalid ranges across local, Supabase and Vercel, then browser-prove metadata load, immediate play and seeking for voice notes, call recordings and large SOP media.

### Make inbox recording capability-aware and failure-safe
**Id:** resilient-cross-browser-media-recording · **Status:** planned · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/agency/inbox/_EnquiryCommunications.tsx, src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx, src/app/api/portal/website-enquiries/calls/route.ts, src/app/api/portal/website-enquiries/calls/recording/route.ts, src/app/api/portal/inbox/media/route.ts, scripts/smoke-unified-master-inbox.test.ts, scripts/smoke-master-inbox-communications.test.ts
**Why:** Every mounted recorder tests only Opus-in-WebM and otherwise still forces WebM. Unsupported construction is reported as permission denial; the call flow persists an active call before constructing/starting the recorder, so failure can strand that call, busy UI and a live microphone stream.

Create one capture helper that negotiates supported WebM/MP4 or browser-default output, derives MIME and extension from the recorder, reports permission/device/capability/runtime failures distinctly and owns deterministic stop/cleanup. Sequence or compensate call creation so no failure leaves invisible active state. Component-test constructor/start/API/upload/stop/navigation/unmount failure with WebM, MP4, default and unsupported fakes, then browser-prove website/social/client voice notes and recorded calls in current Safari and Chromium.

### Make relative published countdowns expire
**Id:** stable-relative-countdown-deadlines · **Status:** building · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/engines/editor/elements/countdownDeadline.ts, src/engines/editor/elements/blockTreeOps.ts, src/built-ins/modules/website-editor/src/components/blocks/CountdownTimerBlock.tsx, src/built-ins/modules/website-editor/src/server/pages.ts, src/built-ins/modules/website-editor/src/lib/draftPublished.ts, scripts/smoke-countdown-deadline.test.ts
**Why:** Relative units now resolve once into hidden source/deadline props at creation, save or publish; legacy page reads use stored timestamps, unchanged reload/edit retains the deadline, target changes reset once, and invalid targets expire. Server and first-client markup share an inert placeholder. Dedicated proof passes 5/5, draft/publish compatibility 25/25.

Before Shipped, mount the actual interval effect with a fake clock through rerender/remount and browser-prove a published relative timer reaches expiry with zero hydration warnings.

### Make chat and attention response ordering deterministic
**Id:** deterministic-chat-attention-response-order · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/components/people/TeamChat.tsx, src/components/chrome/NotificationAttentionProvider.tsx, src/components/chrome/NotificationCentreButton.tsx, src/app/portal/agency/inbox/_MasterInbox.tsx, src/lib/intelligence/notificationAttentionCoordination.ts, scripts/smoke-people-workspace.test.ts, scripts/smoke-notification-response-order.test.ts, scripts/smoke-operational-notifications.test.ts
**Why:** Chat now binds selection, loads, polling and Send to explicit request/channel generations. Notification refreshes are accepted only while current, and per-alert mutation queues rebase optimistic intent, merge only their target, preserve concurrent rows and isolate rollback. Deliberately reversed pure coordination passes 8/8, the full attention/People gate 80/80 and TypeScript is clean.

Before Shipped, mount both real providers with deliberately reversed deferred fetches, then browser-prove rapid channel switching and overlapping attention actions preserve the newest intent without changing the recipient or resurrecting resolved work.

### Bound storage and provider waits safely
**Id:** bounded-storage-provider-operations · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/remoteOperation.ts, src/server/storageSupabase.ts, src/lib/server/email/outboundCommunications.ts, src/lib/server/email/resendEmail.ts, src/lib/server/integrations/vercelDomain.impl.ts, src/lib/server/integrations/stripeHttp.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/shopify.ts, scripts/smoke-remote-operation-deadline.test.ts, scripts/smoke-provider-deadlines.test.ts, scripts/smoke-remote-storage-consistency.test.ts, scripts/smoke-vercel-domain.test.ts, scripts/smoke-transactional-email.test.ts
**Why:** The named remote paths now share typed read/write budgets and caller cancellation. Even an adapter that ignores abort settles locally; failures preserve safe, same-operation-key or reconcile-first recovery according to whether the remote outcome can be known. Resend/Stripe use durable keys, and Supabase full-state replay does not pretend to be idempotent.

Shared primitive proof passes 7/7; provider stall/abort/late-accept/key proof 7/7; focused provider foundation 37/37; the widened route/provider gate passes 169 with 1 live-Postgres skip; TypeScript is clean. Before Shipped, mount each real caller against stalled and late responses, browser-prove loading exits with the accurate recovery action, and complete live Supabase/provider reconciliation acceptance.

### Make customer Bookings capability-driven
**Id:** capability-driven-customer-bookings · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/portal/customerAccountActivity.ts, src/app/portal/customer/layout.tsx, src/app/portal/customer/_CustomerPortalChrome.tsx, src/app/portal/customer/_subroute.tsx, src/app/portal/customer/bookings/page.tsx, src/built-ins/runtime/_registry.ts, scripts/smoke-customer-booking-capability.test.ts, scripts/smoke-nav-audit.test.ts
**Why:** Account activity now derives from registered, exact-client enabled and explicitly operational capabilities. Ecommerce can expose Orders; Bookings stays hidden because its holding page is not a booking lifecycle. Even stale registered/enabled booking install data cannot advertise it.

Capability/stale-install proof passes 4/4, focused nav proof 2/2, surrounding customer/plugin-host checks 34/34 and TypeScript is clean. Before Shipped, browser-prove the no-capability, Orders-only and direct-Bookings states. Any future Bookings implementation must add create/reschedule/cancel, failure/retry, reload and cross-account acceptance before making the contract operational.

### Remove or implement Social Inbox More actions
**Id:** implement-social-inbox-more-actions · **Status:** building · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx, scripts/smoke-social-inbox-header-actions.test.ts, scripts/smoke-master-inbox-replies.test.ts, scripts/smoke-universal-search.test.ts
**Why:** No additional conversation operation existed behind the ellipsis, so the misleading enabled control is gone. Assign and Close/Reopen remain native buttons backed by the real conversation mutation path; the header advertises only operational outcomes.

Dedicated proof passes 2/2, the focused header/reply/search set 15/15, the wider Inbox/Search gate 53/53 and TypeScript is clean. Before Shipped, browser-confirm an active thread at desktop/mobile widths and stable focus order. A future overflow menu must add explicit outcomes, refusal/retry, Escape/focus return and pointer/keyboard acceptance.

### Make Dev Team live-file truth fast enough for ordinary navigation
**Id:** incremental-dev-team-live-index · **Status:** building · **Size:** M · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/dev/devTeamWorkers.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devMarkdownCache.ts, src/lib/server/dev/devDocEdits.ts, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/library/_Section.tsx, src/app/portal/agency/dev-docs/page.tsx, scripts/smoke-dev-team-perf.test.ts, scripts/smoke-dev-team-link-prefetch.test.ts, scripts/smoke-dev-doc-edits.test.ts
**Why:** The 2026-08-25 warm browser baseline was Dev Team 9.2 seconds wall/7.9 application, Logs 4.7 server-side and Dev Docs 6.4/5.1. The readers now share coalesced generation-safe refreshes, a 15-second bound, explicit fresh reads, immediate in-app-save invalidation and prefix-aware .next- worker-build exclusion. A later 120.006s zero-byte request was traced to filesystem exhaustion: generated Next out

The original cache/index gate passed 16/16 and the wider Dev Docs/edit/worker/performance gate 73/73. The incident repair removed 15 confirmed generated outputs (~18 GiB), added a non-destructive <2 GiB startup refusal, narrowed TypeScript expansion 6,869→1,796 files and passes the updated Dev performance gate 21/21 plus full TypeScript. Full-source isolated HTTP then measured Turbopack 6.875s/0.208s and Webpack 9.423s/0.200s cold/warm. A clean restarted mounted browser made mobile Home visible in 3.897s and warm 1280px navigation in 367ms, with no overflow or warnings/errors. Exact Editor/Findings links now disable prefetch while click navigation remains; a clean >9-second Home window issued no background request to either route and focused proof is 3/3. At that checkpoint, Library/Logs, Dev Docs, outside-edit freshness and the wider cold path remained; the completion paragraph below supersedes that acceptance list.

The 2026-08-27 completion pass removed Home's recursive roadmap/task/worker read, limited Library
to the 20 canonical documents and split/streamed Logs behind one compact, coalesced snapshot.
Library measured **4.428→3.290s cold / 146→142ms warm**; Logs measured **3.182→0.857s first**
and **2.702→0.868s post-TTL**, with an eager graph reduction from **47 modules / 469,232 bytes
to 3 / 15,433**. Canonical Library and Logs activity scans measured **67.6→1.0ms** and
**95.4→38.5ms**. The isolated production target returned Library **693.0/26.4ms** and Logs
**741.0/29.0ms** first/repeat-max, all 200 and within payload budgets. 1280px Library/Logs and
390px Logs settled without overflow. The local live-file navigation phase is complete; this queued
item remains Building only for the deployed latency follow-up, not unfinished indexing work.

The 2026-09-02 isolated rerun supersedes only those timing figures: Library measured
**803.6/30.4ms** and Logs **892.8/30.7ms** fresh-process first/repeat-max, both HTTP 200 with empty
failure lists. The broad responsive matrix and corrected exact-width probe are green, including
Library/Logs coverage and Studio at 390/1024/1440. Shared host caches and disabled real-provider
credentials keep deployed geo/CDN, live-provider and production-telemetry latency open.

### Keep client-workspace not-found rendering free of bootstrap errors
**Id:** client-not-found-script-safe-bootstrap · **Status:** building · **Size:** S · **Added:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/layout.tsx, src/app/portal/clients/[clientId]/layout.tsx, src/lib/chrome/colorMode.ts, src/components/chrome/sidebarCollapseState.ts, scripts/smoke-client-not-found-bootstrap.test.ts, scripts/smoke-sidebar-collapse-toggle.test.ts
**Why:** The old missing-client browser reproduction reached the correct 404 but React rejected two raw root-layout scripts. Both bootstraps now use identified Next 16.3 beforeInteractive components, preserve pre-paint storage behavior and leave no raw root script; the client still aborts before chrome construction.

Dedicated proof passes 4/4, focused bootstrap/theme/sidebar proof 23/23, the wider client/navigation/editor-layout gate 125/125 and TypeScript is clean. A later complete production build generated **245/245** pages; the earlier killed build remains non-evidence. Before Shipped, browser-regress valid, missing client/editor and generic 404 routes in both directions with zero script/hydration console errors and unchanged colour/sidebar state. Port 3032 was untouched.

### Make New Client materialise its selected lifecycle stage
**Id:** unify-new-client-phase-orchestration · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/clients/clientLifecycle.ts, src/app/portal/agency/_NewClientButton.tsx, src/app/api/portal/fulfillment/clients/route.ts, src/app/api/portal/fulfillment/presets/route.ts, src/built-ins/modules/fulfillment/src/api/handlers.ts, src/built-ins/modules/fulfillment/src/server/clients.ts, src/built-ins/modules/fulfillment/src/server/presets.ts, src/built-ins/modules/fulfillment/src/components/NewClientModal.tsx, src/server/clientRelationships.ts, src/app/api/tenants/client-workspaces/route.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/app/api/portal/persons/[personId]/route.ts, scripts/smoke-client-lifecycle-creation.test.ts
**Why:** Agency phases must be the one mounted source and creation must never claim success before the selected lifecycle is materialised. New Client, lead/contact/person conversion and linked workspaces now use one durable, replay-safe operation; Epic Intro uses Website Editor plus aqua-incubator, and incomplete results stay retryable.

The operation persists before side effects, checkpoints the client and resumes only
unfinished plugin/variant/checklist work; the exact clients route also restores GET.
Dedicated runtime proof passes **4/4**, the wider creation/lifecycle/navigation/
relationship gate **75/75**, and TypeScript is clean. Before Shipped, browser-submit
every built-in starting stage plus custom/deleted rows, force install/variant/portal
failure and retry after reload, and inspect the resulting installs, checklist, starter
and incomplete-state UI. Port 3032 was untouched during implementation.

### Make mutation failures visible and recoverable in the UI
**Id:** enforce-checked-ui-mutations · **Status:** building · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/client/checkedMutation.ts, scripts/smoke-checked-mutations.test.ts, src/built-ins/modules/agency-hr/src/components/LeaveBoard.tsx, src/built-ins/modules/memberships/src/components/SubscribersList.tsx, src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx, src/built-ins/modules/memberships/src/components/BenefitsList.tsx, src/built-ins/modules/memberships/src/components/NewPlanModal.tsx, src/built-ins/modules/affiliates/src/components/AffiliatesList.tsx, src/built-ins/modules/affiliates/src/components/AttributionsList.tsx, src/built-ins/modules/affiliates/src/components/PayoutsList.tsx, src/built-ins/modules/affiliates/src/components/MyAffiliatePanel.tsx, src/built-ins/modules/affiliates/src/components/CodesList.tsx, src/built-ins/modules/ecommerce/src/components/admin/InventoryTable.tsx, src/built-ins/modules/ecommerce/src/components/admin/DiscountsEditor.tsx, src/built-ins/modules/ecommerce/src/components/admin/ProductsList.tsx, src/built-ins/modules/fulfillment/src/components/ChecklistWidget.tsx, src/built-ins/modules/fulfillment/src/components/PhaseBoard.tsx, src/built-ins/modules/fulfillment/src/components/PhasesSettingsList.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/components/InvoiceDetailClient.tsx, src/built-ins/modules/agency-finance/src/components/InvoiceTemplateEditor.tsx, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/built-ins/modules/agency-finance/src/components/NewPlanForm.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/modules/agency-finance/src/components/BudgetPotsWorkspace.tsx, src/built-ins/modules/agency-finance/src/components/FinanceOperationsWorkspace.tsx, src/app/portal/clients/[clientId]/_FilesTabClient.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/clients/[clientId]/_OnboardingDashboardPanel.tsx, src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx, src/app/portal/clients/[clientId]/_PropertiesTabClient.tsx, src/app/portal/clients/_PeopleHub.tsx, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/app/portal/agency/people/_PeopleCommand.tsx, src/components/attention/TaskTemplates.tsx, src/components/attention/TaskChecklist.tsx, src/components/attention/CompletedRegister.tsx, src/app/portal/team/_TeamWorkspace.tsx, src/app/portal/freelancer/_ExitPreview.tsx, src/app/portal/agency/freelancers/_FreelancerManager.tsx, src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx, src/app/portal/agency/settings/PortalEditorPanel.tsx, src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/app/portal/agency/products/_ProductsWorkspace.tsx, src/app/portal/agency/performance/_PerformanceWorkspace.tsx, src/app/portal/agency/performance/_AquaTagDashboard.tsx, src/app/portal/agency/performance/_ExperimentsPanel.tsx, src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx, src/app/portal/agency/company/_CompanyWorkspace.tsx, src/app/portal/agency/company/_TradingCompaniesPanel.tsx, src/app/portal/agency/company/_CompanyConnectionsWorkspace.tsx, src/app/portal/agency/company/_LegalCompliancePanel.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/agency/development/_DevelopmentPortfolio.tsx, src/app/portal/agency/development/website/_WebsiteWorkspace.tsx, src/app/portal/agency/phases/_PhaseCardActions.tsx, src/app/portal/agency/phases/_AddCustomPhaseForm.tsx, src/app/portal/agency/phases/[phaseId]/_PhaseEditorForm.tsx, src/app/portal/clients/_IdentityReviewWorkspace.tsx, src/app/portal/agency/sop-library/_SopLibrary.tsx, src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx, src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx, src/app/portal/agency/inbox/_EnquiryCommunications.tsx, src/app/portal/agency/inbox/_MasterInbox.tsx
**Why:** At least 148 mounted handlers across Finance, Client Centre, plugins, communications, phases, SOPs, Development, KPI, tasks and staff/edit surfaces can hide or strand a refusal, rejected fetch or malformed response.

The newest handlers are in `src/app/portal/agency/actions/_ActionsWorkspace.tsx`
and `src/app/portal/agency/governance/_GovernanceWorkspace.tsx`, plus
`src/app/portal/dev-team/roadmap/_RoadmapWorkspace.tsx` and
`src/built-ins/modules/ecommerce/src/context/CartContext.tsx`.

Define one checked mutation-response convention, preserve form/input and busy state on refusal, surface safe server/transport/parse diagnostics, and prohibit uninspected or uncaught mutation fetches with a focused guard. Force non-success and rejected/malformed responses through representative financial, cancellation, approval and ordinary-edit browser/component flows before considering the class closed.

First implementation cohort (2026-08-26): the shared boundary now rejects
transport, unreadable/malformed JSON, non-2xx, `{ok:false}` and caller-invalid
success payloads. **46 mutation calls across 17 mounted components** now use it,
covering HR, Memberships, Affiliates, Ecommerce admin, Finance invoices, Task
Templates, Master Inbox and the complete Team Workspace. Refusal keeps user input/
context, settles busy state and renders a safe inline diagnostic. Dedicated helper/
guard **5/5**, affected Team/People/Task/Notepad/Dashboard **109/109**, earlier
HR/Membership/Affiliate **49/49**, Ecommerce/Finance **88/88**, Master Inbox
**20/20**, TypeScript and diff pass. The remaining audited families and literal
forced-failure browser interactions keep this item Building.

### Make Health Check result sharing state-bearing and truthful
**Id:** make-health-check-result-sharing-real · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** public/health-check/index.html
**Why:** The assessment labels its sample/self-reported evidence honestly, but the final email button inserts a literal results placeholder and the link button copies a URL containing none of the completed state. A second browser receives a fresh check, not the promised result, even though the progress-save flow already implements a seven-day resume token.

Generate one completed-state URL with the existing serializer and use it consistently for link and email-draft handoff. Make copy distinguish success from clipboard refusal, clarify whether email is sent or opened as a draft, and browser-compare the completed result after opening the URL in a clean session.

### Make automation run feedback reflect the persisted outcome
**Id:** make-automation-run-feedback-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/api/portal/automations/route.ts, src/app/portal/agency/automations/_AutomationsWorkspace.tsx, src/server/automations.ts
**Why:** The engine durably records an action failure and its diagnostic, but the manual-run response remains ok:true and the mounted UI maps every non-waiting result—including failed—to “Live flow completed.”

Keep request success separate from domain outcome if desired, but make the response and UI expose failed, skipped, waiting and succeeded distinctly. Show the last failure log immediately, refresh workflow counts, and force unavailable-email plus rejecting-webhook runs through component/browser acceptance.

### Repair the mounted Business OS destinations
**Id:** repair-business-os-assistant-actions · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** public/business-os/bos.js, public/business-os/lib/aqua-ai.js, public/business-os/tools.html
**Why:** The current public BOS mounts the scripted assistant, but its phase, company, bridge and recommendation chips still target the removed Incubator HTML set; its human actions use an empty WhatsApp recipient, and five unlocked Toolbox cards point to absent resources routes.

Map every reply and Toolbox action onto the current app.html, tools.html, quick-wins.html, diagnostic.html, implemented public tools and Health Check destinations or configured support. Remove retired phase semantics from live copy, source WhatsApp consistently, add a runtime catalogue/link resolver test and browser-click representative cards and prompt chips from the public BOS.

### Finish or remove the public AquaCRM founder film
**Id:** finish-public-aquacrm-founder-film · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** public/aquacrm-site/index.html, public/aquacrm-site/site-experience.js
**Why:** The root rewrite makes this the live public homepage, where the founder-film CTA has an empty YouTube source and activation exposes an internal instruction to add an approved URL instead of playing media.

Choose one explicit approved-media configuration path. Preserve honest loading, unavailable and provider-error states—or withhold the CTA until configured—and add source/component coverage plus browser acceptance for playback and every visible player control.

### Complete the Ocean Boulevard demo checkout
**Id:** complete-public-ocean-demo-checkout · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/(website)/portfolio/ocean-boulevard/OceanBoulevardDemo.tsx
**Why:** The public case study correctly frames its mutable UI as an interactive tour, but the POS cart enables Take payment without attaching any action or feedback.

Add a clearly labelled simulated approve/refuse outcome and reset, or remove the button. Pin disabled-empty and populated-cart behavior in component coverage, then click the full loop in browser acceptance.

### Reconcile AquaCRM and Milesymedia public navigation
**Id:** reconcile-public-brand-navigation · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** next.config.ts, src/app/(website)/WebsiteShell.tsx, src/app/(website)/client-centre/page.tsx, src/app/(website)/WebsitePageUpdating.tsx, public/aquacrm-site/index.html
**Why:** Several public pages visibly promise Milesymedia while their Home and Contact links resolve through the root rewrite into AquaCRM branding and its enquiry form; the public-site registry models those as distinct sites.

Choose canonical home/contact routes per brand or design an explicit co-branded transition. Centralise the mapping, inventory every public shell destination after rewrites, and browser-prove brand and enquiry continuity across logos, Home, Contact and primary CTAs.

### Make Notepad autosave exit-safe
**Id:** harden-notepad-autosave-lifecycle · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/notepad/_NotepadWorkspace.tsx, src/app/api/portal/notepad/route.ts, scripts/smoke-notepad.test.ts
**Why:** CRUD is durable after the request completes, but edits first wait in 650 ms component timers, no page-exit/unmount contract protects them, and a failed save exposes no retry action.

Choose a durable pending-revision queue/flush or a clear dirty-leave guard. Retain failed content, add explicit retry, make status visible on mobile, and component/browser-prove rapid navigation, note switching, page exit, offline failure, recovery and reload parity.

### Make client phase transitions atomic or durably resumable
**Id:** make-client-phase-transitions-convergent · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/fulfillment/src/server/transitions.ts, src/built-ins/modules/fulfillment/src/api/handlers.ts, src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx, src/app/portal/clients/[clientId]/_OnboardingDashboardPanel.tsx
**Why:** Existing-client movement changes plugins, starter variant, stage, checklist and activity in separate calls. A late failure can reject after durable changes, while skipped plugins/failed variants can be hidden inside success.

Persist one idempotent transition operation with step state, then reconcile to completion or compensate safely. Make skipped/partial outcomes visible and fault-test disable, install, variant, stage, checklist, activity and retry/reload boundaries in both mounted controls.

### Preserve unavailable reads across mounted product surfaces
**Id:** make-mounted-read-failures-truthful · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx, src/app/portal/agency/inbox/_EnquiryDetailCard.tsx, src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx, src/app/portal/customer/_portalData.ts, src/app/portal/clients/[clientId]/page.tsx, src/app/portal/agency/contacts/[personId]/page.tsx, src/app/portal/agency/contacts/[personId]/_Interactions.tsx, src/app/portal/agency/marketing/page.tsx, src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/components/attention/CompletedRegister.tsx, src/components/attention/EvidenceCard.tsx, src/components/attention/ResolutionBanner.tsx, src/app/api/portal/attention/plan/route.ts, src/components/chrome/PortalSearch.tsx, src/app/portal/agency/settings/PortalEditorPanel.tsx, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/clients/_IdentityReviewWorkspace.tsx, src/app/portal/clients/[clientId]/_PhaseTransitionButton.tsx
**Why:** At least 28 mounted reads turn unavailability into empty/default/stale state. Users can see “none/no matches,” lose data or controls, edit blank forms, receive the wrong queue/company, or see clear/current Finance claims when evidence failed.

The governance-scope case is in
`src/app/portal/agency/governance/_GovernanceWorkspace.tsx`.

Introduce a shared available/unavailable result shape for consequential reads. Propagate it through health and summary models, prohibit healthy/clear derivation from missing evidence, expose contextual retry and force each read family to fail in server-component/component/browser coverage.

### Make contract and reusable-template save retry-safe
**Id:** make-contract-template-save-idempotent · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/_ContractsPanel.tsx, src/app/api/tenants/client-contracts/route.ts, src/app/api/portal/contracts/templates/route.ts, scripts/smoke-client-contracts.test.ts
**Why:** Contract create succeeds before optional template create. A second-step failure leaves the editor in create mode, and the random-id route creates a duplicate contract when Save is retried.

Return/adopt the created contract id before the template step, or separate/coordinate template creation under an idempotency key. Force template refusal after contract success, retry and reload, asserting exactly one draft and one requested template.

### Share one customer-portal aggregate per request
**Id:** deduplicate-customer-portal-aggregate · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/customer/layout.tsx, src/app/portal/customer/_CustomerPortalViews.tsx, src/app/portal/customer/_portalData.ts, src/lib/server/inbox/inboxStore.ts, src/lib/server/websiteEnquiries.ts, scripts/smoke-end-customer-portal.test.ts
**Why:** Layout chrome and every built-in body independently call the full un-memoized loader. With Finance enabled in production, the repeated invoice, raw enquiry and four inbox reads can fan one screen out to 12 backend calls and produce different snapshots.

Create one normalized request-scoped data result that both chrome and body consume, or cache the low-level reads independently of presentation-only arguments. Preserve issue #57's available/unavailable distinction. Add call-count and shared-snapshot server-render coverage, then record real browser timing before claiming a performance improvement.

### Make KPI target persistence authoritative
**Id:** converge-kpi-target-plans · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/_CommandIntelligenceWorkspace.tsx, src/app/api/portal/kpi-registry/targets/route.ts, src/engines/data/server/kpi/kpiTargets.ts, src/server/storage.ts, scripts/smoke-kpi-targets.test.ts
**Why:** Edit, reset and suggestion acceptance promote values to React/localStorage before an unchecked server POST. A failed or falsely acknowledged file write leaves the originating browser on a different target version from the agency store and another operator.

Treat local edits as pending intent until the canonical version is durably acknowledged. Return/adopt the stored version, expose retry/conflict state, and reconcile #16's persistence acknowledgement. Force HTTP, transport, malformed-response and file-save failure for edit/reset/suggestion; retry, reload and a second browser must converge on exactly one version.

### Make utility actions settle truthfully after rejection
**Id:** settle-rejected-utility-actions · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/components/attention/TaskTemplates.tsx, src/app/portal/agency/development/_DevelopmentToolkitWorkspace.tsx, src/app/portal/agency/performance/_AquaTagDashboard.tsx, src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx
**Why:** Template load, toolkit pagination, credential reveal and Search Console connection checks can remain permanently busy after transport failure; Copy Tag writes the same clipboard value twice and can copy successfully before reporting no success.

Use one checked attempt per action, always settle pending state, surface unavailable/retry or copied/error explicitly, and component/browser-force rejected fetch and clipboard cases without altering server data.

### Make Email Sender's disabled provider truthful
**Id:** make-email-sink-state-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/email-sender/src/server/drivers/noop.ts, src/built-ins/modules/email-sender/src/server/delivery.ts, src/built-ins/modules/email-sender/src/server/provider.ts, src/built-ins/modules/email-sender/index.ts, src/built-ins/modules/email-sender/src/api/handlers.ts
**Why:** Provider none promises no real send but currently returns success, marks messages sent, promotes itself active and reports healthy without contacting any provider.

Model sink/dry-run as a separate non-delivered state and event. Keep provider `none` unconfigured, make readiness and health depend on a capable configured driver/identity, and add regressions for test-send plus every cross-plugin consumer so none can claim external delivery from the sink.

### Build one truthful Email Sender setup path
**Id:** make-email-sender-setup-operational · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/email-sender/index.ts, src/built-ins/modules/email-sender/src/pages/SettingsPage.tsx, src/built-ins/modules/email-sender/src/server/provider.ts, src/built-ins/modules/email-sender/src/server/identities.ts, src/built-ins/modules/email-sender/src/api/handlers.ts, src/components/workspaces/PluginSettingsPanel.tsx, src/lib/integrations/catalog.ts, src/lib/server/plugins/pluginSettingsSurface.ts
**Why:** The mounted page is read-only, the manifest omits the API key required by its own instructions, Postmark is absent from shared integrations, the generic settings form is not mounted here, and identity verification records success without provider evidence.

Choose one provider/config/vault contract instead of install config plus separate plugin rows. Mount provider, identity and test-send controls; support at least one genuinely implemented driver; verify the sending identity through that provider; and expose unconfigured, pending, active and error honestly. Test a fresh install at the service/API layer, then browser-prove credentials → verified sender → test delivery → signed webhook result.

### Make manifest settings an operable contract
**Id:** make-plugin-settings-operable · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/components/workspaces/PluginSettingsPanel.tsx, src/lib/server/plugins/pluginSettingsSurface.ts, src/app/api/portal/plugins/settings/route.ts, src/app/portal/agency/[...rest]/page.tsx, src/app/portal/clients/[clientId]/[...rest]/page.tsx, src/built-ins/modules/*/index.ts, src/built-ins/modules/*/src/pages/SettingsPage.tsx
**Why:** Twelve manifests declare 51 fields, but only Finance mounts the generic editor. Several Settings pages are read-only, several modules expose no settings page, and some declared fields have no runtime consumer.

Inventory every declared field by scope and consumer. Add a shared settings mount or deliberate custom form for each retained schema, make client/agency scope explicit, wire runtime reads, and remove fields that are merely aspirational. Add a registry gate that rejects unreachable/dead configuration and browser-prove representative agency- and client-scoped settings after reload.

### Make plugin health a real monitored lifecycle
**Id:** run-and-persist-plugin-healthchecks · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/runtime/_runtime.ts, src/built-ins/runtime/_types.ts, src/server/types.ts, src/server/pluginInstalls.ts, src/engines/data/server/radar/radarObservations.ts, src/engines/data/radar/radarRuleCatalog.ts
**Why:** Built-in healthcheck hooks have no caller or persistence path, yet Radar converts the missing results into zero failures and a healthy module-health signal.

Run enabled-install checks through a timeout-bounded runner after lifecycle changes and on a durable schedule. Persist result, checked time and diagnostic safely; distinguish never-run, stale, false, throw and timeout; require recent fleet coverage before Radar can be green; then prove those states from runtime through the visible systems signal.

### Restore client custom-portal materialisation
**Id:** restore-client-custom-portal-materialisation · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/_BuildPortalWizard.tsx, src/app/portal/clients/[clientId]/page.tsx, src/server/clientPortalSetup.ts, src/built-ins/runtime/_registry.ts
**Why:** The product-assigned client overview offers Build custom portal, but its preset and export endpoints target a portal-export module that is not present or registered.

Choose one canonical portal materialisation path. Make readiness explicit before the modal, implement the preset and build contract (or adapt the existing starter-portal provisioner), honour template and plugin choices, return a durable result, and browser-prove the CTA changes to Open live experience after reload.

### Make the client project lifecycle retry-safe
**Id:** reconcile-client-project-provider-actions · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/api/tenants/client-projects/provision/route.ts, src/lib/server/clients/clientProjectProvisioner.ts, src/app/api/tenants/client-projects/publish/route.ts, src/app/api/tenants/client-projects/deploy/route.ts, src/lib/server/integrations/githubProjectPublisher.ts, src/lib/server/integrations/vercelProjectDeployer.ts, scripts/smoke-client-project-provisioning.test.ts
**Why:** The local project folder/Git history and the GitHub/Vercel resources are all created before client metadata is durable, so a later failure leaves an untracked result and retry can suffix, collide or duplicate.

Persist a scoped operation before filesystem/provider work, record the local path and provider ids as soon as they exist, reuse or reconcile an existing folder/repository/deployment on retry, and define safe cleanup where reuse is impossible. Fault-inject after folder copy, initial commit, repository creation, Git push, deployment creation and client save; each retry must converge on one project and one truthful client record.

### Make the private-upload lifecycle recoverable
**Id:** reconcile-private-upload-lifecycle · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/privateUploadStorage.ts, src/app/api/tenants/client-files/upload/route.ts, src/app/api/tenants/client-files/route.ts, src/app/api/public/careers/route.ts, src/app/api/portal/company/legal, src/app/api/portal/sops, src/app/api/portal/development, src/app/api/portal/inbox/media, src/app/api/portal/finance/expense-attachments, src/app/api/portal/marketing/campaign-assets, src/app/api/portal/website-enquiries/calls/recording, src/app/portal/customer/_ProductWorkspaceApplication.tsx, src/app/api/tenants/product-workspaces/route.ts
**Why:** Nine upload routes commit storage before the owning record or final user action; staged uploads are not expired, four delete paths suppress storage failure after record removal, and the mounted workspace batch can overstate its 30-file cap or duplicate partial success on retry.

Persist object intent and storage identity before/through provider calls, model uploading/ready/deleting/delete-failed, expire abandoned staged objects, retain diagnostics without leaking secrets, and add reconciliation or compensation. Make batch limits and completed/failed counts explicit and resumable. Fault-inject provider, owning-record, collection-attach and abandonment failures for Supabase, Vercel Blob and local storage; after retry and reload, exactly one reachable object per intended file or no object must remain.

### Make Close the deal issue a reviewable agreement
**Id:** make-close-deal-contract-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/closeDeal.ts, src/app/api/tenants/close-deal/route.ts, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx, src/app/portal/customer/_CustomerPortalActions.tsx, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-close-deal-route.test.ts
**Why:** Close Deal bypasses the normal contract route's reviewability check, can expose a title-only sent contract for customer acceptance, and claims delivery without running it.

Require terms or a document, create one immutable reviewable version, publish/send it through the canonical contract delivery contract, return a truthful delivery state, and pin the customer-visible version through acceptance. Browser-prove both Finance and Pipeline entry points plus the customer response.

### Respect commercial email delivery results
**Id:** make-commercial-delivery-truthful · **Status:** planned · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/lib/server/leadsPipelinePorts.ts, src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/lib/domain.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** The real adapter returns explicit delivery failure without throwing, but proposal/invoice and receipt milestones currently advance on any resolved result.

Persist queued/delivered/failed state plus message id/error, set `sentAt` and `receiptSentAt` only after confirmed delivery, expose retry through the commercial UI, and prove failed provider → unchanged business milestone → successful retry.

### Bind commercial acceptance and payment to immutable versions
**Id:** version-commercial-proposal-acceptance · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/lib/domain.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/app/api/public/proposals/[token]/route.ts, src/app/proposal/[token], src/app/portal/agency/leads-pipeline/contacts/_CommercialPackModal.tsx, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** Draft tokens are publicly acceptable, accepted content can be overwritten without resetting acceptance, and payment URLs can outlive the financial terms used to create them.

Persist immutable sent versions with a content hash, accept only the current sent version, record accepted version/hash/name/time, create a new draft for every amendment, and clear/recreate Checkout when price or cadence changes. Prove draft refusal, post-acceptance stability, amendment re-acceptance and matching payment amount in browser plus behavioural tests.

### Make commercial installments stop exactly
**Id:** reconcile-commercial-installment-completion · **Status:** planned · **Size:** M · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/lib/domain.ts, src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts
**Why:** The final-installment webhook ignores Stripe cancellation failure and still acknowledges success; its count/allocation do not exactly represent the promised schedule.

Persist installment ordinal/provider invoice ids and cancellation pending/failed/confirmed state, allocate the exact total including the final remainder, exclude manual records from the provider schedule, retry or reconcile cancellation until confirmed, and test that the subscription cannot produce a collectible invoice beyond the advertised count.

### Findings and the Auditor become one thing
**Id:** findings-auditor-merge · **Status:** planned · **Target:** 2026-08-23 · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** They are the same thing — one is found by hand, one is found automatically. Two sections for one idea is friction.

### Launch — the bits that are not code
**Id:** launch-external · **Status:** planned · **Target:** 2026-08-27 · **Size:** M · **Owner:** Ed · **Added:** 2026-08-20 · **Source:** ed
**Why:** Most of this list was already done — the docs had not caught up. Verified against the live Supabase on 2026-08-20.

HISTORICAL LIVE CHECK, 2026-08-20: RLS was ON and the anon key returned 0 rows from brand_enquiries (35 existed), profiles, app_datastores and website_consent_events; brands and shoots deliberately exposed only website content. **Current local correction, 2026-08-24:** the Stripe, GitHub and Vercel variable names exist in `.env.local`, but their values are blank at this checkout; Resend is set. Per-install encrypted Finance settings may hold a Stripe connection, but this review did not inspect or expose secret values. `stripe@22.5.0` and the Finance settings/vault path are installed. STILL OPEN: verify deployment env separately, then complete the signed HTTPS Stripe Checkout/payment/refund walkthrough; create the Meta app; obtain DPO sign-off. The 2026-08-20 row is historical evidence, not a claim about today's live row counts.

### The AquaCRM editor, properly — superseded scope
**Id:** aqua-editor · **Status:** parked · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** dev-editor-finish
**Files:** docs/development/plans/dev-team-portal.md, scripts/smoke-dev-console-topbar.test.ts, scripts/smoke-dev-roadmap.test.ts, scripts/smoke-dev-team-portal.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/portal/dev-team/, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/page.tsx, src/app/portal/dev-team/, src/lib/chrome/sidebarLayout.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devModeAccess.ts, src/lib/server/dev/devTeamAuditor.ts, src/lib/server/dev/devTeamBoard.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devTeamPlans.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamTasks.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamWorkers.ts, src/server/storage.ts, src/server/types.ts
**Why:** Edit AquaCRM the same way the site and portal editors work — and it matters more than it looks, because it runs on the shared edit engine that everything else will ride.

This row records the earlier v1 scope and is superseded by the Now outcome
`repository-backed-dev-workspace-launch`. Repository writes are no longer out of scope: they must
occur only inside a selected project's isolated branch/worktree and flow through diff, checks,
commit and PR. The wider AquaCRM application and unrelated projects remain outside that workspace's
authority unless granted separately.

### Updates actually reach the Master Inbox
**Id:** updates-actually-reach-the-master-inbox · **Status:** idea · **Size:** M · **Added:** 2026-08-20 · **Source:** commander
**Why:** The console claims a published dev update lands in the Master Inbox. It does not — the composer writes the changelog file and stops.

Verified 2026-08-20: zero delivery code in the updates route, devTeamUpdates.ts, _Section.tsx or _UpdateComposer.tsx. The blocker is design, not effort: listOperationalAlerts(agencyId) is scoped per AGENCY with no role, so pushing dev updates there would show the dev changelog to every staff member. Needs role-scoped alerts (pass the session through, or a founder-only alert class) before the source can be added.

### Re-enter the Aqua Tag routing config that production lost
**Id:** re-enter-the-aqua-tag-routing-config-that-production-lost · **Status:** planned · **Size:** S · **Added:** 2026-08-20 · **Source:** commander
**Why:** The hydration bug destroyed the tag's routing layer in production, not just locally — the config has to be put back once the fix ships.

parseBlob rebuilt state field-by-field with no spread and omitted four collections, so every hydration destroyed them. Confirmed in PRODUCTION on 2026-08-20: the app_datastores blob holds 56 collections and agencyMasterTagKeys, websiteSources, websiteSiteConfigs and enquiryContactDetails are all absent, against 2 agencies and 11 clients of real data. Enquiries themselves survived because brand_enquiries is its own Supabase table written directly (35 rows, plus 10 consent events) — it is the APP-SIDE ROUTING that kept being wiped: which tagged site maps to which source, the master tag key per agency, per-site config, and operator-added enquiry contact details. The code fix has landed (storage.ts + smoke-state-roundtrip.test.ts) so it will persist from now on, but the historical values are unrecoverable and must be re-entered after deploy.

### Pre-launch security hardening
**Id:** security-hardening · **Status:** building · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** auditor
**Plans:** security-hardening, mfa-login
**Files:** docs/development/plans/mfa-login.md, docs/development/plans/security-hardening.md, next.config.ts, scripts/smoke-mfa.test.ts, scripts/smoke-production-readiness.test.ts, src/app/api/auth/login/route.ts, src/app/api/portal/mfa/enrol/route.ts, src/app/api/portal/mfa/verify/route.ts, src/app/portal/account/page.tsx, src/lib/chrome/sidebarLayout.ts, src/lib/server/auth/auth.ts, src/lib/server/auth/csrf.ts, src/lib/server/auth/mfa.ts, src/lib/server/auth/nonceStore.ts, src/lib/server/inbox/operationalAlerts.ts, src/lib/server/productionReadiness.ts, src/lib/server/rateLimit.ts, src/lib/server/safeSiteFetch.ts, src/lib/server/secrets.ts
**Why:** Sign-in, sessions and rate limiting had to be right before anyone real touched it.

### One app, a company switcher, and brand-aware sign-in
**Id:** one-instance-per-company-stop-hosting-subbrands-as-tenants · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Files:** src/archive/multi-agency/components/AgencySwitcher.tsx, src/archive/multi-agency/components/TenantSwitcher.tsx, src/archive/multi-agency/api, src/lib/brands/authBrand.ts, src/app/login/page.tsx, src/app/api/auth/login/route.ts, src/server/tradingCompanies.ts
**Why:** Ed's call: still ONE server and ONE app. He gets a company switcher that loads him in as a company, and signing in from a company's own website drops him into AquaCRM already scoped to that company.

CORRECTED 2026-08-20 — my first reading of this was wrong. It is NOT one deployment per company. One server, one app, multi-company, with a switcher. MUCH OF IT ALREADY EXISTS, in two places: (1) THE SWITCHER WAS BUILT AND THEN ARCHIVED. src/archive/multi-agency/ holds AgencySwitcher.tsx, TenantSwitcher.tsx and the create/switch API routes. Its README says they were parked because 'Milesymedia is currently a single bespoke agency workspace'. That premise is the thing Ed just reversed, so this is un-archiving and re-fitting, not building. (2) SIGN-IN IS ALREADY BRAND-AWARE. /login takes ?brand= and lib/authBrand.ts resolves it, with a deliberate guard that an unknown or stale brand falls back to AquaCRM rather than leaking an unrelated client's brand — keep that guard. Today it knows four brands (milesymedia, aqua, aquacrm, zimante) as a hardcoded list; it needs to resolve companies instead. The session already carries agencyIds + activeAgencyId, which is the switch mechanism. STILL TO DECIDE: whether a 'company' here is an Agency or a TradingCompany (both exist; tradingCompanies.ts is 146 lines) — that choice decides the whole shape and is Ed's.

### GDPR always on, HIPAA as a per-instance toggle
**Id:** gdpr-always-on-hipaa-as-a-per-instance-toggle · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** compliance-legal
**Why:** Ed's call: GDPR is the standard everywhere; flip HIPAA on for an instance serving medical professionals and that agency is good to run.

This resolves the open 'GDPR-first vs HIPAA' question that has been blocking operations-command-surface. The compliance-legal plan already anticipated it — 'covers GDPR now, a HIPAA track if he wants medical data' — so this is the steer that unblocks it, not a new direction. HIPAA exists in DOCS ONLY today: six markdown files mention it, zero code. So the toggle is greenfield. KEEP THE PLAN'S HONESTY RULE VERBATIM: the app cannot make you compliant. It gives controls, evidence and a truthful posture. HIPAA in particular needs BAAs and legal sign-off that code can track but never confer — a toggle that implies 'now you are HIPAA compliant' would be worse than no toggle at all. PAIRS WITH the one-instance-per-company decision: compliance mode is per instance, which is exactly why that model makes this clean.

### One element engine — unify the three vocabularies
**Id:** one-element-engine-unify-the-three-vocabularies · **Status:** planned · **Size:** XL · **Added:** 2026-08-20 · **Source:** ed
**Why:** Website blocks, portal modules and product stages are three dialects of one idea: a placeable thing with props. Every element gets built twice, and an AI assistant cannot compose against three vocabularies.

Ed: 'the onboarding builder is just a stage builder, the same as the website engine editor thing — it's all the same and it annoys me because we are losing so much everywhere.' WHAT IS ALREADY DONE: the EDIT ENGINE is unified. src/engines/editor/editing/engine.ts (EditTarget → EditIntent → planEdits → runEdits) already has four adapters — portalForm, agencyWebsite, clientPortal, appConfig — so dry run, before/after diff, conflict checks and explicit-confirm are shared today. WHAT IS NOT: the VOCABULARY. ~78 website blocks vs ~48 portal modules, two type systems, no shared element type; the stage builder is a third dialect. So this is one shared ELEMENT REGISTRY, not one editor — the editor is done. ⚠ HARD CONSTRAINT: live client websites render from the website blocks and live portals from the portal modules. Nothing may break. A fourth registry alongside three is the worst outcome (see hazards-and-duplication.md).

### Stages carry what the client sees — retire the four-mode enum
**Id:** stages-carry-what-the-client-sees-retire-the-four-mode-enum · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Files:** src/server/types.ts, src/app/portal/agency/products/_ProductsWorkspace.tsx, src/server/agencyProducts.ts
**Why:** A product can define any number of custom stages, but each one collapses into one of four hardcoded website-build experiences with a single blurb. That is why bespoke portals for bespoke services cannot be built.

THE CEILING, precisely: AgencyProductWorkspaceStage carries portalMode, typed as AgencyProductPortalMode = onboarding|designing|developed-launch|maintenance, and the client-facing content is portalStageFocus: Partial<Record<PortalMode, string>> — one text blurb per fixed mode. portalTemplateKey is a further closed list of 11. The INTERNAL half is already right: lifecycleStages is a real array with a real builder. It is only the client-facing half that is an enum. THE FIX: a stage carries its own client-facing payload — welcome video, tasks, arbitrary elements — instead of pointing at one of four. THIS IS THE ONBOARDING BUILDER; it belongs on the stage builder that already exists, not as a new surface. DEPENDS ON the element registry — a stage should hold ELEMENTS, so build that first. ED IS BUILDING THIS ONE HIMSELF: 'I want to personally build the client portal states with the stunning standard as the starting point' — because guessing is what produced the current shape.

### Everything configurable in the app, nothing in a deploy
**Id:** everything-configurable-in-the-app-nothing-in-a-deploy · **Status:** planned · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed: if a buyer needs their own build to configure it, he is giving the product away rather than selling it. This is the constraint that decides many other choices.

THE PRINCIPLE: any setting that requires an env var or a redeploy cannot ship in a sellable product, because configuring it requires the source. So every knob must live in the app, per company, editable by the owner. IT DECIDES A LOT OF WHAT IS ALREADY ON THIS ROADMAP: the HIPAA toggle must be in-app per company; the levels configurator must be in-app; branding already is; payment credentials stay in-app for exactly this reason; integrations must be configurable without a deploy. IT ALSO CONFLICTS with something currently true: inspectProductionReadiness() reads its verdict from ENV KEYS (STRIPE_SECRET_KEY, RESEND_API_KEY, PORTAL_SESSION_SECRET…). For Ed's own instance that is right. For a SOLD instance the owner cannot set those, so readiness would read as permanently unready. That needs resolving before anything is sold — probably by reading per-company config first and falling back to env. AUDIT NEEDED: find every setting that is env-only today and list what would have to move. That list is the real scope of 'sellable'.

### Promote a trading company into its own portal
**Id:** promote-a-trading-company-into-its-own-portal · **Status:** planned · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's model, settled 2026-08-20: AGENCY is the holding group, TRADING COMPANIES are the actual businesses under it, and each company has its own clients. A company does not become an agency — it stays a company and gains its own portal.

⚠ MODEL SETTLED — this supersedes the earlier 'a company is an Agency' assumption I built the switcher on. Ed: 'it's both — agency as a holding group, trading companies as companies, and then each company has clients. Simples.' SO: three permanent tiers, not two. Agency (holding group) → TradingCompany (the business) → Client. Client.companyId already exists, so clients can already belong to a company — the model is half-built already. WHAT THIS CHANGES: 'promotion' is no longer company→agency. A company keeps being a company and gains its own portal and its own switched-on features. That means company-scoped plugin installs ARE needed after all — PluginInstallScope is {agencyId, clientId?} today with the id `${agencyId}|${clientId ?? '_agency'}|${pluginId}`, so a companyId dimension has to be added deliberately (it touches the key format and every reader). The switcher shipped switching AGENCIES; it will also need to switch COMPANIES within a holding group. Its security rule (session.agencyIds ∩ liveUser.agencyIds) stays — company membership narrows within an agency you already belong to, never widens. STILL TRUE from the earlier decision: what moves is a SELECTION — move all records, or start blank from a seed and import per record type later, with enquiries individually optional because their consent records do not automatically travel to a new legal entity.

---

## Later
_After launch._

### Credentials stay in the app — a database proxy comes later
**Id:** payment-credentials-live-in-vercel-env-never-in-the-app · **Status:** parked · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's call, reversed 2026-08-20: keep credentials in the app and wire a separate database proxy solution later.

REVERSED 2026-08-20, and the reason is commercial, not technical. Ed: 'if I want to make this like agency software it means they'd need their own build of it to configure it, and I'd just be giving it away.' Anything configured by an env var requires a deploy, which requires the source — so an env-var-configured product cannot be sold, only handed over. It also does not survive the company switcher: one app serving many companies means each company needs ITS OWN Stripe keys, and process.env cannot be per-company. So install-config storage (readStripeKeysFromInstall reading config.stripeSecretKey off the plugin install) is the right shape; the real answer is a PROXY in front of the store. WORTH REMEMBERING WHEN THE PROXY IS BUILT: those values sit in pluginInstalls inside the portal state blob — forked per worker, copied to scratchpad, restored between sandboxes. Nothing is exposed today (verified: zero credential-shaped values in state), and PORTAL_VAULT_ENCRYPTION_KEY is already set, so there is an encrypted-at-rest path to build on. `stripe@22.5.0` and the encrypted settings path are now in place; pay-by-card remains blocked on real keys and a signed live walkthrough.

### Radar catalogue — section 9
**Id:** radar-section-9 · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** commander
**Why:** More families means Radar sees more of the business without more setup.

The existing brief has a STALE invariant — it says 2,040 rules / 170 families, but Aqua Tag grew it to 2,064 / 172. Correct the brief before spinning or the worker's first suite run fails.

### Advisor Omega
**Id:** advisor-omega · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** advisor-omega-upgrade
**Files:** docs/development/plans/advisor-omega-upgrade.md, docs/workspace/advisor.md, scripts/smoke-advisor-actions.test.ts, scripts/smoke-advisor-skills.test.ts, src/app/api/assistant/route.ts, src/app/api/portal/advisor/skills/route.ts, src/app/portal/agency/assistant/AssistantWorkspace.tsx, src/components/chrome/GlobalAdvisorDrawer.tsx, src/lib/advisor/advisorActions.ts, src/lib/advisor/advisorSkills.ts, src/lib/server/assistants/advisorSkillContext.ts, src/lib/server/assistants/advisorSkillsService.ts, src/lib/server/assistants/openaiAssistant.ts, src/server/customAIs.ts
**Why:** The advisor should reason over the whole business, not one screen at a time.

BLOCKED ON ED: the vision. What is Omega actually for, in one sentence.

### Operations command surface
**Id:** operations-surface · **Status:** parked · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Plans:** operations-command-surface
**Files:** docs/development/plans/operations-command-surface.md, src/app/api/portal/company/legal/content/route.ts, src/app/api/portal/company/legal/route.ts, src/app/api/portal/company/legal/upload/route.ts, src/app/portal/agency/company/_CompanyWorkspace.tsx, src/app/portal/agency/company/page.tsx, src/lib/chrome/sidebarLayout.ts, src/engines/data/radar/radarRuleCatalog.ts, src/lib/server/productionReadiness.ts, src/engines/data/server/radar/radarObservations.ts, src/server/storage.ts, src/server/types.ts
**Why:** Delivery work needs the same command-grade surface Finance and Journey have.

BLOCKED ON ED: the sidebar name, and GDPR-first vs HIPAA-shaped compliance.

### You-Deserve-It
**Id:** you-deserve-it · **Status:** parked · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Plans:** you-deserve-it-upgrade
**Files:** docs/development/plans/you-deserve-it-upgrade.md, scripts/smoke-finance-delight-expense.test.ts, src/app/api/tenants/client-delight/route.ts, src/app/portal/agency/you-deserve-it/_YouDeserveItWorkspace.tsx, src/app/portal/agency/you-deserve-it/page.tsx, src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx, src/app/portal/clients/[clientId]/_tabs.ts, src/lib/server/clients/clientDelightExpense.ts, src/lib/server/inbox/operationalAlerts.ts, src/server/clientDelight.ts, src/server/persons.ts, src/server/storage.ts, src/server/types.ts
**Why:** The reward layer — it makes the operating system feel like it is on your side.

BLOCKED ON ED: when.

### KPI saved views, stored server-side
**Id:** kpi-saved-views · **Status:** parked · **Size:** S · **Added:** 2026-08-20 · **Source:** ed
**Why:** A saved view that only lives in one browser is not saved.

Built local-only in the kpi-intelligence-overhaul plan; Ed asked for both local and server-persisted. Needs its own plan — that one already shipped.

### Talk to an assistant, get a bespoke client build
**Id:** talk-to-an-assistant-get-a-bespoke-client-build · **Status:** idea · **Size:** XL · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed's endgame: describe what a client needs and have the portal, site and onboarding built ready to go — bespoke, not templated.

Sequence matters: this is step 3 of 3. The assistant emits EditIntents against the SHARED ELEMENT REGISTRY, and because it goes through the existing edit engine it inherits the dry run and the explicit-confirm for free. ⚠ KEEP THE HOUSE RULE: suggested Radar/Advisor/AI work requires human acceptance before it becomes committed work (CLAUDE.md, non-negotiable). The assistant PROPOSES a plan; Ed accepts it. Designing it to write directly would break a contract this codebase enforces everywhere else. Building this before the registry exists produces another guess — which is the thing Ed is already unhappy about.

### Agency levels — a configurator that unlocks as you grow
**Id:** agency-levels-a-configurator-that-unlocks-as-you-grow · **Status:** idea · **Size:** L · **Added:** 2026-08-20 · **Source:** ed
**Why:** The app is level 50 while level 1 is not proven. Levels give a finish line: declare what a company needs to operate, ship that, and keep the rest visible but locked.

Ed's framing: a tycoon-style unlock, configured in settings, so later levels never block day-one operation and unfinished surfaces say 'not yet' honestly. MOSTLY ALREADY POSSIBLE: sidebarLayout.ts already assembles nav from pluginInstalls at request time, and there are 13 installable modules. A LEVEL IS A NAMED BUNDLE OF PLUGIN INSTALLS — config over machinery that exists, not new architecture. Aqua Oasis Web (solo website studio) omits agency-hr, ecommerce, memberships, affiliates entirely. ⚠ THE TRAP: 'locked until level 3' must mean NOT IN SCOPE YET, never BUILT BUT BROKEN. The moment the lock hides unfinished work, level 1 ships believing it is solid and hits the same wall with a nicer UI. Rule: a feature is either in your level and verified end-to-end, or it is locked. Nothing half-in. COMMANDER'S ADVICE (Ed to decide): define level 1 by walking a real day — lead → qualify → quote → accept → payment → build → portal → handover → review — not by listing modules. The breakages ARE the level-1 build list. And put 'business strategy' (Command Centre/Radar/ Advisor) at level 2: on day one there is no data, so it shows empty rings.

### Sell a company as a template
**Id:** sell-a-company-as-a-template · **Status:** idea · **Size:** M · **Added:** 2026-08-20 · **Source:** ed
**Why:** Ed: he may sell the agency as a template. A blank, correctly-configured company is then a product, not just a dev convenience.

Raises the bar on two things already found: (1) the old tenant teardown cleared only 25 collections while the current exhaustive promotion map classifies all 83, so a template built from an incomplete wipe would ship the previous tenant's Persons, API keys, notes and calendar entries; (2) the hydration bug meant a customer's tag config would evaporate on their first restart (fixed 2026-08-20). Both stop being hygiene and become blocking. Pairs with seed zero and the levels configurator: seed zero + a level = a company operational on day one.

---

## Someday
_Ideas and requests, undated._

### Aqua Tag remainders
**Id:** aqua-tag-remainders · **Status:** idea · **Size:** S · **Added:** 2026-08-20 · **Source:** commander
**Why:** The in-lane Aqua Tag backbone shipped; five cross-system edges remain.

P5 live health/firing findings need probe/correlation work · own/company-site editing needs agency-scoped editor support · company-routed enquiries need a company-facing view · per-client injection keys need a client-key→agency resolver · the registry still needs richer installed/reporting/forms/tools state.

---

## Shipped
_Done and verified._

### Rebuild the Fulfillment lifecycle smoke around current phases
**Id:** refresh-fulfillment-lifecycle-smoke · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/fulfillment/src/__smoke__/lifecycle.test.ts, src/built-ins/modules/fulfillment/src/server/presets.ts, package.json
**Why:** The suite now seeds all seven Aqua/churned rows, creates at Epic Intro, drives every active hop and checks the current plugin/starter/checklist and transition soft-fail contracts. Direct jump and partial creation retry remain covered in focused companion tests. smoke:all explicitly includes the nested suite; the focused lifecycle/navigation gate passes 43/43 and the wider creation gate 75/75.

### Make Ecommerce discount value transactional
**Id:** transactional-ecommerce-discount-value · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/context/CartContext.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/discounts.ts, src/built-ins/modules/ecommerce/src/server/giftCards.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** Quote-only Apply no longer spends value. Checkout-owned reservations now coordinate gift-card redemption, custom-code capacity and pending issuance; paid settlement commits once, expiry/cancel releases, exact-zero is supported and the full-refund policy restores redeemed balance once.

Concurrency, replay, pending issuance, exact-zero and refund restoration pass in the focused 39/39 gate. Mounted/live-provider acceptance remains tracked in issues #69–#70.

### Make Ecommerce product retirement dependency-safe
**Id:** dependency-safe-ecommerce-product-retirement · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/pages/ProductsPage.tsx, src/built-ins/modules/ecommerce/src/components/admin/ProductsList.tsx, src/built-ins/modules/ecommerce/src/components/admin/ProductEditor.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/lib/admin/collections.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** The ordinary mounted action is now honestly Archive. It retains the stable product parent, collections, inventory/reservations and historical order truth, while authoritative checkout rejects archived/stale lines. No exceptional permanent-purge UI is exposed.

Archive/stale-checkout and recoverable rename/dependency proof passes in the product lifecycle gate. Mounted archive/restore, stale-tab and reload acceptance remains.

### Make Ecommerce inventory transactional
**Id:** transactional-ecommerce-inventory · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/context/CartContext.tsx, src/built-ins/modules/ecommerce/src/lib/admin/inventory.ts, src/built-ins/modules/ecommerce/src/components/admin/InventoryTable.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** Checkout operations now own replay-safe per-SKU reservation markers, enforce capacity, resume partial multi-SKU work, release on expiry/cancel and commit on paid settlement. The global whole-cart reservation route refuses mutation, while versioned admin edits preserve active reservation/threshold state and reject conflicts.

Concurrency/failure/expiry/source proof passes in the focused 39/39 gate. Mounted two-cart/admin acceptance remains.

### Wire Ecommerce shipping and tax to one quote
**Id:** wire-ecommerce-shipping-tax · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/components/admin/ShippingEditor.tsx, src/built-ins/modules/ecommerce/src/lib/admin/shipping.ts, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/lib/stripe/server.ts, src/built-ins/modules/website-editor/src/components/blocks/CheckoutSummaryBlock.tsx, src/built-ins/modules/ecommerce/src/server/discounts.ts, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** One authoritative minor-unit quote now resolves configured fixed/weight/free shipping, country, currency and inclusive/exclusive tax. Checkout Summary requests it, Stripe receives the exact snapshot with automatic repricing disabled, and the order retains the same breakdown.

Fixed/weight/free, inclusive tax, unsupported country and quote immutability pass in the focused gate. Mounted/live-Stripe display, reload and settlement acceptance remains.

### Make Ecommerce order state durable and provider-backed
**Id:** durable-ecommerce-order-state-machine · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/orders.ts, src/built-ins/modules/ecommerce/src/components/admin/OrderDetail.tsx, src/built-ins/modules/ecommerce/src/lib/stripe/server.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/server/discounts.ts, src/built-ins/modules/ecommerce/src/server/giftCards.ts
**Why:** Durable processing/failed/completed delivery state now resumes interrupted work. Paid settlement consumes the authoritative checkout operation before committing stock/value; expiry releases it, cumulative refunds replay safely and operational edits are constrained audited fulfilment transitions rather than provider-fact rewrites.

Fresh-container retry, failure boundaries, out-of-order refunds, pending/ready confirmation, expiry and exact-zero settlement pass in the 8/8 order gate. Signed real-Stripe and mounted-transition acceptance remains.

### Make Ecommerce reporting truthful by state and currency
**Id:** truthful-ecommerce-reporting · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/lib/admin/orders.ts, src/built-ins/modules/ecommerce/src/lib/admin/customers.ts, src/built-ins/modules/ecommerce/src/components/admin/OrdersList.tsx, src/built-ins/modules/ecommerce/src/components/admin/CustomersList.tsx, src/built-ins/modules/ecommerce/src/pages/CustomerDetailPage.tsx, src/built-ins/modules/ecommerce/src/server/orders.ts
**Why:** Orders now partition gross, refund, net, cancelled and pending values by source currency; customer spend is net settled money per currency. Mounted summaries label groups rather than inventing a GBP aggregate.

Mixed paid/refunded/cancelled currency and customer fixtures pass dedicated 3/3 proof. Retain this in the canonical gate.

### Version Ecommerce product authoring and stabilise identity
**Id:** version-ecommerce-product-authoring · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/ecommerce/src/components/admin/ProductEditor.tsx, src/built-ins/modules/ecommerce/src/components/admin/VariantsEditor.tsx, src/built-ins/modules/ecommerce/src/api/handlers.ts, src/built-ins/modules/ecommerce/src/server/productsStore.ts, src/built-ins/modules/ecommerce/src/lib/products.ts, src/built-ins/modules/ecommerce/src/lib/admin/collections.ts
**Why:** New products receive server-owned stable ids; details and variants are scoped compare-and-swap commands with visible conflicts; slug migration is durable/recoverable and preserves collections/inventory; option/variant commands validate their graph while retaining colour, image, modifier, availability and sale-price metadata.

The product lifecycle gate passes 6/6. Literal mounted two-tab conflict/rename/rich-edit/reload acceptance remains.

### Make Affiliate identity claims atomic
**Id:** atomic-affiliate-identity-claims · **Status:** shipped · **Size:** M · **Added:** 2026-08-25 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/affiliates/src/server/affiliates.ts, src/built-ins/modules/affiliates/src/server/codes.ts, src/built-ins/modules/affiliates/src/server/attributions.ts, src/built-ins/modules/affiliates/src/server/payouts.ts, src/built-ins/modules/affiliates/src/server/ports.ts, scripts/smoke-affiliate-atomic-claims.test.ts
**Why:** Durable install-scoped claims now choose one complete enrolment/code/attribution row before row, pointer or index work. Identical retries repair and return it, conflicting ownership rejects, collection locks keep every shared index lossless and per-attribution markers reconcile counters exactly once.

Delayed two-container same/distinct identity races, interrupted writes and fresh-container recovery prove one visible/resolvable identity, exact counters and no orphan: dedicated 4/4, focused 27/27 and widened Membership/Affiliate/Ecommerce 86/86; TypeScript/diff pass.

### Reconcile Finance reporting semantics
**Id:** canonical-finance-reporting · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/accounting.ts, src/built-ins/modules/agency-finance/src/server/pnl.ts, src/built-ins/modules/agency-finance/src/server/reports.ts, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/server/index.ts, src/built-ins/modules/agency-finance/src/components/FinanceCurrencyNav.tsx, src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx, src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx, src/built-ins/modules/agency-finance/src/pages/BudgetsPage.tsx, src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/api/handlers-r007.ts, src/engines/data/server/kpi/companyHealthSnapshot.ts, scripts/smoke-finance-accounting-semantics.test.ts
**Why:** One selected-currency accounting snapshot separates receipt cash, reimbursed costs, accrual revenue, commitments, pending costs, receivables and tax. It keeps legacy paid compatibility without implicit FX. Every Finance headline/API plus recurring and client metrics consume that boundary.

The dedicated mixed GBP/USD fixture covers partial/full/status-only-refunded receipts, pending/approved/reimbursed costs, per-currency MRR, Report/P&L agreement, mounted APIs and every UI headline consumer: **5/5**. Complete Finance **261/261** at shipment, TypeScript and `git diff --check` pass. Durable partial/full reversals were then completed under #119; port 3032 and retained data were untouched.

### Model Finance refunds in the ledger
**Id:** ledger-backed-finance-refunds · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/lib/paymentAllocation.ts, src/built-ins/modules/agency-finance/src/lib/stripe.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/agency-finance/src/server/stripeReconcile.ts, src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts, src/built-ins/modules/agency-finance/src/server/accounting.ts, src/built-ins/modules/agency-finance/src/server/pnl.ts, src/built-ins/modules/agency-finance/src/server/reports.ts, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/built-ins/modules/agency-finance/src/pages/PaymentsPage.tsx, src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx, src/built-ins/modules/agency-finance/src/pages/ReportsPage.tsx, src/lib/clients/clientPaymentPlans.ts, src/lib/clients/clientAquaHealth.ts, src/engines/data/server/radar/clientRadarService.ts, scripts/smoke-finance-refund-ledger.test.ts
**Why:** Immutable provider-identified negative allocations preserve gross receipts while cumulative Stripe events add only their missing delta. Partial/full status, net receivables, cash, tax and every Finance/client summary consume those rows; disputes stay separate. Manual refunds forward a stable request identity and persist provider success immediately.

Partial/multiple/full cumulative events, provider replay, interrupted post-row retry, independent-process refund/dispute races, fresh reload and mounted/UI contracts pass **4/4**. Complete Finance **265/265**, TypeScript and `git diff --check` pass. Live signed Stripe acceptance remains external; port 3032 and retained data were untouched.

### Make Finance settings effective and canonical
**Id:** effective-finance-settings · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/index.ts, src/built-ins/modules/agency-finance/src/pages/SettingsPage.tsx, src/built-ins/modules/agency-finance/src/pages/InvoicesPage.tsx, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/server/agencySettings.ts, src/app/api/portal/settings/route.ts, scripts/smoke-finance-settings-convergence.test.ts
**Why:** Workspace Settings is now canonical for bounded invoice terms/default tax and seller/tax identity. Duplicate/inert Finance declarations were removed, the create form and service consume the canonical defaults, and every new invoice snapshots seller identity so later settings changes cannot rewrite its HTML export.

Changing 10-day/old-tax settings to 45-day/new-tax affects only the next invoice/export in the dedicated **3/3** gate; current complete Finance **271/271**, plugin/settings outcomes **27/27**, TypeScript/diff pass. An isolated state/build/port was prepared without touching 3032, but the sandbox denied the listener with `EPERM`; complete the literal Settings → create → export browser walk before marking fully accepted.

### Converge client payment schedules and Finance Plans
**Id:** canonical-finance-commercial-plans · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/lib/clients/clientPaymentPlans.ts, src/app/api/tenants/client-payment-plans/route.ts, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/built-ins/modules/agency-finance/src/server/plans.ts, src/built-ins/modules/agency-finance/src/server/pnl.ts, src/built-ins/modules/agency-finance/src/components/NewPlanForm.tsx, src/built-ins/modules/agency-finance/src/components/CommercialPlansManager.tsx, src/built-ins/modules/agency-finance/src/pages/PlansPage.tsx, src/built-ins/modules/agency-finance/src/pages/PlanningPage.tsx, src/built-ins/modules/agency-finance/src/pages/LockInPage.tsx, src/lib/server/brandPortfolioService.ts, scripts/smoke-finance-commercial-plan-convergence.test.ts
**Why:** Client Payment Plans now hold canonical client terms; Finance Plans are editable multi-currency templates. Mounted controls create/edit templates and assign/move/cancel clients. Assignment snapshots terms, moves preserve old invoices, cancellation retries are fenced, and MRR/Planning/portfolio/Deposits read linked schedules with explicit deposit invoice identity. The duplicate route is retired.

Focused GBP→USD schedule, invoice/payment/deposit, MRR/ARR, move/cancel/retry/reload and mounted-source proof passes **3/3**; complete Finance **271/271**, TypeScript/diff pass. Read-only retained-state inspection found no existing Finance assignments requiring migration. The environment denied the isolated listener with `EPERM`; browser-prove create, assign, invoice/pay, move/cancel, MRR and deposit status after reload before marking fully accepted.

### Make recurring Finance expenses exactly once per occurrence
**Id:** idempotent-recurring-finance-expenses · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/expenses.ts, src/built-ins/modules/agency-finance/src/server/ports.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/components/ExpensesList.tsx, src/built-ins/runtime/_types.ts, src/built-ins/runtime/foundation-adapters/activityLogAdapter.ts, scripts/smoke-finance-recurring-occurrence.test.ts
**Why:** Mounted posting carries the due timestamp and direct calls infer it before mutation. A per-schedule cross-process transaction writes a marker, creates one deterministic child, persists the result before advancing once, records an idempotent audit and clears the marker. Pending work resumes first; retries adopt the result and the UI replaces replayed rows.

The dedicated proof faults all six persistence writes, fails both creation and recurring logs before and after their write, covers direct double calls plus the real handler/UI, and races independent file processes through two consecutive periods and reload. It retains one child/result per due timestamp, advances once per real period and rejects an unknown stale timestamp unchanged. Dedicated **15/15**, complete Finance **256/256**, TypeScript and `git diff --check` pass; port 3032 was untouched.

### Make Finance plan assignment recoverable and cross-process safe
**Id:** atomic-finance-plan-assignment · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/plans.ts, src/built-ins/modules/agency-finance/src/server/index.ts, src/built-ins/modules/agency-finance/src/api/handlers-r007.ts, src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts, scripts/smoke-finance-plan-assignment.test.ts
**Why:** assignClient() validates client and target before mutation. Agency assignments share one cross-process storage transaction; a versioned per-client marker is written first and replayed until old/new membership and reverse lookup agree. Recovery removes duplicate membership and mounted JSON requires exact assignment fields.

The dedicated test faults all marker/membership/pointer boundaries for assign, move and unassign, proves invalid records are no-write failures, and races competing targets, shared targets, move/unassign and stale targets through independent file-backed processes followed by fresh reload. Dedicated **18/18**, complete Finance **241/241** at shipment and **271/271** currently, TypeScript and `git diff --check` pass. Shared port 3032 and its retained data were untouched; #121 later converged the mounted model with browser acceptance pending.

### Validate the complete Finance domain at runtime
**Id:** validate-finance-domain-state · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/lib/runtimeValidation.ts, src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/server/expenses.ts, src/built-ins/modules/agency-finance/src/server/categories.ts, src/built-ins/modules/agency-finance/src/server/budgets.ts, src/built-ins/modules/agency-finance/src/server/plans.ts, src/built-ins/modules/agency-finance/src/server/income.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/agency-finance/src/server/operations.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/lib/domain.ts, src/lib/server/closeDeal.ts, scripts/smoke-finance-runtime-validation.test.ts
**Why:** Every Finance create/post-patch service validates exact fields, supported enums/currency, whole-cent money, bounded rates/quantities, timestamps and coherent business dates, nested invoice lines, attachment evidence and templates before persistence. Invalid handler/import-shaped values get field errors instead of being rounded, ignored or stored.

The dedicated matrix covers invoice/template, expense/category, budget, plan, obligation, compensation, payment and income services plus real mounted Invoice and Operations JSON handlers. Every rejected case compares the complete plugin Map before and after and remains byte-identical. Dedicated **115/115**, complete Finance **223/223** at shipment and **271/271** currently, TypeScript and `git diff --check` pass. Shared port 3032 was untouched; #117–#121 later closed the remaining source/behaviour work.

### Enforce one Finance payment-allocation contract
**Id:** finance-payment-allocation · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/lib/paymentAllocation.ts, src/built-ins/modules/agency-finance/src/server/payments.ts, src/built-ins/modules/agency-finance/src/api/handlers.ts, src/built-ins/modules/agency-finance/src/api/handlers-r007.ts, src/built-ins/modules/agency-finance/src/api/handlers-stripe.ts, src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx, src/lib/server/pluginStorage.ts, src/server/productWorkspaceCoordinator.ts, scripts/smoke-finance-payment-allocation.test.ts
**Why:** Sent/overdue and outstanding cents now come from one shared rule. Payment recording adopts retries first, then validates and persists under a refreshed per-invoice cross-process transaction; over-limit and non-collectible attempts cannot enter the ledger. Income filters/caps on the same outstanding calculation and Checkout requests only the remaining amount.

Separate file-backed processes prove competing £70/£70 allocations cannot exceed £100, valid £40/£60 partials both persist and settle, retries adopt after settlement, and draft/void/paid/status-only-refunded/over-limit attempts remain unchanged after reload. The capped ledger agrees with P&L and settled-invoice reporting. Dedicated **3/3**, complete Finance **108/108** at shipment, TypeScript/diff pass; shared port 3032 was untouched. Refund reversal rows were later resolved under issue #119; signed live Stripe acceptance remains external verification.

### Make Finance invoice identity atomic and retry-safe
**Id:** atomic-finance-invoice-identity · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-26 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/invoices.ts, src/built-ins/modules/agency-finance/src/server/ports.ts, src/built-ins/modules/agency-finance/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-finance/src/components/InvoicesList.tsx, src/built-ins/runtime/_types.ts, src/built-ins/runtime/_runtime.ts, src/lib/server/pluginStorage.ts, src/server/productWorkspaceCoordinator.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-invoice-identity.test.ts
**Why:** Invoice creation now holds one refreshed durable plugin-storage transaction while it adopts a deterministic intent id, reserves the agency/year sequence and persists the row/indexes. The mounted form retains one idempotency key for its lifetime, and optional issue follows the returned invoice id.

Independent file-backed processes prove distinct intents get distinct numbers and simultaneous same-key retries adopt one id/number; a fresh third process sees three intents, three unique numbers and sequence three. Dedicated **2/2**, widened Finance/product transaction **91/91**, TypeScript and diff pass. Optional issue failure recovery stays with issue #47, and shared port-3032 state was untouched.

### Make the freelancer workspace genuinely user-reachable
**Id:** make-freelancer-workspace-user-reachable · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/freelancerAdmin.ts, src/server/freelancerWorkspace.ts, src/server/staffProvisioning.ts, src/server/people.ts, src/server/types.ts, src/app/api/portal/freelancers/route.ts, src/app/api/portal/freelancer-access/route.ts, src/app/api/portal/freelancer/message/route.ts, src/app/api/portal/freelancer/work/route.ts, src/app/api/portal/freelancer/work/content/route.ts, src/app/api/portal/freelancer/submit/route.ts, src/app/portal/agency/freelancers, src/app/portal/agency/freelancer-access, src/app/portal/freelancer, scripts/smoke-freelancer-real-journey.test.ts
**Why:** Freelancer creation now converges one provider identity, local freelancer account and People record through the resumable operation, then sends a password-setup invitation or returns the authorised operator a fallback setup link. The effective per-job policy now drives real shared deliverables, private work upload/download, owner Team Chat and submit behavior.

Shipped with a mounted in-process journey **3/3**, including legacy-local adoption/replay, surrounding freelancer/People/upload/redirect/provisioning coverage **105/105** and clean TypeScript. An earlier isolated build was environment-killed during webpack compilation without a code diagnostic; the later final primary build generated **245/245** pages. Complete real Supabase/email/password-reset login and cross-process/browser reload acceptance without mutating shared state.

### Make staff identity provisioning resumable
**Id:** recoverable-staff-account-provisioning · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/staffProvisioning.ts, src/lib/supabase/admin.ts, src/app/api/portal/people/route.ts, src/app/api/portal/agency/users/route.ts, src/server/users.ts, src/server/people.ts, src/server/storage.ts, scripts/smoke-staff-provisioning-recovery.test.ts
**Why:** Agency Users, candidate hire and employee activation now share one durable password-free agency/email operation. It preallocates stable local ids before Supabase, separately checkpoints provider, local-user, People-link and completion state, adopts only an exact operation-marked provider identity and exposes retryable stage-specific partial outcomes.

Same-process and fresh-runtime failures converge on one provider identity, one local user and one target. Dedicated 14/14, wider 109/109 and final TypeScript pass. The isolated build reached 272/272 before the final retry-error wrapper and two immediate rebuild attempts were environment-killed; the later final primary build generated **245/245** pages with the wrapper present. Complete real-Supabase staging and mounted form failure → same-input retry → reload acceptance. Legacy provider identities lacking the operation marker require explicit operator reconciliation rather than unsafe automatic adoption.

### Make staff compensation one authoritative contract
**Id:** canonical-staff-compensation · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/agency-finance/src/server/operations.ts, src/built-ins/modules/agency-finance/src/server/ports.ts, src/built-ins/runtime/foundation-adapters/agencyFinanceCompensation.ts, src/built-ins/modules/agency-finance/src/components/CanonicalCompensationModals.tsx, src/built-ins/modules/agency-finance/src/lib/workforceCosts.ts, scripts/smoke-finance-people-compensation-convergence.test.ts
**Why:** People now owns every linked employee's identity, pay basis, base amount, currency, dates/hours and commission plan. Finance projects those values on read while retaining budget, employer overhead, payment cadence/date, company scope, notes, status and payment evidence. Independent suppliers stay Finance-owned.

Predictable fixed commission feeds the scheduled Finance target; variable/per-event commission remains separately evidenced. Duplicate/missing links fail closed and the mounted forms/payment drafts expose the boundary honestly. Current retained state has no compensation index requiring migration. Convergence 3/3, focused 32/32, wider 158/158, standalone Finance 23/23, TypeScript and isolated build 272/272 pass. Complete the mounted two-tab People edit → Finance refresh/payment save → reload walk. Cross-process People uniqueness remains governed by the separate People-domain follow-up.

### Converge People and Agency HR workforce records
**Id:** converge-people-agency-hr · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/people.ts, src/built-ins/modules/agency-hr, src/built-ins/runtime/foundation-adapters/agencyHrWorkforce.ts, src/lib/server/finance/financeWorkforce.ts, scripts/smoke-agency-hr-people-convergence.test.ts
**Why:** The real Agency HR foundation now delegates mounted employee and leave operations to canonical People records, keeping HR-only metadata as a sidecar on the People id. Finance consumes People employees only, and leave approval changes the canonical decision and status together.

Current retained state has no legacy HR staff/leave index requiring migration. Convergence 3/3, wider 97/97, standalone HR 6/6, TypeScript and isolated build 272/272 pass. Complete the mounted browser create/edit/approve/reload walk. An imported backup containing unmatched legacy HR identity rows requires explicit offline migration; those rows never surface as a second live workforce truth.

### Validate the complete People domain at runtime
**Id:** validate-people-domain-state · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/portal/people/route.ts, src/server/people.ts, scripts/smoke-people-domain-validity.test.ts, scripts/smoke-people-workspace.test.ts
**Why:** People now validates complete create/post-patch records, supported workforce/pay/leave/shift/training values, bounded numbers, coherent dates and nested commission/onboarding data before mutation. Canonical email has one non-alumni owner; invalid writes preserve state and partial patches preserve omitted fields. Focused 26/26, Agency HR 6/6, TypeScript and isolated build 272/272 pass.

Complete mounted form/conflict/reload acceptance and add database-native uniqueness before claiming cross-instance employee-identity safety. Agency HR ownership is now converged by `converge-people-agency-hr`.

### Show the canonical customer relationship status
**Id:** truthful-customer-relationship-status · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/customer/_CustomerPortalViews.tsx, src/app/portal/customer/_CustomerRelationshipStatus.tsx, src/server/clientRelationships.ts, scripts/smoke-customer-relationship-status.test.ts
**Why:** Billing now maps active, suspended and archived client state to explicit provider-labelled copy and a Support action. Existing payment behavior is unchanged; fresh-state proof retains active+suspended access and excludes archived. Focused 3/3, wider 43/43, TypeScript and build 272/272 pass.

Complete mounted switching, direct-entry and reload acceptance when a suspended local fixture exists. No shared port-3032 state was mutated to manufacture one.

### Restore the nested Website Editor verification gate
**Id:** runnable-website-editor-nested-smoke · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** package.json, scripts/run-website-editor-smoke.mjs, scripts/smoke-website-editor-runner.test.ts, src/built-ins/modules/website-editor/package.json, src/built-ins/modules/website-editor/src/__smoke__
**Why:** One discovery runner now owns module and root execution, pins portal path aliases, normalises the React condition, runs every discovered file and reports aggregate failures. Real fail-through proof is 2/2; the actual suite reaches 1,527 assertions in 49/49 files; TypeScript and isolated build 272/272 pass.

Keep mounted editor behavior in the browser-verification sweep. At this shipment checkpoint the full root suite retained unrelated concurrent failures; the later final canonical run supersedes that old repository-wide state with **6,417 tests / 1,093 suites: 6,415 passed / 0 failed / 2 skipped**, followed by Website Editor **49/49 files in 11.8s**.

### Make payment-plan invoice creation retry-safe
**Id:** idempotent-payment-plan-invoice-create · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/api/tenants/client-payment-plans/route.ts, src/lib/clients/clientPaymentPlans.ts, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/lib/server/clients/clientRecordLedger.ts, src/server/productWorkspaceCoordinator.ts, scripts/smoke-payment-plan-invoice-recovery.test.ts
**Why:** A private milestone operation now persists before Finance and deterministically selects one invoice. Finance state, milestone linking and idempotent ledger/activity projections flush as separate recovery stages. Stale and fresh-process retries adopt the first invoice. Focused 4/4, wider 119/119, TypeScript and build 272/272 pass.

Keep mounted failure/retry acceptance in the verification sweep. Implementation and process tests did not mutate shared state. The later 3/4 regression was traced to a non-reentrant nested file transaction and fixed: fresh-process adoption is restored to **4/4**, widened Finance/client/product-workspace proof is **65/65**, and the cross-process/re-entrancy lock gate is **8/8**.

### Make Advanced Fulfilment tasks shared
**Id:** truthful-client-fulfilment-kanban · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/app/portal/clients/[clientId]/_KanbanTabClient.tsx, src/app/portal/clients/[clientId]/page.tsx, src/app/api/tenants/client-tasks/route.ts, src/lib/tasks/clientTaskBoard.ts, src/server/tasks.ts, src/server/productWorkspaceCoordinator.ts, src/server/types.ts, scripts/smoke-client-fulfilment-board.test.ts
**Why:** The client board now uses canonical AgencyTask records inside the durable per-client ledger transaction. Column/status mapping keeps Actions coherent; revisions reject stale move/delete, task activity stays canonical and the former browser store imports once before removal. Focused 3/3, wider 136/136, TypeScript and build 272/272 pass.

Complete mounted two-session, refresh and browser-storage-loss acceptance. No shared port-3032 state was changed during implementation verification.

### Preserve currency in client payment positions
**Id:** currency-safe-client-payment-position · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/clients/clientPaymentPlans.ts, src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx, src/app/portal/clients/[clientId]/page.tsx, src/app/portal/clients/[clientId]/_ClientSpineOverview.tsx, src/engines/data/radar/clientRadar.ts, src/built-ins/modules/agency-finance/src/pages/FounderDashboardPage.tsx, src/app/portal/customer/_CustomerPortalViews.tsx, src/app/portal/customer/_PortalPageComposition.tsx, scripts/smoke-client-payment-plans.test.ts
**Why:** Payment plans and customer invoices now retain separate currency positions instead of adding minor units under the first record's code. One shared invoice rule counts only issued sent/overdue rows as outstanding, so refunds, voids, drafts and cancelled records cannot look collectible.

Agency Payment Plans, client overview/Radar, Finance founder, built-in Customer Billing and
configurable metrics consume the grouped contract. Direct GBP/USD and status-matrix proof plus
dependent source suites pass **62/62**; TypeScript/diff and isolated production build
**271/271** pass. Mounted mixed-currency/refund browser acceptance remains a follow-up and
shared port-3032 state was untouched.

### Make client product-workspace writes versioned and recoverable
**Id:** versioned-client-product-workspaces · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/portal/portalProductWorkspaces.ts, src/server/productWorkspaces.ts, src/server/productWorkspaceCoordinator.ts, src/server/productStageTransitions.ts, src/app/api/portal/pipelines/move-client/route.ts, src/app/api/tenants/client-product-process/route.ts, src/app/api/tenants/product-workspaces/route.ts, src/app/api/tenants/client-requests/route.ts, src/app/api/tenants/client-approvals/route.ts, src/app/api/tenants/client-payment-plans/route.ts, src/app/api/tenants/client-record/route.ts, src/lib/clients/clientPaymentPlans.ts, scripts/smoke-product-stage-convergence.test.ts, scripts/smoke-product-workspace-concurrency.test.ts, scripts/schema.sql, ../supabase/migrations/20260825130000_product_workspace_leases.sql
**Why:** Monotonic revisions and current-state conflicts replace acknowledged stale overwrites. One client mutation converges workspace/process/stage/file projections, and a durable filesystem/database lease serialises server processes after reloading current state.

Agency board, client process and portal workspace writers now retain the same revision. Real
handlers pass **8/8** and independent stale file-backend workers pass **4/4** across edit,
stage, file/retry and sibling-ledger collisions. Request, approval, payment-plan and record
ledgers merge under the same fresh-state transaction; payment plans also reject stale per-plan
edits. The wider focused gate passes **77/77**, TypeScript/diff and build **271/271** pass.
Deploy/run the checked-in database migration before live DB acceptance; mounted browser
acceptance remains and shared port-3032 state was untouched.

### Unify Fulfilment product-stage truth
**Id:** canonical-product-stage-transition · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/products/clientProductStageTruth.ts, src/server/productStageTransitions.ts, src/server/productWorkspaces.ts, src/app/api/portal/pipelines/move-client/route.ts, src/app/api/tenants/client-product-process/route.ts, src/app/api/tenants/product-workspaces/route.ts, src/app/portal/agency/pipelines/[slug]/page.tsx, src/app/portal/agency/fulfilment/page.tsx, src/app/portal/customer/_portalData.ts, scripts/smoke-product-stage-convergence.test.ts
**Why:** The process stage is now canonical, with legacy board and portal fields only as migration fallbacks. One synchronous transition converges every projection, preserves checklist work, dedupes activity and advances aggregate account/portal lifecycle only when all assigned products catch up.

The real agency board, client process and portal workspace handlers pass focused **5/5**;
the wider fulfilment/client/customer gate passes **114/114**, with TypeScript/diff and build
**271/271** green. Port 3032 was down and isolated listeners were denied with `EPERM`, so
mounted browser acceptance remains operational follow-up and shared CRM state was untouched.

### Make lead-to-client conversion single-owner and idempotent
**Id:** idempotent-single-owner-lead-conversion · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/built-ins/modules/leads-pipeline/src/api/handlers.ts, src/server/leadConversionCoordinator.ts, src/server/storage.ts, src/server/storagePostgres.ts, src/server/storageSupabase.ts, scripts/schema.sql, ../supabase/migrations/20260825120000_lead_conversion_operations.sql, scripts/smoke-lead-conversion-idempotency.test.ts
**Why:** A durable canonical-identity claim elects one conversion owner, replays its saved result and resumes failed work. Stable Finance intents adopt partial invoices/payments while client, contact, portal and lead-card effects converge instead of creating two clients.

Real handler races return one 201 and one 200 replay with one client, contact and portal. A
crash-style Finance probe adopts one invoice/payment; independent file workers elect one
owner. Focused **6/6**, wider **87 pass / 0 fail / 2 expected DB skips**, TypeScript/diff and
build **271/271** pass. Deploy/run the checked-in database migration separately; mounted
browser acceptance remains and shared port-3032 state was untouched.

### Validate Actions task state at runtime
**Id:** validated-actions-task-state · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/tasks.ts, src/app/api/portal/tasks/route.ts, src/app/portal/agency/actions/_ActionsWorkspace.tsx, scripts/smoke-actions-task-validity.test.ts, scripts/smoke-agency-task-assignment.test.ts, scripts/smoke-action-sources.test.ts, scripts/smoke-command-calendar.test.ts, scripts/smoke-google-command-calendar.test.ts
**Why:** One shared service now rejects invalid task enums, titles, timestamps and chronology before route, import, automation, template or assistant mutation. PATCH validates the complete candidate instead of spreading JSON; field-specific errors reach the UI; undefined staff keys preserve dates and zero deliberately clears a reminder.

Focused 7/7, wider Actions/task/Aqua+Google Calendar 136/136 and isolated build 271/271 pass. Keep every new task writer on the shared service. The source-backed UI error/Calendar contract is proven; mounted browser acceptance remains part of the general verification sweep rather than an open task-validity defect.

### Make multipart Meta replies resumable by part
**Id:** resumable-multipart-meta-replies · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/inbox/replyDelivery.ts, src/lib/server/inbox/inboxService.ts, src/lib/server/inbox/inboxStore.ts, src/app/api/portal/inbox/messages/route.ts, src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx, ../supabase/migrations/20260825110000_resumable_meta_reply_parts.sql, scripts/smoke-meta-reply-parts.test.ts
**Why:** One deterministic reply retains status, lease and provider id for text and every attachment. Retry skips sent parts, contenders are fenced and expired ambiguous work becomes review-required instead of resent. History exposes partial truth and “Retry remaining.” Focused 4/4, wider 54/54 and isolated build 271/271 pass.

The fake-provider failure/reconnect path now makes three calls with text delivered once; completed replay makes none and changed payload reuse is refused. Deploy/execute the service-role claim/settle migration before live database acceptance. An `uncertain` result intentionally requires provider review because no local system can safely infer whether Meta accepted a response lost during worker death.

### Make Meta conversation summaries atomic and order-independent
**Id:** atomic-monotonic-meta-conversations · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/inbox/inboxService.ts, src/lib/server/inbox/inboxStore.ts, ../supabase/migrations/20260825100000_atomic_meta_conversation_ingestion.sql, scripts/smoke-meta-conversation-atomicity.test.ts
**Why:** One idempotent provider-message append now advances the conversation atomically. Unread increments only for new inbound rows, timestamps are derived by min/max, delayed events cannot regress referral facts and duplicate ids stop before side effects. Focused 7/7, wider 80/80 and build 271/271 pass.

Local behavior includes a true two-process race. Deploy and execute the service-role RPC migration before claiming live database acceptance; multipart outbound delivery is resolved separately by #98.

### Make local Master Inbox persistence recovery-safe
**Id:** durable-local-master-inbox-store · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/inbox/inboxStore.ts, src/lib/server/dev/devFileTransaction.ts, scripts/smoke-local-inbox-persistence.test.ts, scripts/smoke-meta-master-inbox.test.ts, scripts/smoke-unified-master-inbox.test.ts
**Why:** Corrupt syntax/shapes now fail recovery-required without changing the source. Every mutation runs under a cross-process lock and commits via 0600 temp, file fsync, atomic rename and directory fsync; dead workers/temps recover. Write/rename/SIGKILL faults, 12 concurrent writers and competing claimers pass 6/6; wider Inbox 62/62 and build 271/271 pass.

Keep every new local Inbox mutator inside the shared transaction boundary. All destructive acceptance ran against isolated temporary files; the shared port-3032 Inbox was deliberately untouched.

### Make Meta webhook claims crash-recoverable
**Id:** leased-meta-webhook-processing · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/inbox/inboxStore.ts, src/lib/server/inbox/inboxService.ts, ../supabase/migrations/20260811113000_master_inbox_messaging.sql, ../supabase/migrations/20260825090000_meta_webhook_claim_leases.sql, scripts/smoke-meta-master-inbox.test.ts, scripts/smoke-meta-webhook-leases.test.ts
**Why:** Queue ownership is now a bounded lease in local and Supabase contracts. Expired and legacy-unleased processing rows are atomically reclaimable, stale owners cannot settle replacement work, and an expired final attempt is terminal rather than stranded. Separate Node processes prove claim/crash/reclaim/complete against one persisted file; focused 11/11, wider 60/60 and build 271/271 pass.

Deploy the checked-in upgrade migration before relying on this contract in an existing Supabase environment. That live-database acceptance was not run here. Conversation ordering and multipart delivery are closed by #97/#98; queue ownership remains a separate lease boundary.

### Enforce one owner for every Contact identity
**Id:** unique-contact-identity-ownership · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/persons.ts, src/server/types.ts, src/app/api/portal/persons/[personId]/route.ts, src/app/portal/agency/contacts/[personId]/_ContactCard.tsx, scripts/smoke-contact-identity-ownership.test.ts, scripts/smoke-person-editing.test.ts, scripts/smoke-person-identity-dedupe.test.ts
**Why:** Add/Edit now share one canonical agency-wide conflict path and 409 owner link; rejected drafts remain. Split sync cannot partially move identity, shared switchboards are explicitly non-identifying, repeated named sync is stable and ambiguous legacy values are not guessed. Focused 31/31, widened 114/114, production build 271/271 and isolated mounted email/phone/reload proof pass.

Shared-state inspection was read-only: it found zero duplicate emails and two legacy repeated-phone groups (4 and 5 cards) needing human review. Do not bulk-merge those rows; preserve the conflict/refusal path and review ownership deliberately. Database-native uniqueness between unrelated blob-storage processes remains a broader storage-coordination boundary, not permission to reintroduce silent Contact duplication.

### Make Google Calendar event creation idempotent
**Id:** idempotent-google-calendar-event-create · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/server/integrations/googleCalendar.ts, src/app/api/portal/calendar/google/events/route.ts, src/app/portal/agency/actions/_ActionsWorkspace.tsx, src/server/types.ts, src/server/storage.ts, src/server/companyPortal/disposition.ts, scripts/smoke-google-command-calendar.test.ts, scripts/smoke-command-calendar.test.ts
**Why:** One payload-stable client operation is persisted before POST and maps to a Google-compatible provider id. Remote success is adopted before best-effort refresh; 409/read-back, persistence faults and discarded local state retain one remote event. Focused 7/7, surrounding 87/87 and build 271/271 pass.

The route now distinguishes created, reconciled and replayed outcomes plus fresh/stale refresh. Preserve operation/id derivation and immediate adoption. Live-provider acceptance remains operational because the fault matrix intentionally used an isolated fake Google endpoint and changed no live account.

### Make Agency Settings role surfaces coherent
**Id:** role-coherent-agency-settings · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/agencySettingsCapabilities.ts, src/app/portal/agency/settings/page.tsx, src/app/portal/agency/settings/SettingsTabs.tsx, src/app/portal/agency/settings/TeamUsersPanel.tsx, src/app/portal/account/page.tsx, src/app/portal/account/permissions/page.tsx, src/app/api/portal/agency/users/route.ts, src/app/api/portal/settings/activity-log/route.ts, src/app/api/portal/settings/external-ai/route.ts, scripts/smoke-agency-settings-roles.test.ts
**Why:** One owner/manager capability map now aligns Team, Activity Log and External AI UI with their APIs. Middleware keeps staff in Team, defensive branches expose no refused actions, and staff Account/Permissions avoid blocked Settings links. Focused 5/5, surrounding 68/68, build 271/271 and isolated role browser proof pass.

Keep new Settings controls and APIs on the shared map. The broader client/freelancer/404 role-navigation work remains separately tracked in issue #133.

### Make Agency Settings effective and semantically truthful
**Id:** truthful-effective-agency-settings · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/agencySettings.ts, src/app/portal/agency/settings/SettingsTabs.tsx, src/lib/server/inbox/operationalAlerts.ts, src/lib/server/email/transactionalEmail.ts, src/built-ins/modules/agency-finance/src/server/invoices.ts, scripts/smoke-agency-settings-outcomes.test.ts, scripts/smoke-transactional-email.test.ts
**Why:** Saved portal follow-up timing and Business identity now affect real alert, invoice and email outcomes; confirmation-code TTL remains separately labelled, while digest and timezone scheduling are explicitly pending. Focused 3/3 and surrounding 143/143 pass with read-only port-3032 Account, Defaults and Notifications proof.

Keep digest and timezone wording storage-only until a real scheduler consumes them. Preserve invoice-template and sender-connection precedence when extending Business identity consumers.

### Make Portal Editor schemas authoritative on every real form
**Id:** authoritative-portal-form-schemas · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/lib/forms/portalFormValues.ts, src/components/forms/PortalCustomFields.tsx, src/server/portalEditor.ts, src/server/tenants.ts, src/server/tasks.ts, src/server/agencyProducts.ts, src/built-ins/modules/agency-finance/src/server/expenses.ts, src/built-ins/modules/leads-pipeline/src/api/handlers.ts, scripts/smoke-portal-form-authority.test.ts
**Why:** All six forms have mounted consumers and guarded operator/API writes. Contacts delegates to the shared Leads Pipeline schema and the generic editor refuses a split Contacts document; the other five use Portal Editor state. Nine types, required/options/active rules, deletion/reload and retention pass 8/8 focused and 118/118 surrounding checks plus read-only port-3032 proof.

Preserve the explicit distinction between person-submitted form requirements and system/background records that cannot fabricate required answers. Route every new form, import and operator mutation through the same schema validator.

### Make managed integration activation deterministic and scope-correct
**Id:** deterministic-scoped-integration-activation · **Status:** shipped · **Size:** M · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** src/server/types.ts, src/lib/integrations/types.ts, src/lib/integrations/catalog.ts, src/lib/server/integrations/integrationConnections.ts, src/lib/server/plugins/pluginSettingsSurface.ts, src/lib/server/email/outboundCommunications.ts, src/lib/server/email/transactionalEmail.ts, src/app/portal/agency/settings/IntegrationConnectionsPanel.tsx, src/app/portal/agency/inbox/_EnquiryCommunications.tsx, src/app/api/portal/settings/integrations/route.ts, src/app/api/portal/website-enquiries/communications/route.ts, src/app/api/portal/website-enquiries/calls/route.ts, scripts/smoke-integration-connections.test.ts, scripts/smoke-company-connections.test.ts, scripts/smoke-master-inbox-replies.test.ts
**Why:** Active credentials are now selected explicitly by provider and exact scope instead of save/test recency. Generic saves are inactive, tests do not reorder, failed active tests deactivate, and deliberate activation requires a pass. Client-aware consumers validate their target and use exact-client then workspace fallback; unsupported generic scopes are refused.

Shipped with a **160/160** provider/consumer gate, clean TypeScript and mounted port-3032 proof of one active legacy default plus explicit inactive alternatives. The compatibility rule preserves the former newest tested legacy default only until an explicit active flag is written.

### Make Aqua Tag tool pause delivery truthful
**Id:** truthful-aqua-tag-tool-pause · **Status:** shipped · **Size:** S · **Added:** 2026-08-24 · **Source:** ultra-review
**Files:** src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/api/public/aqua-tag-config/route.ts, src/lib/integrations/aquaTagSource.ts, src/server/websiteInjections.ts, scripts/smoke-aqua-tag-consent-injection.test.ts, scripts/smoke-aqua-tag-injections.test.ts
**Why:** Shipped as an explicit future-page-load contract. Public config is no-store, fresh documents receive current enabled tools, the workspace states that already-open provider code may continue until refresh, and the behavioral/API/UI gate passes 33/33 with live 3032 headers and copy verified.

Do not claim immediate remote teardown unless provider-specific unload support is later implemented and separately proven.

### Connect Health Check, Public Funnel and Business OS
**Id:** connect-health-check-public-funnel-bos · **Status:** shipped · **Size:** L · **Added:** 2026-08-24 · **Shipped:** 2026-08-25 · **Source:** ultra-review
**Files:** public/health-check/index.html, public/business-os/bos.js, public/business-os/auth-sync.js, src/app/api/public/health-check/complete/route.ts, src/app/api/public/business-os/context/route.ts, src/built-ins/runtime/foundation-adapters/publicFunnelFoundation.ts, src/built-ins/runtime/foundation-adapters/leadFunnelPorts.ts, scripts/smoke-health-check-funnel-journey.test.ts
**Why:** The 2026-08-25 identity/cookie behaviour is superseded by the 2026-09-12 ABUSE-002 boundary. Anonymous Health Check completion now persists only one pending Public Funnel capture, emits non-PII summaries and creates no User, session or CRM derivatives. A server-only idempotent promotion command exists for exact mailbox proof or explicit authenticated promotion, but there is no public proof endpoint yet.

The historical route remains shipped, but anonymous completion no longer authenticates or restores CRM context into BOS. The public BOS remains intentionally usable without authentication. Promotion must stay dormant until a verified or authenticated caller is mounted and independently accepted.

### Published sites can submit Login / Signup native forms
**Id:** published-site-auth · **Status:** shipped · **Size:** S · **Added:** 2026-08-20 · **Shipped:** 2026-08-23 · **Source:** worker:money
**Why:** Native published-site forms must not strand a visitor on a raw JSON response.

Both auth routes now accept native form posts as well as JSON and return browser
submissions with a 303 redirect. The signup form's native branch creates a website
lead and never reads a password or bootstraps an agency; the separate JSON branch
retains the backend agency-bootstrap contract. The standalone portal intentionally
has no `/signup` page. End-customer self-signup is a different, client-scoped embed
surface. The focused source/behaviour set is **35/35**. A live published-site and
enabled-embed browser walk remains part of `verify-sweep`; it is acceptance residue,
not an open transport implementation.

### The Dev Console — see and steer the build from inside the app
**Id:** dev-console · **Status:** shipped · **Size:** L · **Owner:** console · **Added:** 2026-08-20 · **Shipped:** 2026-08-20 · **Source:** ed
**Plans:** dev-console-topbar, dev-team-portal, dev-team-finish
**Files:** docs/development/plans/dev-console-topbar.md, docs/development/plans/dev-team-finish.md, docs/development/plans/dev-team-portal.md, scripts/smoke-dev-console-topbar.test.ts, scripts/smoke-dev-roadmap.test.ts, scripts/smoke-dev-team-portal.test.ts, scripts/smoke-universal-search.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/portal/dev-team/, src/app/api/portal/dev-team/console/route.ts, src/app/api/portal/dev-team/findings/route.ts, src/app/portal/agency/_DashboardCommandCenter.tsx, src/app/portal/agency/_DevTeamStation.tsx, src/app/portal/agency/layout.tsx, src/app/portal/agency/page.tsx, src/app/portal/clients/[clientId]/layout.tsx, src/app/portal/clients/page.tsx, src/app/portal/dev-team/, src/app/portal/dev-team/_ui.tsx, src/app/portal/dev-team/auditor/_Section.tsx, src/app/portal/dev-team/auditor/page.tsx, src/app/portal/dev-team/layout.tsx, src/app/portal/dev-team/page.tsx, src/app/portal/dev-team/working/_Board.tsx, src/app/portal/dev-team/working/page.tsx, src/app/portal/layout.tsx, src/components/chrome/DevConsoleButton.tsx, src/components/chrome/DevConsoleControl.tsx, src/components/chrome/DevConsolePanel.tsx, src/components/chrome/DevModeLoadIn.tsx, src/components/chrome/Topbar.tsx, src/lib/chrome/devModeLoadIn.ts, src/lib/chrome/sidebarLayout.ts, src/lib/server/dev/devConsoleStatus.ts, src/lib/server/dev/devDocs.ts, src/lib/server/dev/devModeAccess.ts, src/lib/server/dev/devTeamAuditor.ts, src/lib/server/dev/devTeamBoard.ts, src/lib/server/dev/devTeamFindings.ts, src/lib/server/dev/devTeamPlans.ts, src/lib/server/dev/devTeamRoadmap.ts, src/lib/server/dev/devTeamTasks.ts, src/lib/server/dev/devTeamThoughts.ts, src/lib/server/dev/devTeamUpdates.ts, src/lib/server/dev/devTeamWorkers.ts, src/server/storage.ts, src/server/types.ts
**Why:** So the build can be watched, recorded and steered from inside AquaCRM instead of chasing separate chats.

Shipped so far: the workspace and its sidebar, findings capture with file upload, plans authored in-app, a live board, logs, Inspector, doc editing with attribution, colour-with-meaning, dark mode, tasks and the thought channel. In flight: the topbar mini-console and the Command Centre station.

### Historical launch-safety trio — the three 2026-08-20 blocker fixes
**Id:** launch-safe · **Status:** shipped · **Size:** M · **Owner:** erasure, money, freelancer · **Added:** 2026-08-20 · **Shipped:** 2026-08-20 · **Source:** auditor
**Plans:** plugin-data-erasure, finance-command-surface, freelancer-workspace
**Files:** docs/compliance/erasure-dpo-pack.md, docs/development/finance-command-surface-HANDOFF.md, docs/development/plans/finance-command-surface.md, docs/development/plans/freelancer-workspace-HANDOFF.md, docs/development/plans/freelancer-workspace.md, docs/development/plans/plugin-data-erasure.md, scripts/smoke-client-erasure.test.ts, scripts/smoke-close-deal-route.test.ts, scripts/smoke-dev-mode.test.ts, scripts/smoke-finance-aging.test.ts, scripts/smoke-finance-budget-control.test.ts, scripts/smoke-finance-channels.test.ts, scripts/smoke-finance-close-deal.test.ts, scripts/smoke-finance-delight-expense.test.ts, scripts/smoke-finance-idempotency.test.ts, scripts/smoke-finance-operations.test.ts, scripts/smoke-finance-stripe.test.ts, scripts/smoke-people-workspace.test.ts, scripts/smoke-post-login-redirect.test.ts, src/app/api/auth/dev-mode/route.ts, src/app/api/auth/preview-as-freelancer/route.ts, src/app/api/portal/clients/[clientId]/erase/route.ts, src/app/api/portal/freelancer-access/route.ts, src/app/api/portal/freelancer/submit/route.ts, src/app/api/portal/freelancers/route.ts, src/app/api/portal/website-enquiries/erase/route.ts, src/app/api/tenants/close-deal/route.ts, src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx, src/app/portal/agency/freelancer-access/page.tsx, src/app/portal/agency/freelancers/_FreelancerManager.tsx, src/app/portal/agency/freelancers/page.tsx, src/app/portal/clients/[clientId]/_FinanceTabClient.tsx, src/app/portal/freelancer/_ExitPreview.tsx, src/app/portal/freelancer/_FreelancerJobActions.tsx, src/app/portal/freelancer/layout.tsx, src/app/portal/freelancer/page.tsx, src/app/portal/page.tsx, src/built-ins/modules/affiliates/index.ts, src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-finance/, src/built-ins/modules/agency-marketing/index.ts, src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes.ts, src/built-ins/modules/agency-marketing/src/server/leads.ts, src/built-ins/modules/ecommerce/index.ts, src/built-ins/modules/ecommerce/src/lib/aquaPluginTypes.ts, src/built-ins/modules/email-sender/index.ts, src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts, src/built-ins/modules/email-sender/src/server/emails.ts, src/built-ins/modules/email-sender/src/server/webhook.ts, src/built-ins/modules/leads-pipeline/index.ts, src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts, src/built-ins/modules/leads-pipeline/src/server/campaigns.ts, src/built-ins/modules/leads-pipeline/src/server/commercial.ts, src/built-ins/modules/leads-pipeline/src/server/contacts.ts, src/built-ins/modules/leads-pipeline/src/server/leads.ts, src/built-ins/modules/memberships/index.ts, src/built-ins/modules/public-funnel/index.ts, src/built-ins/modules/public-funnel/src/lib/aquaPluginTypes.ts, src/built-ins/modules/public-funnel/src/server/services.ts, src/built-ins/runtime/_types.ts
**Why:** This shipped outcome records three specific 2026-08-20 fixes; it is not a current “launch safe” verdict. New P0/P1 findings #22–#24 supersede that broader interpretation.

The three historical fixes were:
1. Freelancer preview privilege escalation — a manager can enter preview and exit holding an owner session.
2. Erasure email-in-LOG — a contact's email survives in the activity log after a client erase.
3. Finance create-surface idempotency — a double-submit double-counts money-in.

Each needs a re-audit after the fix; the auditor no longer fires on its own.

### The engine — every built-in module
**Id:** engine-batch · **Status:** shipped · **Size:** XL · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** commander
**Why:** Journey, Fulfilment, Finance, Command Centre, Master Inbox and the client portals — the operating system itself.

The whole completion batch was built and independently auditor-verified. What remained after it were the three narrow blocker fixes.

### Aqua Tag — one consent-gated tag manager
**Id:** aqua-tag · **Status:** shipped · **Size:** L · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Plans:** aqua-tag-system, aqua-tag-handoff
**Files:** docs/development/plans/aqua-tag-handoff.md, docs/development/plans/aqua-tag-system.md, docs/workspace/aqua-tag.md, scripts/smoke-aqua-tag-injections.test.ts, scripts/smoke-radar-classification.test.ts, scripts/smoke-radar-golden-sweep.test.ts, scripts/smoke-website-sources.test.ts, src/app/api/portal/aqua-tags/detect/route.ts, src/app/api/portal/website-enquiries/form-template/route.ts, src/app/api/portal/website-injections/route.ts, src/app/api/portal/website-sources/route.ts, src/app/api/public/aqua-tag-config/route.ts, src/app/api/public/brand-enquiry/route.ts, src/app/api/public/form-capture/route.ts, src/app/aqua-tag.js/route.ts, src/app/portal/agency/company/_TradingCompaniesPanel.tsx, src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx, src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx, src/app/portal/agency/fulfilment/page.tsx, src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx, src/lib/integrations/aquaTagSource.ts, src/engines/data/radar/radarRuleCatalog.ts, src/lib/server/integrations/aquaTagDetection.ts, src/engines/data/server/radar/radarObservations.ts, src/lib/server/safeSiteFetch.ts, src/server/types.ts, src/server/websiteFormSchemas.ts, src/server/websiteInjections.ts, src/server/websiteSources.ts
**Why:** GA, PostHog and the rest through one consent-gated tag, instead of a script per client.

### Parallel workers can verify their own work
**Id:** worker-sandboxes · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Workers were told not to browser-verify because a second dev server silently clobbered the first — so nothing was ever proven in a browser.

`storage.ts` hardcoded one state file. `PORTAL_DATA_FILE` + `NEXT_DIST_DIR` + `npm run sandbox:fork -- <name> <port>` give every worker its own state file, build dir and port. Proven: a worker server wrote only its own sandbox while the shared one stayed byte-identical.

### Historical first performance pass
**Id:** performance-pass · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Too much was launching at once and every screen took an age to render.

Eight fixes. The root causes were redundant server work and eager bundling, not hydration: request-dedup with `React cache()` on alerts, company health and enquiries (each was recomputing 2–4× per render, every one a live round-trip), streaming with Suspense, code-split command-centre stations, lazy Advisor drawer, lazy react-markdown, `optimizePackageImports`, dynamic React Flow.

This remains a truthful record of the first pass, **not a current performance claim**. The
2026-08-26 active runtime regressed to multi-second cold and warm paths, so the Now outcome
`mission-critical-app-speed` supersedes it and must be closed only from fresh measurements.

### API keys and the MCP surface
**Id:** api-mcp · **Status:** shipped · **Size:** M · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** ed
**Why:** Point an external AI at a configured worker and it knows what to do.

`aqa_` bearer keys (hashed at rest), seven permission-gated MCP tools, an encrypted credentials vault, and the Master Tag panel. Browser-verified on an isolated sandbox — create, reveal, rotate and revoke all work.

### Website block registry, code-split
**Id:** block-registry-split · **Status:** shipped · **Size:** S · **Added:** 2026-08-20 · **Shipped:** 2026-08-19 · **Source:** commander
**Why:** Every page paid for every block type.

347KB → 59KB, both routes browser-verified.

### Preserve immutable published Performance reports
**Id:** immutable-performance-report-history · **Status:** shipped · **Size:** M · **Added:** 2026-08-25 · **Shipped:** 2026-09-02 · **Source:** ultra-review
**Files:** src/app/api/portal/performance/reports/route.ts, src/lib/performance/performanceReports.ts, src/app/portal/agency/performance/_AquaTagDashboard.tsx, src/app/portal/customer/_CustomerPortalViews.tsx, src/server/productWorkspaceCoordinator.ts, scripts/smoke-performance-reports.test.ts
**Why:** The mutable-row defect is repaired: every generation creates a numbered draft, publish retains and explicitly supersedes an immutable snapshot, withdrawal records actor/reason, only confirmed drafts delete, and the complete report ledger mutates under a durable fresh-state transaction. Dedicated proof passes 4/4.

**Shipped 2026-09-02:** browser-proven on exact isolated build `H-vbnKm_hrkDkN8fgxwqF` — publish, regenerate, republish/supersede, two-tab stale publish 409, withdraw and delete in both portals with two tabs and reload, plus forced-failure receipts, clean at 375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080.

### Enforce Performance experiment evidence integrity
**Id:** valid-versioned-performance-experiments · **Status:** shipped · **Size:** M · **Added:** 2026-08-25 · **Shipped:** 2026-09-02 · **Source:** ultra-review
**Files:** src/server/performanceExperiments.ts, src/server/types.ts, src/app/api/portal/performance/experiments/route.ts, src/app/portal/agency/performance/_ExperimentsPanel.tsx, src/lib/performance/performanceAnalytics.ts, scripts/smoke-performance-experiment-integrity.test.ts
**Why:** The invalid-evidence defect is repaired: stable ids are unique, conversions cannot exceed whole-number visitors, lifecycle updates are timestamped/versioned, completion is immutable, amendment creates a numbered draft, and only drafts delete. Dedicated proof passes 2/2.

**Shipped 2026-09-02:** browser-proven on exact isolated build `H-vbnKm_hrkDkN8fgxwqF` — live tagged-event joins by experiment id and stable variant id, completion, amendment, delete, two-tab stale 409, lost-response replay and reload, plus forced-failure receipts, clean at 375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080.
<!-- AQUACRM_SOURCE_END path="docs/development/roadmap.md" -->

---

<a id="source-docs-development-status-md"></a>

## Source document — `docs/development/status.md`

<!-- AQUACRM_SOURCE_START path="docs/development/status.md" sha256="10c744ce76c81343595183206c0ca909e9257b1c319a0247fb89be172371414d" -->
# Status & verification register

← Back to [development.md](../development.md) (the law)

> **Checkpoint: 8 September 2026 (UI/UX acceptance Waves 1–2, additive).** A dedicated
> pass inventoried all **124 routes**, built a reusable harness
> (`scripts/ui-acceptance.mjs`), and — across two waves — fixed + re-scanned to **0
> serious/critical** every confirmed a11y defect on the audited owner surfaces:
> `select-name`, 404-footer + 41 real colour-contrast nodes (9 surfaces,
> workflow-proposed + adversarially-verified AA fixes), chart `aria-prohibited-attr`,
> `aria-required-attr` (portals/editor), the marketing/you-deserve-it `<dl>` defects,
> and dev-team `#main-content` overflow at ≤768px (verified 0 at 320/375/768) (#191).
> `smoke:all` **6,812/6,810/0/2**; typecheck 0. **The pilot UI gate is NOT FULLY
> passed** — coverage gaps remain (dynamic routes, non-owner roles, full
> viewport/journey sweep, production-build visual pass = wave 3), but no known
> serious/critical defect remains on what was audited. Detail:
> [UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08.md](UI-UX-RESPONSIVE-ACCEPTANCE-2026-09-08.md).
>
> **Checkpoint: 8 September 2026 (engineering pass, additive).** Four red release
> gates were closed in source/tests/CI — see [updates.md](updates.md) and
> [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) § "Local engineering pass".
> **#187** health truth (Railway-aware readiness + real SHA; runtime-verified 200
> local / 503 unready on a Railway-equivalent server); **#189** contrast
> (CommandMoreButton 1.18→7.6:1 and the login footer 4.07→≈6:1; axe-core = 0
> violations on the affected pages/viewports); **#190** `dev:verify` compiles and
> serves; **#188** required CI workflow added; plus structured/correlated
> observability logging. Canonical suite **6,800/6,802 pass / 0 fail / 2 skip**,
> typecheck 0, isolated build **247/247**, audit **0**. These are **locally
> verified, not yet deployed** — evidence label: local-browser / isolated-build /
> focused-test, never deployed-live.
>
> **Committed baseline — `a808bb3f` (8 September 2026). SUPERSEDED for current
> state by the engineering-pass checkpoint immediately above.**
> [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) is the current evidence-backed
> assessment and [TODO.md](TODO.md) is the one task list. This register preserves
> older feature evidence; it is not a competing “where we stand” summary. On the
> committed clean `main` at `a808bb3ff41808c7cc78d5c95530d47b213ffde1` (before the
> uncommitted engineering pass above), the canonical Node phase executed
> **6,774 tests across 1,143 suites: 6,772 passed / 0 failed / 2 skipped** and the
> Website Editor runner passed **49/49 files**. TypeScript and the production
> Webpack build passed; the build generated **247/247** entries. The safe local
> browser matrix recorded **1,314 passed / 12 failed / 0 missing** across 1,326
> checks; those failures were one repeated serious Command Centre contrast cluster
> — **since fixed locally (#189); the matrix now passes 1,326/1,326** (see above).
> Live `www` serves, but `/healthz/full` reports `readyForProduction:false`
> because required email is not configured; apex TLS validation fails. Older
> counts below remain dated history, not the current release baseline.
>
> **2026-09-03 Supabase migrations APPLIED to live:** with Ed's DB password + access token, all 14
> pending migrations were applied to the live project via `supabase db push` after confirming a
> same-day physical backup; `migration list --linked` 27/27, 0 pending; the `agency_id` backfill
> (52/52 `milesymedia`) and every row count verified read-only; live `rls-verify.sql` 51 INFO /
> 0 FAIL. The deployment blocker (build could not hydrate against live) is CLOSED. Backups exist but
> PITR is OFF and no restore was rehearsed. `plans/supabase-alignment-2026-09-03.md` §9.
>
> **HISTORICAL 2026-09-03 pre-application snapshot — superseded by the applied
> result immediately above.** At discovery, the one Supabase project (`dghzbsxbdatskserctgt`) was
> production and is **eleven migrations behind the repository** (plus one grants migration added
> today); the current build cannot hydrate against it. Read-only drift tool
> `scripts/supabase-schema-status.mjs`; isolated rehearsal on a local stack proved ordered
> application, the 52-row `agency_id` backfill, idempotency and a clean RLS audit; the portal ran
> its gates against the local stack (release 163/163, matrix 1169/0, Notepad/Finance 77/77, Phase Admin 10/10; the live production project was untouched and byte-identical before/after). Live application, backups/PITR and
> account reconciliation are BLOCKED on Ed — `plans/supabase-alignment-2026-09-03.md`.
>
> **2026-09-03 release baseline (integrated main, fresh exact build bCDk8GQ5KJFAZVYNDvwvq):** house
> matrix 1326 checks: 1171 passed / 0 failed / 155 evidenced observations / 0 missing; release gate 163 stories: 163 passed / 0 failed / 0 missing (roles 18/18, radar 10/10, calendar 12/12, tools 12/12, newsletter 3/3, layout 108/108) (roles/gates, personal-vs-business Radar,
> Calendar linked records, My Tools folders/icons, newsletter facade, 12 pages × 9 viewports);
> Notepad/Finance notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing); Team Chat/notifications stories 22/22; matrix 72 passed / 0 failed / 9 evidenced observations of 81 at seven viewports; Phase Admin 10/10 stories across 390×844 and 1280×800, 2 recorded N/A (production preview refusal), 0 unexpected console/page/request/HTTP failures; Aqua Tag lane
> 220/220 checks (0 failed) at 390×844 and 1280×800; Dev Editor lane 191 passed / 2 failed / 13 explained N/A rows / 47 observations on the full matrix; the two failures were one timing-sensitive held-reply step that passed on an uncontended rerun of the AI scenario (14/14) and one dev-mode hydration-mismatch console warning raised only inside the AI scenario, recorded as an open residual; canonical suite Node phase 6693 tests across 1135 suites: 6691 passed / 0 failed / 2 skipped in 115621.124792ms; Website Editor gate 49/49 files. Four contrast defects and one
> focus-return defect found on the untouched baseline were fixed before the final run. This is
> isolated-production and local-dev-lane evidence on a file backend; the full labelled register
> is [`plans/production-readiness-roadmap-2026-09-03.md`](plans/production-readiness-roadmap-2026-09-03.md).
>
> **2026-09-02 private-upload integrity checkpoint:** exact lifecycle binding/claim
> fencing and the Finance/Meta owner-replay paths pass **33/33**, **39/39** and
> **6/6** respectively; the complete changed-surface gate is **85/85**. The preceding
> final canonical suite and completed build above include this wave. This is local
> repository, build and browser evidence, not a live-provider acceptance claim.
>
> **Later 2026-09-02 source-freeze checkpoint:** focused PortalState atomicity/
> lease/outbox **17/17**, Staff/Portal Studio direct rerun **18/18**, Website Editor
> visitor/publication **20/20**, settings/lifecycle **26/26**, Affiliate onboarding/
> dependency plus module **32/32**, Membership plan-price **11/11**, named checked
> reads **54/54**, parent dependencies **28/28** and SOP dependency/writer **22/22**
> are green. The final browser evidence above supersedes the browser-pending wording
> recorded earlier in the day's append-only update entry; the final repository suite
> and post-fix build are green with the exact accounting above.
>
> **Performance checked-mutation checkpoint (2026-09-02):** focused Performance gate
> **38/38**, adjacent **74/74**; exact production build `H-vbnKm_hrkDkN8fgxwqF` (245/245 pages)
> passed **119/119** Playwright stories at 375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080 with zero unexpected console,
> page, request or HTTP failures and zero overflow. Issues #128 and #129 are closed on
> that evidence; #47 gains its fifth cohort and stays partial. Canonical suite figures
> for this checkpoint are in the update log entry of the same date.
>
> **Final Actions + Memberships checkpoint (2026-09-02):** Actions **54/54**,
> focused Memberships **65/65**, adjacent Memberships/company/Ecommerce **90/90**
> and the complete changed-surface gate **145/145** pass; lifecycle and webhook
> subsets are **16/16** and **9/9**, and independent review is clean. Exact production
> build `bcNH7NEvlzmp6z1VXtmch` compiled in **79s**, completed TypeScript in **41s**
> and generated **245/245** pages in **416ms**. Its browser matrix passed **40/40**
> stories at 390×844, 768×1024, 1024×768 and 1280×800 with zero unexpected
> console, page, network, HTTP or overflow failures. The tablet Actions title polish
> was rebuilt and re-proven; source and retained data hashes remained unchanged
> throughout the exact-build run. This proves the named local/memory-backed cohort,
> not live Stripe delivery or the remaining #44/#47 families.
>
> **Final targeted production-browser checkpoint:** the exact-width probe is **6/6**
> (Settings Environment 768px, Studio 390/1024/1440, Fulfilment Roles 390/1280),
> with the source hash unchanged. The isolated Staff Technical matrix is **50/50**
> across six same-cookie Hidden → View → Use → Manage → View → Hidden transitions,
> with zero failures, errors or overflow; hidden pages return valid streamed Next
> not-found content (document HTTP 200 or 404), and the exact downgraded API returns
> 403. Fulfilment checked mutations at 390px and 1280px passed injected failure,
> alert, no-reload, rollback-or-retain and retry acceptance.
>
> **Owned-sidecar database boundary (historical wording corrected 2026-09-08):**
> the transactional receipt-deduplicated patch and one-statement snapshot design
> is source/mocked verified. The repository records the relevant migrations as
> applied to live on 2026-09-03, but this 2026-09-08 documentation review did not
> independently reconnect to Supabase or repeat remote concurrency cases. Treat
> migration application as dated evidence and remote concurrency acceptance as
> still partial.
>
> **2026-08-24 scope correction:** the first documentation pass was
> non-security-only. A later read-only review added a live-proven P0 session-
> revocation failure and source-proven P1 showcase/erasure gaps. The current
> checkpoint below includes them and supersedes the earlier deferral wording.

The honest answer to *"does it actually work, and can someone use it?"* — kept
separate from *"is it coded"* and *"do its tests pass"*, because those are not
the same thing.

> **A passing test ≠ a working feature ≠ a usable feature.** Most of this app's
> tests are static-source contract tests (they assert on code *shape*, not
> runtime behaviour). The documentation was **parsed from source, not run.** So
> for most features the truthful status is: *coded and static-tested; runtime
> and usability not verified in this pass.* This register says what is actually
> known — and refuses to imply more.

## The vocabulary
| Level | Means | How you earn it |
|---|---|---|
| **Coded** | the code exists | it's in the repo |
| **Static-tested** | contract tests assert its shape | a `smoke-*.test.ts` references it |
| **Logic-tested** | pure logic has real unit assertions | a test computes real inputs→outputs |
| **Runtime-verified** | someone ran it and it worked | actually executed / clicked through |
| **User-reachable** | a real user can get to and use it | not behind a dev flag / missing creds / unbuilt |

## The honest baseline
- The first documentation pass did not run the application, and the initial ultra-review browser
  tab was stale. The 2026-08-25 continuation cleared that blocker with an isolated state/build and
  browser-rendered the broad public, agency, client, customer, editor and Dev Team route sets plus
  representative 1280/768/375 layouts. Treat those routes as **render/navigation verified only**;
  saves, providers, alternate personas, failure injection and persistence are unconfirmed unless a
  row carries exact evidence.
- The 2026-09-08 canonical `npm run smoke:all` Node phase executed **6,774 tests across
  1,143 suites: 6,772 passed / 0 failed / 2 skipped**; its subsequent Website
  Editor runner passed **49/49 files**. This closes the
  repository source gate, not deployed-provider, live-PostgreSQL, cold-machine or
  broad human-usability acceptance.
- A 2026-08-24 focused non-security rerun passed **98/98** across Editor AI,
  editor project boundaries, showcase reset and adjacent audit regressions. It
  used the memory backend and source contracts; it is not a full-suite, browser
  or live-database result.
- The broader 2026-08-24 non-security sweep passed **3,428/3,428 executed tests**
  across 620 suites with one missing-`DATABASE_URL` Postgres skip. It used the
  memory backend and excluded 13 explicitly auth/MFA/session-focused files. The
  shared file state remained byte-identical.
- The `.mjs` HTTP harnesses remain route/markup/runtime probes rather than browser interaction.
  In particular, `smoke-ux.mjs` still puts its three width labels only in the User-Agent;
  responsive/accessibility evidence comes from the repeatable Chromium matrix recorded below.

## 2026-08-27 speed-phase verification ledger

The bounded implementation/measurement phase is complete, but its evidence has four different
strengths. The generated consolidated volumes should not flatten them into one “production fast”
claim.

| Evidence layer | What was proved | What was not proved |
|---|---|---|
| **Source/static graph** | The proxy import closure is **1,139,995→255,050 bytes (-77.6%)**. Logs' eager graph is **47 modules / 469,232 bytes → 3 / 15,433**. Provider budgets, telemetry, Sandbox fences, realm-keyed Radar/Search/Dev Console caches, access-sensitive Search keys and exact benchmark cleanup/`next-env.d.ts` ownership are source- and focused-test-pinned. | The proxy graph reduction has no comparable post-change runtime sample because a concurrent external `tsconfig` alias blocked a clean start. Static bytes do not establish browser speed or provider behavior. |
| **Isolated production runtime** | Webpack built **281 pages in 135,196.3ms**; the dist tree was **1,479,314,365 bytes**. Per-route fresh-process first/repeat-max was auth **619.1/7.7ms**, public **593.1/9.8ms**, Agency **727.8/28.3ms**, Dev Team **726.4/31.2ms**, Library **693.0/26.4ms**, Logs **741.0/29.0ms**. Process readiness was **205–308ms**; every response was 200 and within payload budget. | Each route got a new Node/Next process after TCP-only readiness, but build and host filesystem/page caches were shared. This is not a cold machine, deployed CDN/edge test or live-provider run. Dist footprint is not transferred route payload. |
| **Local development runtime** | Retained Agency baseline: about **3.8s compile + 315ms app** cold, **784ms** warm. Library **4.428→3.290s cold**, **146→142ms warm**. Logs **3.182→0.857s first**, **2.702→0.868s post-TTL**, later warm **109ms TTFB / 252ms total** versus an earlier 216ms sample. Canonical Library scan **67.6→1.0ms**; Logs activity scan **95.4→38.5ms**. | These are samples from one development machine/compiler state, not service-level objectives. |
| **Mounted browser** | At 1280px, fresh Agency Day settled without loading/overflow and showed `RADAR PAUSED`, `NOT SCANNED` and two `UNKNOWN` values; false-clear `BUSINESS WATCH CLEAR`, `ALL CLEAR` and deterministic-fallback copy were absent. Battle settled with content, Library rendered its heading and Logs rendered its shell before `Where work is happening` streamed within 5s. At **390×844**, Logs, Agency Day and Battle matched the 390px document width with content, no loading/overflow and an empty warning/error log. | The source/behaviour fix passes **49/49 + TypeScript** and mounted acceptance confirms paused Radar/KPI/Advisor/client-attention values remain unknown/not scanned while a completed loaded zero stays zero. Full roles, accessibility and deployed geographies remain outside this speed acceptance. |

The production harness uses disposable state, dist and TypeScript config; cleanup validates its
own dist prefix and restores/deletes `next-env.d.ts` only if the exact benchmark-generated bytes
are still present. A concurrent edit is preserved. Correctness hardening also prevents a speed
cache from becoming a data leak: alternating live/empty/demo identities retain separate Radar,
Search and Dev Console values, and restricted Staff Search excludes hidden candidate families.
Remote writes that may have reached a provider are reported as `outcomeUnknown`; idempotent writes
require the same operation key and non-idempotent writes require reconciliation. None of that is a
live-provider latency/acceptance claim. The selected production-harness, Library/Logs,
provider/deadline, Radar/Search/Dev cache and adjacent Radar/KPI gate passes **76/76**; it is not
the complete repository suite. The final combined code release gate passes **335 / 0 fail / 1
expected live-database skip**, with the full TypeScript check green; that selected gate likewise
does not replace the last whole-suite record.

## 2026-08-27 portal loading and handover checkpoint

The private portal now has one intentional slow-path presentation instead of the Agency boundary
and major streamed workspace placeholder blocks. Ordinary route loads remain inside the content
viewport, preserving the active sidebar and topbar; only a complete workspace change uses a fixed
device-viewport underlay. Normal, Command, Dev Team and client/customer contexts reuse identical
markup with luxury-navy, cyan/near-black, gold/midnight and marine palettes respectively. Cinematic
transitions keep visual priority at `z-index` 10000+, above the loader and split curtain.

The loader waits 110ms before revealing, so fast transitions remain visually silent. After a
genuinely visible loader exits, two non-interactive panels split outward for 460ms and then unmount.
Reduced-motion preference removes spinner rotation and suppresses the curtain. The active loading
state remains an accessible polite status with hidden label text.

The final relevant gate passes **127/127**: **53** normal-runtime loader, Command, customer and
theme checks plus **74** React-server Dev performance/Library, customer snapshot, navigation,
route-contract and shared-graph checks. Full TypeScript passes; this is not a new whole-suite run.
Browser acceptance measured the 1440×900 Dev Team content viewport at
`x=240, y=60, 1200×840` with chrome intact and no overflow. A 390×844 full-workspace underlay
matched the device viewport without overflow. Both curtain halves completed their `-102%`/`102%`
transforms, the handover node unmounted cleanly and the browser console stayed free of warnings and
errors.

## Historical reliability and launch-safety checkpoints

> The entries below retain the evidence and wording of their August checkpoints.
> They are useful feature history but do not describe the current Railway
> deployment, test totals or release verdict. Use the 8 September checkpoint at
> the top of this file and [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

**Unified Environment checkpoint (2026-08-26):** Settings now exposes one
Sandbox Mode with Empty, Demo and Production snapshot datasets, writable/read-only
policy and Demo persona switching. The session carries a server-minted realm, every
PortalState backend uses a distinct key/path per realm, legacy private Dev/Showcase
controls adapt into the canonical service, and public Showcase uses a fixed sandbox
realm. Shared outbound adapters fence live email, Twilio, Stripe, Google Calendar,
Meta, connection tests, GitHub/Vercel publishing and file storage. Focused proof is
46/46 and TypeScript passes. A later real port-3032 browser walk completed Demo Owner
→ Staff → Customer → Freelancer → Owner → Exit, including the expected portal redirects
and return to live Settings. That proves the current signed realm/persona switch loop;
project grants, share links and the preview-server lifecycle were separate at that
checkpoint; the later access/preview checkpoint immediately below supersedes the
preview portion without changing the unverified mutation boundary.

**Configurable-access and Dev Workspace browser checkpoint (2026-08-26):** the
canonical evaluator, reusable templates, direct per-person grants, permission
requests/decisions/revocation and live/Sandbox scope are implemented. Staff,
Fulfilment, Development and a broad exact-client route wave consume stable Hidden/View/
Use/Manage elements. The access manager passed 360–1680px responsive checks; real
restricted Staff and Fulfilment identities were refused hidden deep links; a governed
identity without the exact client grant was refused client workspace and Settings;
and repository preview Start/Restart/Stop, responsive Preview/Code panes and HTTP 200
for `/aqua-tag.js` were browser-proven. The dynamic module catch-all and the
freelancer-job/task/task-template client associations were subsequently classified and
enforced under #172. This does not prove the full cross-persona grant/request mutation journey.
The final static/browser closure additionally gates Fulfilment client list/create,
projects Staff People data per element, canonicalises governed client/customer
collaboration actions, removes the inert generic Development workspace choice and
prevents exact Staff/Fulfilment scopes from retaining each other's elements. Focused
**92/92 + 11/11 + 32/32**, TypeScript and diff pass. A clean restarted browser proved
the exact Staff/Fulfilment key sets, a 390px 2×2 selector with 44px targets and no
overflow, mobile People Capacity, and an empty warning/error log. The complete repo
suite and full mutation/persona/accessibility matrix were not run in this wave. The
new-role composer also exposed all four scope kinds, Live/Sandbox and all 28 stable
element groups; `staff.pay` Hidden→View was restored without persisting a role/grant.
The settled relevant combined gate is **130/130**; the complete repository suite was
not rerun.

| Area | Honest status | What remains |
|---|---|---|
| Release build | **Green and deployed.** The isolated Dev Team release candidate compiled, typechecked and completed **268/268** static-generation entries locally and in Vercel's remote build. The production release and its documentation refresh became READY on 2026-08-26 and `aqua-crm.com` points at the refreshed deployment. | Add a checked-in CI build gate so the same contract is enforced before every later Vercel deployment. |
| Dev Team production control plane | **Live in production.** Every Dev Team page/API and navigation entry uses one founder-only predicate. Bounded output tracing supplies the immutable deployment snapshot; a durable PortalState overlay supplies production Library edits, roadmap/plans, findings/screenshots, Updates, thoughts and worker check-ins. The service-role-only Supabase batch function was installed directly and verified before release; generic Postgres uses the matching row-locked transaction. Exact versions and all-before-any validation protect concurrent and multi-file work. Local development deliberately keeps the real working tree, while production code editing remains GitHub draft/PR-backed. Focused production/access/persistence coverage passed **128/128** before the local and remote builds. Public production acceptance passed homepage/health 200s, login redirects and unauthenticated Dev Team/API boundaries. | Complete one authenticated founder browser walk. Vercel CLI masks sensitive environment values as `[SENSITIVE]`, so it could not supply the real founder password for automated acceptance; the resulting placeholder 401 is not evidence that the stored password is wrong. The local `worker:checkin` command still writes only the local working tree; choose an authenticated publishing path if local workers must appear in production automatically. Port 3032 has fast warm responses after initialization but can spend minutes in Next/React development debug-chunk initialization when open HMR tabs reconnect; this is a local development cost, not the production runtime. |
| Configurable roles and workspace access | **Implemented kernel and representative runtime/browser adoption; application-wide parity remains Building.** Roles are reusable templates, while exact per-person agency/workspace/project/client/environment grants are authority. Permission requests support approve-as-requested, narrow, deny, cancel and revoke. Stable Hidden/View/Use/Manage elements drive Dev, Staff, Fulfilment and 11 client elements. All tenant route files containing `clientId` are **35/36** canonical-gated, with only the dev-only empty-store seeder excluded; 28 completed mappings are source-pinned. Focused client proof is **62/62** plus product-workspace cross-process **4/4**. The dynamic plugin catch-all and freelancer-job/task/task-template client associations are classified and enforced under #172. The final boundary repairs gate Fulfilment list/create, element-project Staff People DTOs, canonicalise governed client/customer collaboration, remove the inert Development workspace choice and sanitise exact workspace scopes; **92/92 + 11/11 + 32/32**. A fresh Settings-only six-primary-viewport browser pass is **36/36** with zero failures/observations, no overflow, clean console/network, visible focus and no serious/critical axe finding. | Preserve the documented customer/session/relationship, Dev-project, workspace-create, website-source and output/derived alternative-authority routes while finishing remaining legacy evaluator adoption. Complete the real create/grant/request/approve/revoke two-user/two-project/two-environment mutation matrix, positive exact-client journey, screen-reader and failure paths, AI/service principals and expiring share links before release parity. The visual Settings slice is not that mutation/persona matrix. |
| Session authorization | **RESOLVED 2026-08-27 at the focused-test level.** `resolveFreshSessionUser()` in `auth.ts` enforces current-user existence, `sessionRev`, current role and live membership on every `getSession()`/`getSessionFromRequest()` read; the old-cookie exploit replay (external-AI create after owner→staff downgrade, password rotation, deletion) returns 403/401 with no token — `smoke-session-revocation` 16/16. | Browser-walk a live downgrade as part of the release access matrix; deployed multi-instance immediacy rides on the storage backend's freshness (sandbox anchors already hydrate fresh). |
| Core CRM and portal surfaces | **Substantially coded; broad static/logic suite green at the last documented run** | Complete the critical browser journeys instead of treating source-shape assertions as end-to-end acceptance. |
| Account creation surfaces | **The standalone portal intentionally exposes no `/signup` page.** Its JSON agency-bootstrap API is backend-only here. Published-site `SignupFormBlock` creates a lead; end-customer self-signup is available only from a client-scoped embed with signups enabled. The focused source/behaviour set passes **35/35**. | Browser-walk the published-site lead result and enabled client embed; do not report the absent standalone screen as a broken route unless product policy changes. |
| Health Check → Public Funnel → BOS | **Anonymous completion is pending-only at the local code and behaviour gate.** A valid managed challenge with the exact Health Check action and host may create one pending Public Funnel capture for the configured installation. It creates no User, session, membership, Lead, Prospect, Person, pipeline card, email index or identity outbox, and emits only a non-PII pending summary. BOS therefore receives no authenticated identity or restored CRM context from an anonymous completion. | A server-only, idempotent promotion command requires exact mailbox proof or an explicit authenticated actor and records capture-to-Lead/Person/Prospect/card lineage. No public mailbox-proof promotion endpoint exists yet. Provision managed challenge secrets and durable abuse budgets, then browser- and deployment-prove the pending journey and any future verified promotion path. |
| Public Funnel capture durability | **Partially repaired and deliberately pending.** Authoritative by-id reads, stable ids and a global process transaction collapse same-process replay/races across configured installations. Anonymous capture retains submitted PII only in its pending row; activity and automation effects receive non-PII summaries. Infrastructure/configuration failures fail closed. | Add database-native cross-process canonical uniqueness, durable address/installation/IP budgets and a durable outbox/idempotent consumer contract. Fault and race capture, erasure and promotion across separate processes before claiming exactly-once or production-grade abuse resistance. |
| Lead identity changes | **Partially repaired.** Canonical email/phone conflicts are refused under one agency-scoped process lock; the real PATCH boundary returns 409, pointer cleanup is ownership-safe, simultaneous in-process edits/upserts are covered, ambiguous legacy email-card fallback is avoided and the sales-record draft stays open with an inline error. The focused gate passes **46/46**. | Add storage/database-native conditional identity ownership and prove edit/import/qualification races, retries and reload across separate processes before claiming distributed uniqueness. |
| Opportunity invoice/payment ledger | **Partially repaired.** Unique invoice slots, an agency-scoped process lock and independent payment ledger rows preserve simultaneous proposals/payments/save edits; canonical required references dedupe retries and conflicting reuse returns 409. Receipt/activity/event progress is resumable. The focused gate passes **8/8**. | Back the conditional claims and outbox with database-native cross-process storage; fault/retry Finance, Stripe, email, activity and event delivery across crashes and instances. |
| Marketing asset/profile persistence | **Partially repaired.** Assets/funnels and profiles use per-id rows with legacy-array merge/tombstones; mutations serialise in-process and mounted editors send their opened `updatedAt`. Same-version races yield one success and one visible 409, and all acknowledged simultaneous creates survive. The focused gate passes **25/25**. | Add database-native compare-and-set/version constraints and repeat create/edit/status/delete/reload across separate processes before claiming distributed safety. |
| Agency Marketing lead identity | **Partially repaired.** Create/lookup/edit use one trimmed lowercase email; agency mutations serialise, pointer cleanup is ownership-safe, conflicts return 409 and same-process create/edit/contact races preserve one owner and acknowledged work. Package **24/24** plus real-handler **2/2** pass. | Add database/storage-native conditional pointer ownership and prove create/edit/import/contact races, retry and reload across separate processes. |
| Agency Marketing campaign truth | **Partially repaired.** Complete create/PATCH records and runtime values are validated before mutation; invalid API/report windows are refused; same-process campaign creates survive. Reports declare a `createdAt` window and separate currency budgets plus KPI results. Package **24/24**, handler/UI **3/3**, and live 3032 labels are verified. | Add database-native cross-process campaign index coordination and prove create/update/delete plus reload from separate processes. |
| Aqua Tag routing controls | **Partially repaired.** Agency/client stop controls use a dedicated route-to-inbox action and preserve the source, injections and forms; full delete separately confirms every cascading dependency and supports cancel. Focused **68/68** passes and live Tags renders. | Complete an isolated mounted reroute/reload and delete-cancel/delete-confirm browser walk; the shared live fixture was deliberately not mutated. |
| Aqua Tag tool delivery | **Resolved with explicit future-load semantics.** Config is no-store; every new page fetches the current enabled set. The UI says already-open provider code may continue until refresh, uses “off for new loads,” scopes checkbox labels/removal confirmation and surfaces mutation errors. Behavioral/API/UI **33/33** plus live headers/copy pass. | Keep this contract explicit if a provider-specific live teardown is ever added; do not relabel future-load control as immediate remote stop. |
| Aqua Tag form ingestion | **Partially repaired.** One browser submission now carries a stable id through the tag and host form. Real handlers serialise/reconcile it in-process, promote tag-first rows, preserve reverse-order capture, return 503 on failed writes and dedupe completed replay; stable activity/automation keys suppress replay. Handler **5/5**, wider **120/120**. | Add a database-native unique submission claim and durable outbox/idempotent consumers; race separate instances and crash every persistence/effect boundary before claiming distributed exactly-once. |
| Dev Team source-of-truth writes | **Partially repaired.** Filesystem-visible locks plus atomic replacement cover roadmap, Updates, thoughts and Findings; the standalone worker cooperates and finding create is exclusive. SHA-versioned doc saves reject stale processes and hash-bind attribution. A fsynced local batch journal now recovers the document and attribution ledger together after death between renames or before cleanup, refuses and retains the journal over an outside edit, and binds recovery to the exact ordered canonical target pair. Unreadable, malformed or shape-invalid local and durable attribution ledgers fail closed and remain untouched. The widened Dev doc/cross-process gate passes **29/29**; durable production workspace passes **7/7**. | Close or explicitly constrain the final version-check/rename interval for non-cooperating direct writers. Production's durable workspace already uses one database batch transaction; plan creation's `wx` path remains safe. |
| Dev Editor transition reads | **P1 — target resets do not prevent older Page SEO/Element Insert responses repainting the new target.** A slow old SEO read can put the previous page's metadata/fingerprint under the new page label and feed it into the new path's preview; source tests assert strings and resets, not response ordering. | Scope every read/preview to a request generation or AbortSignal, reject stale targets locally and test slow-old/fast-new page, layout, element, project, surface, lifecycle and refresh transitions before the browser matrix. |
| Managed integrations | **Resolved.** Active selection is explicit per provider and scope. Saves/retests no longer reorder it, failed active tests deactivate, client-capable consumers use exact-client then workspace fallback, communication carries the validated target client and unsupported generic client scopes are refused. The broad provider/consumer gate passes **160/160**; port 3032 shows the expected active/inactive controls. | Preserve the legacy-default migration rule until every live provider has an explicit active flag; keep new consumers on the scoped resolver. |
| Portal Editor form schemas | **Resolved.** All six advertised entities reach mounted create/edit forms and guarded operator/API writers. Clients, Leads, Actions, Products and Expenses use Portal Editor state; Contacts explicitly delegates to one shared Leads Pipeline schema and the generic editor refuses a second Contacts document. Nine types, active/options/required rules and deleted-history behavior pass **8/8** focused and **118/118** surrounding checks; all tabs and working screens mount on port 3032. | Keep system/background writers explicit when they legitimately cannot supply person-entered required fields; keep every new operator/import path on the canonical validator. |
| Agency Settings effectiveness | **Resolved with effective behavior and explicit limits.** `portalAccessDays` controls the real unsent-access follow-up while confirmation codes remain a separately labelled 15-minute credential. Business identity feeds invoice and transactional-email fallbacks. | Digest and timezone remain intentionally stored for future scheduling and say so in the UI. Outcome **3/3**, surrounding **143/143**, and read-only port-3032 Account/Defaults/Notifications proof pass. |
| Agency Settings staff surface | **Resolved.** One shared capability map aligns Team, Activity Log and External AI with their owner/manager APIs. Middleware keeps staff in Team; defensive Settings branches expose no refused controls, and Account/Permissions no longer send staff back into Settings. | Focused role/API/source **5/5**, surrounding **68/68**, production build **271/271** and isolated owner/manager/staff browser proof pass. Keep every new Settings action on the same capability map. |
| Google Calendar event creation | **Resolved.** A durable client operation maps to one Google-compatible event id, is persisted before POST and adopts the provider row before best-effort refresh. 409/read-back and local-state-loss recovery cannot create a second remote event; stale refresh returns success with a warning. | Focused fake-provider/persistence matrix **7/7**, surrounding **87/87**, production build **271/271**. No live Google account was mutated; retain live-provider acceptance as operational verification, not missing product logic. |
| Contact identity ownership | **Resolved at the Contact application boundary.** Add/Edit share canonical agency-wide checks and 409 owner links; failed drafts remain, split imports cannot partially move identity, shared switchboards are explicitly non-identifying and ambiguous legacy phones are not guessed. | Focused **31/31**, widened **114/114**, build **271/271** and isolated mounted email/phone/reload proof pass. Shared data has zero duplicate emails and two legacy repeated-phone groups requiring human review; no automatic rewrite was attempted. Database-native uniqueness across unrelated application processes remains part of the broader blob-storage coordination boundary. |
| Meta webhook claims | **Resolved at the queue-ownership boundary.** Local and Supabase contracts use bounded owner/expiry leases, reclaim expired and legacy-unleased processing rows, fence complete/fail and terminal-settle an expired final attempt. A real replacement Node process reclaims and completes the crashed process's event; focused **11/11**, wider **60/60** and build **271/271** pass. | Deploy and execute the checked-in upgrade migration against the target Supabase environment. Conversation and multipart delivery are closed by #97/#98; queue leasing remains a distinct ownership boundary. No live-database acceptance was claimed. |
| Local Master Inbox store | **Resolved and destructive-fault verified.** Corrupt JSON/collection shapes are recovery-required and remain byte-identical. Every local mutation re-reads under an inter-process lock and commits through 0600 temp + fsync + atomic rename + directory fsync; dead locks/temps recover. Write/rename/SIGKILL faults, 12 concurrent writers and a two-claimer race pass **6/6**; wider Inbox **62/62** and build **271/271** pass. | Keep destructive probes on isolated files and preserve the lock-aware transaction for every new local Inbox collection/mutator. The shared port-3032 file was deliberately untouched. |
| Meta inbound conversation state | **Resolved at the append/summary boundary.** One idempotent operation commits a provider message with its thread advance. Unread increments only for new inbound rows; min/max-derived clocks, first response, deadline and latest referral facts remain correct across concurrency, reordering and replay. Duplicates stop before activity/automation. Focused **7/7**, wider **80/80**, build **271/271** pass. | Deploy and execute `20260825100000_atomic_meta_conversation_ingestion.sql` before live Supabase acceptance. The checked-in service-role RPC is source-verified; no live database was changed. Multipart outbound delivery is resolved separately by #98. |
| Meta outbound multipart replies | **Resolved at the logical-operation/per-part boundary.** Text and attachments retain independent leased status, attempts and provider ids inside one deterministic message. Retry skips sent work; active workers are fenced; expired ambiguous sends become review-required rather than duplicated. The UI exposes partial progress and “Retry remaining.” Focused **4/4**, wider **54/54**, isolated build **271/271** pass. | Deploy/execute `20260825110000_resumable_meta_reply_parts.sql` before live Supabase acceptance. An uncertain part deliberately requires provider review because automatic retry cannot distinguish a crash-after-accept from a missing send. |
| Actions task validity | **Resolved at the shared task-service boundary.** Create and complete post-patch state validate title, status/priority/recurrence/source, safe positive timestamps and start/due/reminder chronology before mutation. Invalid real-route writes return field-specific 400s without changing storage; undefined allow-list keys preserve dates and explicit zero still clears a reminder. | Focused route/service/UI-source **7/7**, wider Actions/task/Aqua+Google Calendar **136/136**, TypeScript/diff and isolated build **271/271** pass. Keep new task writers on `createAgencyTask()`/`updateAgencyTask()`; mounted browser acceptance remains part of the general verification sweep. |
| Lead-to-client conversion | **Resolved at the durable operation boundary.** Agency plus canonical identity elects one owner before creation; matching callers replay one saved result, conflicts are refused and failed/expired work resumes. Client, contact, portal, lead-card and Finance effects converge. A real-handler race returns one 201 and one 200 for the same single client/contact/portal; crash-resume adopts one invoice/payment and independent file workers elect one owner. Focused **6/6**, wider **87 pass / 0 fail / 2 expected DB skips**, TypeScript/diff and build **271/271** pass. | Deploy and execute `20260825120000_lead_conversion_operations.sql` before live database acceptance. Preserve the coordinator/idempotency contract and complete mounted browser acceptance; no shared port-3032 state was changed. |
| Fulfilment product stage | **Resolved at the shared transition/read boundary.** `clientProductProcess` is canonical; legacy board/portal fields are migration fallbacks. One synchronous transition converges process, board mirror, retained workspace, programme portal and aggregate account lifecycle from agency board, client process and portal workspace routes. Retries preserve checklist work and dedupe activity; multi-product accounts advance only when every product catches up. Focused **5/5**, wider **114/114**, TypeScript/diff and build **271/271** pass. | Complete mounted browser acceptance when a server is available. Port 3032 was down and isolated wildcard/loopback listeners were denied with `EPERM`, so no browser success or shared-state mutation is claimed. Preserve the resolver/transition boundary for every future stage surface. |
| Client product-workspace writes | **Resolved at the versioned durable transaction boundary.** Workspaces carry monotonic revisions; stale edit/stage/process/file writers receive current-state 409s. One client mutation converges workspace, process, board, account/portal and file visibility. Filesystem/database leases reload and serialise separate processes. Sibling request/approval/payment/record ledgers merge under the same transaction; payment plans add per-plan revisions. Real-route **8/8**, cross-process **4/4**, wider **77/77**, TypeScript/diff and build **271/271** pass. | Deploy/execute `20260825130000_product_workspace_leases.sql` before live database acceptance and complete the mounted two-tab conflict/retry walk. Preserve the revision/lease boundary for every future product or sibling-ledger writer; no shared port-3032 state was changed. |
| Client payment and billing totals | **Resolved at the currency-position and collectible-status boundary.** Client payment summaries expose separate per-currency agreed/collected/outstanding values; agency cards, overview, Radar and Finance founder consume them. Built-in Billing and configurable metrics share invoice currency groups and only `sent`/`overdue` count as outstanding, excluding draft/void/refunded/cancelled rows. | Focused **62/62**, TypeScript/diff and isolated build **271/271** pass. Preserve the shared grouping helpers; complete the mounted mixed-currency/refund browser walk without fabricating an FX aggregate. |
| Advanced Fulfilment Kanban | **Resolved at the shared Actions-task boundary.** Board cards are canonical `AgencyTask` records loaded from fresh shared state; column/status mapping, revision-checked move/delete, durable per-client coordination and existing task activity keep the client board and Actions coherent. The former localStorage board is a one-time idempotent import only. | Focused route/migration **3/3**, wider Actions/client-task **136/136**, TypeScript/diff and isolated build **272/272** pass. Complete the mounted two-session and storage-loss walk; no port-3032 state was changed. |
| Payment-plan invoice recovery | **Resolved at the durable operation/adoption boundary.** A recovery identity is persisted before Finance create; pending operations remain visible/retryable, and the nested file transaction is re-entrant only for its owning async request. | The later 422 regression was traced to the former non-reentrant nested file transaction and fixed. Fresh-process adoption is restored to **4/4**; widened Finance/client/product-workspace is **65/65** and the cross-process/re-entrancy lock gate is **8/8**. Mounted fault/retry acceptance remains. |
| Website Editor nested verification | **Resolved at the shared discovery-runner boundary.** Module `npm test`, root `smoke:website-editor` and canonical `smoke:all` now use/include one runner with portal path aliases and client React conditions. It discovers and attempts every file, retaining aggregate failure diagnostics. | The current runner passes **49/49 files in 11.8s**, its fail-through contract remains pinned and TypeScript is clean. The final canonical Node phase is **6,417 tests / 1,093 suites: 6,415 passed / 0 failed / 2 skipped**, and the final primary local build generated **245/245** pages. Keep mounted editor behaviour in the separate browser sweep. |
| Customer relationship status | **Resolved at the canonical client-state display boundary.** Billing maps active, suspended and archived relationship values to explicit copy and a Support action. Suspended service is named as suspended/paused; secure billing and invoice payment remain available exactly as before. | Focused **3/3**, wider customer/relationship/billing **43/43**, TypeScript and isolated build **272/272** pass. Fresh reads retain active+suspended access and exclude archived. Complete mounted switching/direct-entry/reload acceptance when a suspended local fixture exists; port 3032 was not mutated. |
| People record validity | **Resolved at the complete-row service boundary.** Create and post-patch validate employee/pay/leave/shift/training enums, bounded numeric/date values, coherent ranges and nested commission/onboarding records before mutation. Canonical email has one non-alumni owner; invalid writes return 400, conflicts return 409 and partial patches retain omitted fields. | Focused route/workspace **26/26**, Agency HR **6/6**, TypeScript and isolated build **272/272** pass. Complete mounted form/conflict/reload acceptance; add database-native uniqueness before claiming cross-instance identity safety. |
| Workforce record ownership | **Resolved at the canonical People workforce boundary.** Mounted Agency HR staff/leave services delegate to People and expose the same ids, status and decisions; HR-only department/role/assignment metadata is a sidecar on the People id. Finance reads People employees only. Leave approval changes decision and employee status atomically. | Convergence **3/3**, wider route/People/Finance gates **97/97**, standalone HR **6/6**, TypeScript and isolated build **272/272** pass. Current retained state has no legacy HR staff/leave index to migrate; matching metadata maps onto People and unmatched legacy identity rows remain excluded. Complete mounted browser mutation/reload acceptance. |
| Staff compensation ownership | **Resolved at the canonical People-terms boundary.** Linked Finance profiles derive current People identity, pay basis, amount, currency, dates/hours and commission facts on every read. Finance retains budget/cost centre, employer overhead, cadence/date, scope, notes, status and payment evidence; independent suppliers remain Finance-owned. Duplicate/missing links fail closed and payment drafts use the same projection. | Mounted convergence **3/3**, focused People/Finance **32/32**, wider non-security gate **158/158**, standalone Finance **23/23**, TypeScript and isolated build **272/272** pass. Current retained state has no compensation index to migrate. Complete mounted browser save/reload acceptance. |
| Staff account provisioning | **Resolved at the durable operation boundary.** Agency Users, candidate hire and employee activation persist one password-free agency/email intent with stable local ids before Supabase, then checkpoint provider, local-user, target-link and completion separately. Only an identity marked by that exact operation can be adopted; retryable failures expose their stage. | Dedicated recovery **14/14**, wider People/Settings/state **109/109**, final TypeScript and the later **245/245** production build pass. Complete real-Supabase and mounted failure/retry/reload acceptance; reconcile legacy unmarked provider orphans manually. |
| Freelancer user journey | **Resolved at the provisioning, policy and shared-work boundaries.** Creation now provisions/adopts the remote identity through the resumable operation, links one local freelancer/People record and sends a password-setup invitation with an operator fallback when mail is unavailable. Deliverables, private uploads, owner Team Chat and submit are real policy-gated capabilities on both sides. | Mounted journey **3/3** (including legacy-local adoption/replay), surrounding **105/105**, TypeScript and the later **245/245** production build pass. Complete real Supabase/email/reset/login and cross-process/browser reload acceptance; no shared production state was mutated. |
| Finance invoice identity | **Resolved at the durable adopt/reserve/persist boundary.** Mounted creates retain one operation key; `InvoiceService.create()` refreshes and serialises deterministic-id adoption, agency/year sequence reservation and row/index persistence through the cross-process plugin-storage transaction. | Separate file-backed workers plus fresh-process reload **2/2**, wider Finance/product transaction **91/91**, TypeScript/diff pass. Distinct intents retain distinct numbers and same-key retries consume one row/number. Optional issue failure recovery remains #47; no port-3032 state was touched. |
| Finance payment allocation | **Resolved at the collectible-state and atomic-outstanding boundary.** Direct/mark-paid recording accepts collectible invoices and adopts retries before status checks; a refreshed per-invoice transaction caps each write to current net outstanding and settles only on exact clearance. Income and Checkout use the same helper and remaining amount. | Separate file-process races/reload **3/3**, current complete Finance **271/271**, TypeScript/diff pass. £70/£70 against £100 persists £70 once; £40/£60 both persist and settle; draft/void/paid/status-only-refunded/over-limit attempts leave state unchanged. Durable refund reversals are resolved under #119; live signed Stripe acceptance remains. |
| Finance record validity | **Resolved at the complete service-row boundary.** Exact fields, supported currency/enums, safe money, bounded rates/quantities, coherent dates, recurrence, nested invoice lines/attachments and invoice templates validate before every Finance create/post-patch write. Operations no longer silently rounds or drops invalid values. | Dedicated service/import plus mounted-handler refusal matrix **115/115**; current complete Finance **271/271**, TypeScript/diff pass. Every rejected case keeps the entire plugin store byte-identical. Continue with #120–#121 browser acceptance. |
| Finance plan assignment | **Resolved at the validated, recoverable two-direction boundary.** Client and target are checked before mutation. One agency-wide cross-process transaction writes a versioned recovery marker first, then normalises old/new membership and the reverse pointer; every plan read completes interrupted work. | Fault every assign/move/unassign write plus mounted malformed/stale request and independent file-process shared-target/move/unassign/stale races: **18/18**. Fresh reload agrees in both directions; current complete Finance **271/271**, TypeScript/diff pass. The mounted commercial model is converged under #121. |
| Finance recurring expenses | **Resolved at the schedule+occurrence operation boundary.** One due timestamp identifies one deterministic child and durable result. The per-schedule cross-process transaction resumes pending work before newer requests, persists the child result before advancing once, and uses an idempotent audit key. Mounted requests carry the due timestamp; direct double calls infer it before mutation. | Fault all six writes and creation/recurring logs before+after, then retry/reload; mounted handler/UI replay and independent file processes across two periods all converge: **15/15**. Current complete Finance **271/271**, TypeScript/diff pass; one child per due date, no skipped period. |
| Finance reporting truth | **Resolved at one named, selected-currency accounting boundary.** Payment/legacy receipt cash, reimbursed cash costs, approved+reimbursed commitments, pending costs, partial-aware receivables and proportional receipt tax are separate fields. Overview, Reports, Budgets, Planning, P&L and mounted APIs consume them without implicit FX; MRR/ARR and client metrics are currency-scoped too. | Mixed GBP/USD plans, receipt states and pending/approved/reimbursed expenses pass **5/5** across services, APIs and UI consumers; current complete Finance **271/271**, TypeScript/diff pass. Durable reversals now extend the same boundary under #119. |
| Finance refund accounting | **Resolved at immutable provider-identified negative allocations.** Partial/full/cumulative Stripe refunds preserve the gross Payment, reconcile only the unrecorded delta, derive invoice state/net receivable and reverse cash/tax in every accounting consumer. Disputes persist separately. | Dedicated partial/multiple/full, replay, interrupted-write retry, independent-process refund/dispute and fresh-reload proof **4/4**; complete Finance **271/271**, TypeScript/diff pass. Manual requests forward a stable identity to Stripe and successful results persist immediately. Live signed Stripe acceptance remains. |
| Finance settings effectiveness | **Code/behaviour resolved; mounted browser acceptance pending.** Workspace Settings solely owns bounded whole-day invoice terms, default tax and business/tax identity. Duplicate/inert Finance declarations are gone; form/service consume the defaults, and new invoices snapshot issuer identity so later settings cannot rewrite old exports. | Old 10-day/old-tax → new 45-day/new-tax invoice/export proof **3/3**; current complete Finance **271/271**, plugin/settings outcomes **27/27**, TypeScript/diff pass. Isolated browser start was denied `EPERM`; port 3032 was untouched. Complete that click-through before full resolution. |
| Finance commercial-plan truth | **Code/behaviour resolved; mounted browser acceptance pending.** Client Payment Plans are the canonical client schedule; Finance Plans are editable pricing templates. Mounted controls assign/move/cancel clients; terms snapshot on assignment, linked schedule lifecycle stays Finance-owned, and the legacy membership route/mirror no longer powers consumers. | GBP→USD invoice/payment/deposit, MRR/ARR, move/cancel/retry/reload and mounted source contracts pass **3/3**; complete Finance **271/271**, TypeScript/diff pass. The isolated listener remains unavailable (`EPERM`), so complete the literal browser lifecycle before full acceptance. |
| Membership subscription and plan-price lifecycle | **Code/behaviour resolved; full mounted/live-provider acceptance pending.** Durable operation bindings preserve every archived command and exact replay after newer work; subscription state retains every retired provider generation. Checkout identity includes mode, price, trial, return targets and provider subscription. Paid plan changes/cancellations keep the shared provider lane through authoritative dependency-graph adoption; terminal cancellation is sequence-fenced and announced once. Plan create/price update retains exact base/candidate snapshots, separate cadence checkpoints and stable provider identities outside the state transaction. | Lifecycle **16/16**, plan-price **11/11**, final focused Memberships **65/65**, adjacent Memberships/company/Ecommerce **90/90** and complete changed-surface **145/145** pass; TypeScript/diff pass and independent review is clean. The exact-build settings/controls browser slice is **40/40** jointly with Actions, but full paid lifecycle and live Stripe proof remain. |
| Membership webhook delivery | **Code/behaviour resolved; signed live-provider acceptance pending.** Completed delivery dedupes before Stripe I/O. Retryable failed/interrupted/legacy work re-reads authoritative subscription state inside the same per-user provider lane as UI lifecycle commands; late generations cannot replace current access. Exact Checkout expiry releases only its session. The scoped payment ledger is paid-dominant and records side-effect completion. Metadata/scope is required and processing failures return 503. | Webhook **9/9**, final focused Memberships **65/65**, adjacent Memberships/company/Ecommerce **90/90** and changed-surface **145/145** pass; TypeScript/diff pass and independent review is clean. The remaining boundary is signed live-provider delivery, not a missing foundation adapter. |
| Affiliate payout ownership | **Code/behaviour resolved; mounted/live-Connect acceptance pending.** Affiliate-scoped scheduling claims each approved attribution once and resumes partial row/index work. Manual/Stripe completion share a staged operation and reconcile earnings from canonical paid attributions, so retries and legacy duplicate payouts cannot double-count. | Fault/reload/concurrent schedule and completion proof **3/3**; package+focused **17/17**, combined Membership/Affiliate **70/70**, TypeScript/diff pass. The real Connect foundation is wired; mounted browser/live transfer remains. |
| Affiliate accounting truth | **Code/behaviour resolved; mounted/live-provider acceptance pending.** Eligible orders snapshot currency/settlement facts; payouts are currency-bound with gross/reversal/net composition, and cumulative cancellation/refund state is reconciled before transfer or as a same-currency future offset after settlement. | Mixed GBP/USD, pending-order exclusion, pre-payout cancellation, post-payout partial/full refund, replay and admin/affiliate source proof **3/3**; package+focused **20/20**, widened **79/79**, TypeScript/diff pass. Literal browser/live-provider proof remains. |
| Membership/Affiliate record validity | **Code/behaviour resolved; mounted browser acceptance pending.** Allowlisted create/patch inputs and complete service candidates validate nonblank identities, enums/currencies, bounded integer money/rates/dates, references, category fields, provider projections and payout composition before mutation. | Full-store byte-identical refusal matrix **3/3**, widened Membership/Affiliate/Ecommerce **82/82**, TypeScript/diff pass. Complete literal mounted invalid-submit/error/reload proof. |
| Affiliate identity uniqueness | **Resolved.** Durable install-scoped claims choose the complete Affiliate/code/attribution row before secondary writes; identical retries adopt and repair it, conflicts reject, collection locks preserve shared indexes and stable operation markers make referral counters exact. | Delayed multi-container user/code/order/payout races plus interrupted-write/fresh-container recovery pass **4/4**; focused **27/27**, widened Membership/Affiliate/Ecommerce **86/86**, TypeScript/diff pass. |
| Performance report history | **Resolved and browser-accepted (2026-09-02).** Generation creates a numbered draft, publication retains/supersedes the immutable prior snapshot, withdrawal is explicit/reasoned/audited and only confirmed drafts delete; the mounted panel uses checked receipts sequenced through the parent, and the route classifies request/state refusals and captures unexpected failures. | Exact build `H-vbnKm_hrkDkN8fgxwqF`: generate/publish/regenerate/supersede/two-tab stale publish 409/withdraw/delete with agency + customer history, two tabs and reload, plus forced 503/409/malformed/wrong-identity/rejected receipts, clean at 375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080. Focused Performance gate **38/38**. |
| Performance experiment integrity | **Resolved and browser-accepted (2026-09-02).** Unique stable ids, coherent whole-number results, optimistic versions and allowed timestamped transitions are enforced; completed evidence is immutable, Amend creates a numbered draft and only drafts delete; the mounted panel validates every variant in the receipt and the route classifies validation 400 / conflict 409 / not-found 404 / generic 500 with the lookup and client gate inside the refreshed transaction. | Exact build `H-vbnKm_hrkDkN8fgxwqF`: create/edit/complete/amend/delete, live tagged-event join after reload, two-tab stale 409, lost-response replay and forced 500/400/rejected/malformed/wrong-identity receipts, clean at 375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080. |
| File backend | **Repaired and failure-path verified.** Writes commit through a same-directory temp file, fsync and rename; a failure is surfaced, marks the backend unwritable and cannot advance persistence state. Malformed JSON is preserved as recovery-required instead of hydrating an empty CRM. | Keep the dedicated recovery smoke in the release gate; cross-process collection coordination is a separate architecture concern. |
| Aqua Editor AI | **Implementation complete; deployment acceptance partial.** Stored replay, realm-scoped in-process dedup/local claims, durable claim functions/adapters and fresh post-provider state checks are coded/tested. Generation uses the shared fenced/deadlined OpenAI adapter. Ambiguous provider/persistence/completion outcomes retain their bounded claim; Sandbox traffic makes zero network calls; identical live/Sandbox ids do not coalesce; a warm reply after flush failure is not called durable. | Focused proof is **35 passed / 1 optional live-Postgres skip**, plus TypeScript/diff. Apply the migration/DDL and run the included independent-process claim test against the actual database before production acceptance. |
| Editor lifecycle | **Project-bound dirty state and source-level AI remount/prefill clearing exist; runtime isolation remains open** | Route browser hide, surface, lifecycle and refresh through one policy, reproduce/close reported cross-project prefill bleed, then drive the full matrix in a browser. |
| Website editor route wiring | **Partly resolved.** The retired Sites island and its thirteen legacy calls are gone; exact-scope install state gates optional AI controls without the guaranteed status 404, Ecommerce variants is registered and retired admin routes redirect. The explicit dead-call ratchet is now fourteen. | Funnels, Split, remaining visitor backends and optional AI action routes still need a real implementation or honest removal, with mounted create/save/publish/promote/image-AI/reload coverage. |
| Published functional blocks | **Partially repaired.** Contact has a strict consent-bearing, origin-checked, rate-limited exact-install facade with one atomic receipt/submission record. Blog Feed/detail return published allowlist DTOs; Blog Post uses the host child renderer with finite body limits and no recursive Blog Post mount. The complete visitor-visible page, exact theme and custom presentation state are immutable until republish, including legacy migration/revert. Dedicated visitor/publication proof is **20/20**, the complete Website Editor runner is **49/49 files**, and the registry pins **342 total / 145 undeclared / 16 public routes**. Ecommerce retains its separate allowlisted storefront facade. Forms, Booking/Reservations, Newsletter and Theme still name absent modules; Affiliate Leaderboard/Signup, Donation recurrence and other visitor promises retain their documented gaps. | Connect captured contacts to the intended operator inbox/notification flow, implement or remove the remaining absent-module controls, then browser-drive every published block on a real custom domain and live backend/provider. |
| Website export | **Resolved locally: the canonical tenant-scoped export route is registered, honest and mounted.** Representative Homepage export preserves supported content, visibly reports unsupported dynamic blocks and excludes private connection material. | Focused route/UI/export proof is **18/18** plus **68/68** static-export behaviour and a mounted representative ZIP comparison. Production-host and repository-promotion acceptance remain release gates. |
| Website Editor admin data model | **Resolved: every visible browser-only admin island was retired or replaced.** Sections, Popups and legacy Page Detail are gone or redirect to canonical routes; Customise now holds only an honest local editor preference plus tenant-scoped site/export controls. | Focused proof is **32/32** and the complete Website Editor gate is **49/49 files**. Preserve the single canonical server-backed site/page model. |
| Website Editor management routes | **RSC boundary repaired and browser-verified.** Client-page metadata makes the host branch before constructing server-only services/storage; all eleven formerly failing manifest routes render without the plugin error boundary. | Continue the separate operational API/control work under #28 and related Website Editor issues. |
| Campaign email delivery | **Resolved at the provider-delivery boundary.** Campaign state and lead contact stamps advance only after confirmed delivery; queued, failed and partially-sent outcomes remain visible/retryable, and readiness requires a configured active provider plus sender. | Focused campaign/email-sender proof is **73/73**. Live-provider acceptance and any future durable background-worker deployment remain operational work, not the former false-sent defect. |
| Paid Memberships | **Code/behaviour repaired; live Stripe acceptance pending.** The exact-client foundation is real and truthfully unavailable without scoped credentials. Durable operation history, immutable Checkout/provider terms, every retired provider generation, provider-lane adoption, authoritative webhook reconciliation, a paid-dominant payment ledger and one terminal cancellation transition protect the local lifecycle. Partial default seeding is reported rather than hidden. | Plan-price **11/11**, focused Memberships **65/65**, adjacent **90/90** and changed-surface **145/145** pass with clean independent review. Run paid plan → Checkout → signed webhook → switch/pause/resume/cancel → reload/reconciliation with a real Stripe test account. |
| Affiliate automated payouts | **Code/behaviour repaired; live Stripe Connect acceptance pending.** The foundation supplies a real exact-client Connect adapter only from scoped Ecommerce credentials; unavailable onboarding/transfer controls are gated. Onboarding owns a durable stable-key intent, final target validation, sequence-fenced status and current-provider webhook refresh. Money movement also requires a webhook secret so an unreconcilable transfer cannot start. | Current module plus onboarding/dependency proof is **32/32**; earlier payout/currency proof remains green. Run account → hosted onboarding → status webhook → transfer → completion/reload in Stripe test mode. |
| Client creation phase setup | **Code/behaviour resolved; mounted browser acceptance pending.** Agency phase rows now drive one durable operation used by New Client, lead/contact/person conversion and linked workspaces. It persists before effects, checkpoints the client, replays safely, resumes failed steps only and exposes retryable incomplete state. Epic Intro uses Website Editor plus `aqua-incubator`; exact clients GET is restored and mounted hard-coded presets are gone. | Dedicated **4/4**, wider lifecycle/navigation/lead/relationship **75/75**, TypeScript clean. Browser-submit all built-in/custom stages, deleted-row refusal and forced install/variant/portal failure → retry → reload while inspecting installs/checklist/starter and incomplete UI. |
| Mutation error feedback | **Partial — the checked boundary, first broad cohort and mounted Finance, Dev Team, Governance, Fulfilment, audited Actions and Performance writes are implemented.** `checkedJsonMutation()` rejects transport, unreadable/malformed JSON, non-2xx, `{ok:false}` and invalid success payloads; 5xx bodies are opaque and unsafe/bloated 4xx/domain diagnostics fall back. Actions task completion/delete and alert decisions additionally bind revisions or semantic occurrences to deterministic receipts, return authoritative snapshots and keep refused work visible with settled busy state. | Actions **54/54** and complete changed-surface **145/145** pass with clean independent review; exact build `bcNH7NEvlzmp6z1VXtmch` passes the responsive failure/replay matrix **40/40** jointly with Memberships. Performance (experiments, reports, milestones) adds parent-sequenced receipts and one shared route classifier; exact build `H-vbnKm_hrkDkN8fgxwqF` passes **119/119** stories at seven viewports including forced 5xx/4xx, rejected-fetch, malformed and wrong-identity receipts. The broader 148-family audit remains open: migrate Client Centre, phase, SOP, Company and related controls, then complete their forced-failure browser flows before closing #47. |
| Health Check result handoff | **P2 — the assessment is honest, but its visible email/link controls do not carry the result.** Email opens an untargeted draft with `[results URL placeholder]`; link copies the unchanged page URL while answers remain in memory/localStorage, so a clean browser starts over. The separate progress-save flow already has a working seven-day resume serializer; PDF correctly opens print. | Reuse the state-bearing resume URL for final link/email actions, describe draft-vs-send truthfully, handle clipboard refusal and prove the same completed result opens in a clean session. |
| Automation manual-run feedback | **P2 — execution state is accurate but the immediate notice is not.** Failed email/webhook/task actions produce a durable `failed` run and diagnostic, yet the endpoint wraps it in `ok:true` and “Run now” labels every non-waiting outcome “Live flow completed.” | Branch on failed/skipped/succeeded, display the final run error immediately and add forced action-failure browser/component coverage. |
| Business OS destinations | **P2 — the assistant is honestly labelled scripted, but its current action chips are stale.** The mounted reply catalogue links phase, company, bridge and recommendation prompts to seven retired/missing HTML files; human prompts/footer use bare `https://wa.me/` without a recipient. After Health Check, the Toolbox also unlocks five cards whose `/resources/*` routes do not exist. | Retarget every emitted action/card to the current BOS, implemented tools, Health Check or configured support; reject missing rendered links in tests and click representative cards/prompts in browser acceptance. |
| Public AquaCRM founder film | **Resolved 2026-08-26 by failing closed.** Neutral platform proof remains visible; the absent film player/controls start HTML-hidden and reveal only when the configured URL validates to a YouTube id. The internal setup instruction is removed. | Live `:3032` acceptance found no dead CTA/instruction and confirmed the player is `display:none`; **2/2** checks pass. Full playback/control/failure acceptance is required if an approved source is enabled later. |
| Public portfolio POS tour | **Resolved 2026-08-26.** Empty checkout is disabled; a populated demo payment announces its amount/item count, clears the basket, states no card was charged and offers reset. | Live `:3032` acceptance proved empty, three-item **£14.00**, cleared/disabled and reset states; **2/2** contract checks pass. This is explicitly simulated, not real payment collection. |
| Public brand navigation | **P2 — current Milesymedia shells silently hand users to AquaCRM.** Tools, Health Check, Portfolio and Client Centre identify as Milesymedia, while Home and Contact use `/`/`/#contact`; the root rewrite serves AquaCRM branding and its enquiry form. The public-site registry treats the two as separate sites/origins. | Define canonical home/contact routes per brand or a deliberate co-branded transition; inventory and browser-click all public logos, Home, Contact and primary CTAs. |
| Notepad autosave lifecycle | **Code/behaviour resolved 2026-08-26; forced browser-failure acceptance pending.** Every edit has a recoverable local draft until server confirmation; selection/view/back flush, exit warns and keepalive-flushes, reload recovers only newer drafts, and failed saves expose Retry. | TypeScript + Notepad **3/3** pass; mounted `:3032` opens. Force route/tab exit and offline/refused save through retry and exact reload before closing #54. |
| Existing-client phase transitions | **Code/behaviour resolved; mounted visual acceptance remains.** One stable operation checkpoints plugin, variant, checklist, stage and activity work; incomplete steps stay retryable and all three mounted controls retain and show the saved partial state. | Focused lifecycle proof is **21/21**. Complete the live transition/retry/reload browser walk; do not reopen the former non-resumable source defect. |
| Fulfillment lifecycle regression | **Resolved.** The nested suite follows all seven Aqua/churned rows, drives every active hop and checks the current plugin/starter/checklist plus transition soft-fail contract. Direct jump and partial creation retry have focused companions; `smoke:all` explicitly includes the suite. | Focused lifecycle/navigation **43/43**, wider creation gate **75/75**. |
| Read-failure truth | **Named source-level fallback class repaired; mounted/live acceptance pending.** The original editor/attention/KPI/history/phase/search/sender/inbox paths plus client/customer Finance, Health/Radar/Fulfillment, contact/interactions, Meta, commercial/manual detail, Identity and governance scope now distinguish loading, confirmed empty, retained-confirmed and unavailable. Delayed responses are fenced, retained snapshots cannot authorise writes and partial evidence cannot generate healthy totals or ordinary empty copy. | Exact final named-source proof is **54/54**; the earlier interactive-read/utility gate is **14/14**. Force rejection/retry, lost response, multi-tab and live-provider recovery through mounted acceptance before fully closing #57. |
| Utility action settling | **Code complete; mounted rejection acceptance remains.** The five audited controls now use one checked attempt, settle pending state in `finally` and distinguish unavailable/retry, copied and copy-refusal outcomes. | Focused and widened proof is **94/94**. Finish literal mounted fetch/clipboard rejection and retry acceptance. |
| Contract + template retry | **P2 — a partial second-step failure duplicates the contract on retry.** The editor creates a random-id contract, then optionally creates a reusable template. If template creation fails, it reports the partial outcome but retains create mode with no returned contract id; Save again creates another draft first. | Adopt the created id immediately or make template creation an independent/idempotent retry; fault-test second-step failure and prove one contract/one template after retry and reload. |
| Customer portal aggregate | **P2 — every built-in page computes the full model twice.** Layout chrome/attention and the body call the un-memoized aggregate independently. Production can repeat Finance, raw enquiry and four inbox queries—up to 12 backend reads—and chrome/body may reflect different snapshots. | Share one request-scoped result or cache normalized low-level reads, preserve explicit unavailable state, add backend call-count/snapshot tests and measure the live route. |
| KPI target persistence | **P1 — the mounted editor can diverge from agency truth.** Edit/reset/suggestion writes React state and localStorage first, fire-and-forgets the server POST and suppresses initial-load failure. The same browser can keep the new plan while the server and another operator retain the old one; file-store false acknowledgement from #16 compounds this. | Make acknowledged server state authoritative, retain visible retryable intent, then fault-test edit/reset/suggestion plus reload and a second session against one durable version. |
| Email Sender disabled-provider truth | **Resolved 2026-08-26.** Provider `none` refuses before `sending`, leaves rows queued, returns HTTP 409 and cannot create an external reference, `sentAt`, `email.sent`, active provider state or green health. Provider changes reset readiness; successful Postmark/SMTP delivery alone establishes `active`/`testedAt`. | Module behavior/typecheck pass (**23/23**). Consumer-specific false milestones remain separately open in #32/#39; production setup/verification remains #43. |
| Email Sender setup | **Code/behaviour repaired; live-provider browser acceptance remains.** Mounted Settings writes encrypted Postmark/SMTP credentials and sender identities to the store used by delivery; secrets return masked, Postmark verification uses provider evidence and SMTP is a real bounded TLS/STARTTLS path. | Foundation/module proof is **47/47**. Browser-prove fresh install → credentials → provider-confirmed sender → accepted test message → signed webhook with real Postmark or SMTP credentials. |
| Manifest plugin settings | **P2 partly repaired.** Shared settings are reachable across the registered families; Marketing, Website Editor, Fulfillment and Memberships now consume truthful retained fields, and unwired controls identify themselves at the input. Memberships applies its plan-trial default, safe billing-return target, member heading and fully gated annual cadence. The keyed source-derived inventory is **12 manifests / 35 fields: 32 consumed, 3 unwired** (2026-09-02: Finance's unenforced approval threshold, Ecommerce's unread publishable key, Leads Pipeline's unhonourable from-name, HR's stored-only leave auto-restore and PTO budget, Affiliates' unscheduled cadence and unenforced auto-approve window and Client CRM's unread custom-attribute schema removed; Ecommerce's low-stock threshold, Leads Pipeline's default source and capture-column label, and Client CRM's default tags and signup mirror now consumed); it no longer mistakes an unrelated Leads CSV `defaultTags` key for a Client CRM settings consumer. | Focused Memberships **65/65**, adjacent **90/90** and changed-surface **145/145** pass; exact build `bcNH7NEvlzmp6z1VXtmch` browser-proves Memberships settings/controls within the **40/40** four-viewport matrix. `smoke-ecommerce-low-stock-default` **3/3**, `smoke-leads-pipeline-settings-consumers` **4/4`, `smoke-client-crm-settings-consumers` **4/4** plus the manifest-pinning suites. The three remaining fields (HR staff-edit permission, Public Funnel redirect and session cookie) are safety-shaped access/session controls awaiting a security decision, not settings chores. |
| Plugin health monitoring | **Resolved at the bounded runner/persistent-evidence boundary.** Enabled hooks run concurrently with timeouts, the agency sweep persists host-owned result and age, and Radar keeps unsupported, never-run and stale checks as absent evidence while current failures remain visible. | Focused route/sweep/Radar/read-path proof is **65/65**. Retain live scheduling/provider acceptance as an operational gate. |
| Client custom-portal build | **Code/path resolved; mounted provision/reload acceptance remains.** The dead `portal-export` wizard is removed; “Build custom portal” now opens the canonical Systems workspace and its real `/api/tenants/client-projects/provision` action. | Focused navigation/route truth is **57/57**. Browser-prove provision → durable property → reload → publish/deploy with configured providers. |
| Client project lifecycle | **Resolved at the recorded partial-success boundaries.** Provision, GitHub publish and Vercel preview deploy persist immutable intent/provider recovery tokens, adopt exact matching side effects and refuse changed-intent key reuse without suffixing or duplicating resources. | Focused recovery is **20/20**, coordinator proof **4/4**, and route/Next contracts **30/30**. Configured-provider mounted acceptance remains under #36. |
| Private uploads | **P1 partly repaired with one shared recoverable lifecycle.** Claim/commit now require the exact provider/key/cardinality binding and claim ids fence unrelated callers. Stable payload-bound social retries work across both mounted inbox implementations; known owners recover to ready. Expense intents/URLs/attachments and campaign asset identity are authoritative, while website/client routes reject malformed, duplicate or mismatched bindings. Definite pre-owner-write refusals release only the exact claim; ambiguous or post-write outcomes retain it. Existing recoverable deletion, legal/SOP/Development lanes and reentrant Postgres transaction work remain intact. | Private lifecycle **33/33**, Finance **39/39**, Meta **6/6**, Legal **21/21**, SOP **18/18** and Postgres/client composition **7/7** pass. Still required: live Supabase/Vercel Blob/local-production providers, real process-kill/multi-process DB leases, mounted forced-failure/retry, automatic retained-claim reconciliation/operator UI, direct call-recording ambiguity recovery and the separate SOP-retirement policy. |
| Close the deal | **P1 — agreement status and delivery are not truthful.** The form can create a title-only contract directly as sent; the customer portal can accept it without terms/document, and the success UI claims “Contract sent” although the route never invokes transactional delivery. | Require a reviewable version, route through canonical publish/send semantics, return the delivery outcome, and browser-prove the exact version from close through customer acceptance. |
| Commercial proposal delivery | **P1 — explicit email failure is recorded as sent.** Leads Pipeline receives `delivered:false` from its real Email Sender adapter but still marks proposal/invoice sent and stamps payment receipts as sent. | Persist queued/delivered/failed separately, advance milestones only on delivery, retain message/error state for retry, and prove provider refusal plus successful retry. |
| Commercial proposal integrity | **P1 — acceptance/payment are not version-bound.** A draft public token can be accepted; later edits overwrite an accepted pack while retaining accepted status/time, and price/cadence edits retain the prior Stripe Checkout URL. | Create immutable sent versions, require sent state for acceptance, record accepted version/hash, draft amendments, invalidate stale Checkout, and prove public refusal/stability in browser tests. |
| Commercial installments | **P1 — subscription stop is not guaranteed.** Final-installment cancellation ignores Stripe's response and the webhook still returns success; manual Stripe rows count toward completion, and repeated ceiling-rounded charges can exceed the displayed total. | Persist an exact installment schedule and cancellation lifecycle, count provider invoice ids, allocate the remainder precisely, retry/reconcile cancellation, and prove no extra collectible invoice. |
| Data integrity | **Broad field-level reference work remains; the audited client-route, website and retirement slices are fixed.** Identity Resolution, Inbox, People, Dev Projects, Performance Experiments and Plugin Settings require a resolved scoped client; the focused route chain passes **55/55**. `readAgencyWebsite()` returns null and Marketing shows an unconfigured state. Membership/Affiliate parent deletion and current SOP reference writers now enforce dependency-safe RESTRICT; other task/template, product, KPI, Custom AI, Development, People/Team Chat, Inbox Connection, Finance, HR, Marketing, Leads Pipeline, Client CRM, Memberships and Email Sender field references still require the documented wider audit. | Continue per-handler/per-field validation or explicit stale-reference policy for the remaining matrix; do not reopen the fixed client-bearing routes, fabricated website default or dependency-safe retirement boundaries. |
| Lead archival | **P1 — the mounted “Archive lead” action is a hard delete with no restore and leaves its linked pipeline card snapshot behind.** A fresh memory probe observed the lead gone and the exact card id still listed. | Keep a recoverable archived row or label permanent deletion honestly; atomically archive/remove the linked card and fault-test reload, restore/purge and retry. |
| Membership/Affiliate retirement | **Code/behaviour resolved; mounted/live-provider acceptance pending.** Plan and Affiliate hard deletes enforce RESTRICT under the same durable graph lane as every child writer, including interrupted subscription/onboarding/identity claims. Mounted handlers return a structured refusal without changing the graph; unreferenced parents still delete and archive/removed remains the ordinary path. | Parent dependency proof is **28/28**; the wider retirement/recovery gate is **32/32**. Browser-prove refusal/archive/reload and complete live Stripe/Connect acceptance; any exceptional purge still needs an explicit financial-reconciliation design. |
| SOP retirement | **Code/behaviour resolved; historical repair and mounted acceptance pending.** One tenant-safe lifecycle lane powers dependency preview, service/mounted RESTRICT and every current incoming-reference writer, including nested client process steps. Missing/cross-agency ids fail before persistence and a delete-versus-guide race re-reads the post-delete state. | Dedicated dependency/writer proof is **22/22**; the wider SOP/dependent-domain gate is **52/52**. Audit/repair pre-existing dangling rows and mounted-prove refusal, reassignment and reload. |
| Company capital/governance | **Code/behaviour resolved; mounted acceptance remains.** The capital plan is validated atomically as one graph: duplicate/missing identities and references, over-allocation/paid value, voting contradictions and hard deletes that strand ledger links are refused with actionable conflicts. Company governance legal citations also share the legal-delete lifecycle lane. | Combined capital/Battle/legal/governance/role proof is **103/103** and the final legal-dependency suite is **21/21**. Browser-prove representative create/edit/refusal/delete/reload flows. |
| Battle Table history/concurrency | **Code/behaviour resolved; mounted two-tab acceptance remains.** Writes require a revision and stale saves return the current plan with 409. Locked quarterly reviews are immutable; numbered amendments preserve the original evidence and conflict rebase starts from the last server-confirmed plan. | Combined focused proof is **103/103**. Browser-prove two tabs, conflict recovery, lock, amendment, history and reload. |
| Legal-document retirement | **Code/behaviour resolved; mounted/provider acceptance remains.** One dependency inventory powers preview and deletion. Cited documents refuse purge; archive preserves references; explicit detach clears Finance/governance citations and the row transactionally; provider failure restores the row. Legal PATCH, Finance citation creation/update and Company governance PUT serialise their final read/check/persistence with deletion. | Existing dependency proof is **103/103**, the earlier widened Finance/legal checkpoint is **167/167**, and the final legal-dependency suite including governance and update/delete races is **21/21**. Browser- and provider-prove refusal, archive, detach, retry and reload before full operational closure. |
| Governance company scope | **Code/behaviour resolved; mounted switching acceptance remains.** Legal evidence, declarations, vendor agreement evidence, breach rows and erasure targets share the selected-company scope; deliberately group-wide sections say so. | Cross-company isolation and destructive-target coverage pass in the combined **103/103** gate. Browser-prove agency/Alpha/Beta switching, failure/retry, creation and reload. |
| Ecommerce checkout | **PARTIAL — NON-SECURITY CORE RESOLVED 2026-08-26.** Strict ids/quantity input now rejects browser money; server-resolved catalogue, price, currency, stock, discount, shipping and tax become one durable immutable checkout operation consumed at settlement. | Authorise the intentionally deferred guest/end-customer audience, then mounted/live-Stripe prove success/cancel URLs, reload and replay. Focused Ecommerce set **39/39**; TypeScript clean. |
| Ecommerce discount value | **CODE/BEHAVIOUR RESOLVED 2026-08-26.** Gift-card/custom-code value and pending issuance are operation reservations; paid settlement commits once, expiry releases, exact-zero works and full-refund restoration is replay-safe. | Complete mounted/live-provider lifecycle acceptance. |
| Ecommerce product retirement | **CODE/BEHAVIOUR RESOLVED 2026-08-26.** Ordinary Delete is Archive, retains stable product/dependants/history and authoritative checkout rejects archived/stale lines; no permanent-purge UI is exposed. | Browser-prove archive/restore, stale tabs and reload. |
| Ecommerce storefront bridge | **PARTIAL — NON-SECURITY CORE RESOLVED 2026-08-26.** Catalogue/search/cart/variant/quote/by-session contracts now share tenant/store-keyed Ecommerce DTOs and minor units. | Finish public-route authorization and a literal two-store browse → confirmed-order browser journey. |
| Ecommerce inventory | **CODE/BEHAVIOUR RESOLVED 2026-08-26.** Operation-owned reservations enforce capacity, resume partial work, expire/release and commit once; versioned admin edits preserve active state and reject conflicts. | Complete mounted two-cart/admin acceptance. |
| Ecommerce shipping/tax | **CODE/BEHAVIOUR RESOLVED 2026-08-26.** Configured fixed/weight/free rates, country, currency and inclusive/exclusive tax form one immutable quote used by Checkout Summary, provider lines and order. | Complete browser/live-Stripe acceptance. |
| Ecommerce order state | **CODE/BEHAVIOUR RESOLVED 2026-08-26.** A durable retryable inbox settles authoritative operations, commits/releases stock/value, handles cumulative refunds and constrains audited fulfilment changes. | Complete signed live-Stripe and mounted-transition acceptance. |
| Ecommerce reporting | **RESOLVED 2026-08-26.** Gross/refund/net/cancelled/pending and customer net spend are grouped by source currency; no mixed/refunded/cancelled face value is invented as GBP. | Dedicated reporting proof **3/3**; retain it in the canonical gate. |
| Ecommerce product authoring | **CODE/BEHAVIOUR RESOLVED 2026-08-26.** Server-owned ids, scoped compare-and-swap commands, recoverable slug migration, graph validation and lossless rich option/variant fields replace whole-row overwrite and identity loss. | Complete literal mounted two-tab conflict/rename/reload acceptance. |
| Aqua Advisor turn delivery | **Code/domain-behaviour repaired; mounted provider acceptance pending.** A client-stable operation, per-user lease and stored provider result precede one atomic visible pair+memory commit. Failure/reload resumes the same ids; stale attempts, replay and thread deletion cannot duplicate or resurrect history. | Dedicated **7/7**, widened Advisor/health **15/15**. Force literal provider/parse/storage/activity/response-loss failures and browser first/existing-thread reload before full closure. |
| Radar sweep scheduling | **Resolved at the typed scheduler boundary.** Infra runs once per tick, Evidence follows its declared schedule, failures are isolated per probe/tenant and overlap/retry remains idempotent. | Scheduler proof is **8/8**. A separate open product decision remains under #170: keep the deployment's daily probe cadence and show evidence age, or fund/restore sub-daily probes. |
| Application observability | **P1 partly resolved — server error capture is mounted and readiness is capability-based.** Next's request-error hook reports through the server capture boundary with request/tenant context, and a DSN without an installed SDK no longer reports ready. The cross-runtime graph is browser-clean and the production build is **245/245**. | Install and configure the chosen production client sink, then prove real browser/API faults reach it with delivery, flush and recovery. No live sink delivery is claimed. |
| Role-shell recovery navigation | **Code/behaviour resolved; mounted all-role acceptance remains.** Account and the portal 404 share the canonical role-aware destination for agency, client, freelancer, lead and signed-out identities. | Focused placement coverage passes within **103/103**. Browser-prove profile/back, permissions guidance and a bad deep link for each role. |
| Customer install onboarding | **Code/behaviour resolved; mounted install/revisit acceptance remains.** Support exposes the same shared install guidance as setup, and the prompt lifecycle cannot leave a spent install button active. | Customer setup proof is **18/18**. Browser-prove iOS/manual guidance, eligible accept/decline, close/reopen and installed mode. |
| Modal keyboard accessibility | **Code/behaviour resolved; representative mounted keyboard acceptance remains.** Every current TSX modal uses the shared stacked `useFocusTrap()` contract for deliberate initial focus, forward/reverse wrap, outside-focus recovery, optional Escape and opener restoration. Repository inventory prevents bypass; focused modal proof is **18/18** within the combined **29/29** accessibility run. | Browser-tab representative nested, destructive and form dialogs before closing mounted acceptance. |
| Loading-state accessibility | **Code/behaviour resolved; mounted assistive-technology acceptance remains.** The themed viewport loader exposes exactly one polite atomic root status, hides decorative geometry only, preserves surrounding chrome and hands off through the split curtain. The focused loader suite passes **7/7**, and mounted Editor boot is visually/browser clean. | Verify actual screen-reader announcement/removal and focus continuity through route/workspace transitions. |
| Responsive/accessibility verification | **Resolved as a repeatable local-browser gate.** `browser-matrix.mjs` drives real Chromium across 13 pages × 17 viewports, including all six primaries, 320×568, 200% zoom and both sides of every Tailwind breakpoint. Chromium **151.0.7922.34** completed all **1,326** required production-target checks as **1,177 passed / 0 failed / 149 observations / 0 missing**. The corrected harness authenticates once and reuses isolated browser storage state; the post-fix Settings 17-viewport slice accounts for all **102** checks as **92 passed / 0 failed / 10 observations / 0 missing**. Every observation is an explicitly evidenced aborted speculative Next RSC prefetch, not an ordinary request failure. | Dialog/menu activation, screen-reader output, installability, forced errors, date boundaries and mutation journeys remain separate acceptance work. |
| Composite-widget accessibility | **Code/behaviour resolved; representative mounted keyboard acceptance remains.** Specialised tabs/menus/listboxes now use the promised shared keyboard model or honest native navigation; the inventory and shared contracts cover arrow/Home/End, activation, Escape/return focus and reachable options. The suite passes **23/23**. | Browser-walk Settings, People, file tabs, Profile/Company menus and the page picker. |
| Accessible control names | **Code/behaviour resolved; mounted accessibility-tree acceptance remains.** Named internal actions, modal closes, Automation rows, Command regions and published-form families expose contextual programmatic names; placeholders are not labels, decorative icons stay hidden and status/error changes announce. Inventory proof passes **11/11**. | Inspect representative Team, Development, Automation, modal and published-form accessibility trees. |
| Date-only business records | **Code/domain-behaviour repaired; mounted boundary acceptance pending.** One explicit Europe/London calendar contract now owns the affected New Client/conversion, expense, Finance, HR and People defaults; valid date-only records round-trip unchanged, remote browser zones cannot change them and payment terms use calendar-day arithmetic across DST. UTC export/provider stamps stay explicit. | Focused **5/5**, affected People/Finance/HR **56/56**, adjacent client-plan/Leads **61/61** and TypeScript pass. Browser-save/reload/export representative forms at a controlled midnight/DST boundary. |
| Root error recovery | **Code/behaviour resolved; production root-fault acceptance remains.** The real self-contained `app/global-error.tsx` owns `html`/`body`, carries the digest, offers retry plus a hard-document escape and does not depend on the failed layout/provider. The observability suite pins both boundary claims. | Production-browser fault a child segment and root-layout initialisation; verify correct fallback, capture and recovery. |
| Customer PWA installability | **Code/assets resolved; mounted lifecycle acceptance remains.** The manifest serves genuine 192×192 and 512×512 `any` plus safe-zone-tested maskable PNGs; the prompt tracks one-use, dismissed and installed states. Customer setup proof passes **18/18**. | Validate the served manifest and browser-prove eligible, accepted, dismissed, already-installed and ineligible states; keep #134's revisit lifecycle separate. |
| Published-block hydration | **Code/SSR behaviour resolved; mounted navigation acceptance remains.** Share Buttons and automatic Breadcrumb now have byte-identical server/first-client trees, inert pending targets and isolated post-hydration derivation. Block-library proof passes **50/50**. | Browser-prove current-path/social/copy behavior across navigation with zero recoverable hydration warnings. |
| Private media playback | **Code/provider behaviour resolved; mounted playback acceptance remains.** One provider-aware contract emits exact `200`/`206`/`416` and range headers; local reads open only the window, Supabase forwards ranges and Vercel streams/slices without whole-object buffering. All private routes use it; proof passes **8/8**. | Browser-prove metadata preload, prompt playback and seeking for inbox, calls and large SOP media. |
| Voice/call capture | **Code/behaviour resolved; mounted cross-browser acceptance remains.** One recorder lifecycle negotiates Opus WebM, WebM, MP4 and browser-default; names the actual file type, distinguishes failure classes, releases tracks and compensates calls. Website voice, Unified Inbox and calls share it; proof passes **10/10**. | Browser-test real WebM, MP4/default and unsupported environments plus upload/navigation fault compensation. |
| Published countdowns | **Code/service-behaviour repaired; mounted acceptance pending.** Relative units become one stored deadline at block create/save/publish; legacy reads use stored page timestamps, edits reset once, invalid targets expire and hydration begins from identical placeholder markup. | Dedicated duration/page lifecycle **5/5**, draft/publish **25/25**, full Website Editor **49/49 files**. Mount the actual effect with a fake clock and browser-prove published expiry plus zero hydration warnings. |
| Team Chat / attention response order | **Code behaviour repaired; mounted acceptance pending.** Chat selection/load/poll/send is generation-bound. Notification refreshes are latest-request/mutation guarded; per-alert queues merge and roll back only their target while representing concurrent rows independently. | Reversed coordinator **8/8**, full attention/People **80/80** and TypeScript pass. Mount both providers with deferred fetches, then browser-prove rapid switching and overlapping actions. |
| Storage/provider deadlines | **Code/behaviour repaired for the named direct paths; mounted/live-provider acceptance pending.** Shared storage/provider budgets compose caller aborts and hard-settle even if an adapter ignores the signal. Supabase, Twilio, Resend, Vercel-domain, Leads Stripe, Shopify and OpenAI emit credential-free duration/status events. A failure after a write starts is explicitly `outcomeUnknown`: reads retry safely, idempotent writes reuse the operation key and non-idempotent writes reconcile first. Shared Sandbox fences prevent OpenAI/Shopify network calls even with live-looking credentials. | Focused deadline/provider/Sandbox regressions and TypeScript pass. This is deterministic adapter proof, not real-provider timing. Exercise stalled, late-accepted and definitive-refusal outcomes against configured providers and deployed telemetry before live acceptance. |
| Customer Bookings | **Code/behaviour resolved; mounted acceptance pending.** Account activity is registry, exact-client-install and operational-contract driven. Orders can appear with ecommerce; Bookings remains hidden because no booking lifecycle exists, including under stale registered/enabled install data. Its direct URL stays honestly unavailable. | Capability **4/4**, focused nav **2/2**, surrounding customer/plugin hosts **34/34**, TypeScript pass. Browser-prove no-capability, Orders-only and direct-Bookings states before Shipped. |
| Social Inbox header actions | **Code/behaviour resolved; mounted visual acceptance pending.** The inert More ellipsis is removed. Assign and Close/Reopen remain native buttons backed by real conversation mutations, so the header exposes only operational outcomes. | Dedicated **2/2**, focused header/reply/search **15/15**, wider Inbox/Search **53/53**, TypeScript pass. Browser-confirm an active thread at desktop/mobile widths and stable focus order. |
| Dev Team live-file performance | **Resolved for the bounded local/isolated-production and representative-browser phase.** Home no longer reaches the recursive roadmap/task/worker graph. Library scans only the 20 canonical documents, dynamically loads the selected view and does not prefetch sibling query views. Logs streams before the scanner/edit ledger, shares a compact exact-count snapshot and bounds the filesystem index. The non-destructive <2 GiB startup preflight remains. | Retained local measurements remain **4.428→3.290s cold / 146→142ms warm** for Library and **3.182→0.857s first / 2.702→0.868s post-TTL** for Logs. The current isolated production benchmark measured Library **803.6/30.4ms** and Logs **892.8/30.7ms** fresh-process first/repeat-max, both 200 and in budget. Desktop/mobile mounted acceptance is green. Deployed geo/CDN/provider latency remains operational acceptance. |
| Client-workspace 404 console | **Code/behaviour repaired; mounted console acceptance pending.** Root colour/sidebar bootstraps use identified Next 16.3 `beforeInteractive` components, preserve synchronous storage behavior and leave no raw root script; absent clients abort before chrome. | Dedicated **4/4**, focused **23/23**, wider client/navigation/editor-layout **125/125**, TypeScript and the later **245/245** production build pass. Browser-prove valid/missing/generic-404 direct and client transitions with zero console errors and preserved state. |
| Page performance / hidden read writes | **The bounded speed phase is complete, not a deployed performance claim.** Agency retains station-only construction, intent-loaded Search, suppressed development prefetch, an idle session monitor and static manifest. Its retained dev baseline was **3.8s compile + 315ms app cold / 784ms warm** and the static proxy import closure fell **1,139,995→255,050B (-77.6%)**. The current isolated production Agency/Dev Team fresh-process first HTTP is **949.4/869.2ms** and repeat max **53.1/38.9ms**. | A cacheless, service-worker-blocked Chromium context per station passed **8/8** first-load transfer probes. Day transferred **674,535B** of JS/CSS; extra versus Day was Executive **4,473B**, Battle **36,102B**, Calendar/Actions **42,174B**, Advisor **12,528B**, Dev Team **21,059B** and Radar Inspector **34,731B**. These are transfer bytes, not execution/paint budgets. Measure deployed geo/CDN/provider latency separately. |
| Realm/access-sensitive runtime caches | **Resolved for Radar, Portal Search and Dev Console.** Every named cache captures the active data realm before asynchronous work and stores realm-keyed slots. Search additionally keys by identity, role/client, `accessRev` and the effective workspace/client element fingerprint; restricted Staff candidate families are filtered before indexing. Dev Console supports deliberate current-realm/all-realm invalidation rather than one shared global slot. | Deterministic alternating live→empty/demo→live regressions prove identical agency/user ids retain distinct clients, contacts, messages, finance, Radar candidates and Dev Console titles/counts/findings/blockers. Revocation changes the Search key immediately. Continue this rule for every new module-global cache. |
| Showcase | **Audited public boundary and fixture isolation repaired.** Known mutating GET/OAuth/materialisation capabilities are blocked before handlers; public showcase has a dedicated seed-once tenant instead of resetting the owner's demo fixture. | Keep every new read-side mutation explicitly classified; the wider non-showcase read/render mutation inventory remains under #21. |
| Client erasure | **Failure/retry contract repaired and behaviorally verified.** Hosted/plugin failures preserve the local client, record de-identified outcomes and return retryable HTTP 502; a successful retry completes local deletion and the permanent audit contains no client name. | Run provider-backed acceptance before production use and retain the forced failure/retry regression. |
| Staff access | **Canonical capability policy is active; mounted role authoring and isolated Staff Technical enforcement are browser-proven.** Proxy, Staff navigation, workspace pages and tested APIs share one Hidden/View/Manage policy. Portal Studio uses the same exact Portals level: View inspects only, Manage saves/publishes, Hidden is refused; every write re-reads a downgrade and foreign-client scope stays closed. Existing element-specific People DTOs and hidden navigation remain intact. | Direct policy/Portal update rerun passes **18/18** and the wider authored Staff policy gate is **35/35**. A real browser created a reusable role, saved Projects as Manage, reloaded, downgraded it to View, reloaded and archived it cleanly. Staff Technical passed **50/50** through six same-cookie Hidden/View/Use/Manage/downgrade transitions; valid streamed not-found content covered hidden routes and the exact downgraded API returned 403. Fulfilment exposes **11** element radiogroups with 11 each Hidden/View/Use/Manage at 390px and 1280px. Provider-backed live-persona/shared-credential acceptance remains; manager-only AI/project/Developer controls stay restricted. |
| Portal Studio sample preview | **Resolved and production-browser verified.** The synthetic sample is explicitly preview-only, always opens an editable template scope, disables the Client override choice and is rejected with 403 at the client mutation boundary without creating a client or portal instance. | Focused sample/update-route proof is **29/29**, the wider editor/tenancy/access set is **111/111**, and Chromium at **390×844, 1024×768 and 1440×900** produced only template-scope sample API 200s, no client-scope request, no overflow and no console/page/request/HTTP errors. |
| Finance event delivery | **Resolved at the durable provider-identity boundary.** Refund and dispute rows use deterministic provider identities; the process-local event-id set is only a warm-process shortcut. | Independent file-process races and fresh reload prove one row and one side effect per event family (**4/4**). Live signed Stripe acceptance remains. |
| Documentation | **20 canonical Library volumes, refreshed 2026-09-02 with runtime compatibility preserved.** | Nine authored subject volumes retain all **152 Markdown sources / 574,466 words** verbatim with original paths and SHA-256 provenance; eleven generated-reference documents remain. Focused authored-consolidation and Dev Docs gates pass **30/30**. The founder-facing Dev Docs/Library index is exactly **20**. Compatibility fragments remain on disk only because Roadmap, Plans, Findings, Tasks and Updates still use them as live records. |

These are tracked as permanent issue ids in [issues.md](issues.md), currently through
**#186**. The earlier
**3,621/0/1** result alone closed none of them because it did not exercise every
failure mode; later closures are marked with their 2026-08-25 source, behavioural
and browser evidence.

## Known NOT fully usable (verified from source — don't assume these work end-to-end)

> **Superseded wording inside dated rows:** references below saying the login
> route has no MFA or that the Stripe package is not installed describe earlier
> checkpoints. Current source has all four MFA phases and `stripe@22.5.0`; the
> remaining Stripe gap is the real-account Checkout/webhook/refund walk. Rows are
> retained for their verification history, not as current blocker declarations.
>
> **Browser override, 2026-08-25:** dated rows below that say a route had never rendered are
> historical at their own checkpoint. The current isolated read-only pass has rendered the broad
> public, agency, client, customer, Development/Editor and Dev Team route sets plus representative
> 1280/768/375 layouts. That override proves reachability and visible layout only; it does not turn
> any unperformed save, provider, alternate-persona, failure or reload journey into a pass. The
> current browser boundary is recorded in the table above and the ultra-review ledger.

| Feature | Reality | Source |
|---|---|---|
| Dev Team → **the finish pass** (icons · accuracy · `?station=devteam`) | **Code-complete, behaviourally tested and browser-rendered.** The 2026-08-25 isolated pass recorded the old 9.2s Home/4.7s Logs baseline; #151 replaced repeated warm traversal with a coalesced bounded index. The 2026-09-02 isolated production rerun measured Dev Team **869.2/38.9ms**, Library **803.6/30.4ms** and Logs **892.8/30.7ms** fresh-process first/repeat-max, all 200 with empty failure lists. The broad responsive matrix and corrected exact-width probe are green. Deployed geo/CDN, live-provider and production-telemetry timing remain open. | `src/app/portal/dev-team/layout.tsx` · `src/lib/server/{devTeamBoard,devTeamAuditor,devTeamWorkers,devMarkdownCache}.ts` · `src/app/portal/dev-team/` · `scripts/smoke-dev-team-{portal,perf}.test.ts` · [issues #151](issues.md) |
| Dev Team → **API & MCP** (`/portal/dev-team/api`) | **The historical P0 is resolved at the shared session boundary.** The 2026-08-19 browser walk exercised create → reveal once → rotate → revoke and remains useful UI evidence. The later old-cookie exploit is now refused after owner→staff downgrade: `resolveFreshSessionUser()` revalidates user existence, session revision, current role and live membership for every shared session read, and the regression passes **16/16**. Deployed multi-instance immediacy still depends on the live storage backend's freshness. | `src/app/api/portal/settings/external-ai/route.ts` · `src/lib/server/auth/auth.ts` · [issues #22](issues.md) |
| Dev Docs — in-app docs browser (Phases 1–3, plan complete) | **Code-complete, behaviourally proven and browser-rendered; bounded-index code repaired.** The old browser baseline was 6.4s server/5.1s application. The index is now coalesced for 15 seconds, generation-safe, immediately invalidated by in-app saves and prefix-aware for `.next-*`; external edits have a declared at-most-15-second visibility delay. Browser route re-timing remains under #151. | `lib/server/dev/{devDocs,devDocEdits,devMarkdownCache}.ts` · `app/portal/agency/dev-docs/{page,_DevDocsIndex,_DevDocViewer,_DocMarkdown}.tsx` · [`smoke-dev-{docs,doc-edits,team-perf}.test.ts`](../../scripts/smoke-dev-team-perf.test.ts) · [plan](plans/dev-docs.md) · [issues #151](issues.md) |
| Connect flow (`/connect`) | **All 4 phases code-complete + server-runtime-verified; only the code-step browser walk remains.** A 6-digit code is generated, HMAC-hashed + stored (15-min TTL), emailed via `POST /connections/request-code` (session's own email, magic-link-styled), verified in constant time, single-use, with resend; brute force is contained (locks after 5 wrong; verify 20/15min per IP+user; sends 5/15min per connection); the UI shows a live expiry countdown, disables a spent code, and makes resend the next move. **Runtime-verified (not just green):** an in-process harness drove the *actual route handlers* (real session + memory backend) — **13/13** (refuse-without-sender, real-code-completes, wrong/replay refused, lockout+resend-reset, send-throttle 429, dev bypass). The invalid-link page also rendered in the real Next runtime. **Sender gate is closed:** the local environment has both Resend variables and `inspectProductionReadiness()` reports email ready, matching the shipped plan and issue #5. **Remaining:** drive the seeded connection/customer code step in a browser, including countdown, wrong code, resend, completion and destination. | `connectionConfirmation.ts` · `server/portalConnectionStore.ts` · `api/portal/connections/request-code` · `app/connect/[connectionId]/_ConnectFlow.tsx` · [plan](plans/connect-flow-real-codes.md) · [issues #5](issues.md) |
| Dev Mode — demo-persona POV switcher (all 4 phases) | **All four seeded POVs are browser-rendered on the isolated `:3032` runtime.** The real Inspector entered Owner (`/portal/agency`), Staff (`/portal/team`), Customer (`/portal/customer`) and Freelancer (`/portal/freelancer`) and restored Ed's original owner session. The corrected Customer POV reaches its own customer chrome; all customer sections plus Memberships/Affiliates rendered. The later non-security pass repaired staff Team Chat proxy access and the Freelancer overflow found by this walk. The switcher remains founder-only on entry, fenced to `demo-agency`, and authorises switch/exit through the signed return marker. Behavioural smoke remains 28/28. This proves seeded navigation/rendering, not mutation workflows or non-demo identity provisioning. | `app/api/auth/dev-mode/route.ts` · `lib/server/{devModeAccess,demoSeed}.ts` · `components/chrome/{ProfileMenu,DevModeSwitcher,DevModeLoadIn}.tsx` · `app/portal/layout.tsx` · [plan](plans/dev-mode-demo-profiles.md) · [issues #25 and #137](issues.md) |
| Freelancer workspace + management + preview (P1–P6) | **Code and mounted in-process journey complete; the seeded read surface was previously browser-rendered at 375, 768 and 1280px.** It shows only assigned jobs under the configurable privacy-first policy. P6 adds resumable remote identity/setup, shared deliverables, private work upload/download and direct owner messaging. Real provider/email/password-reset login and mutation/reload remain unwalked in a browser. | `server/{freelancerAdmin,freelancerWorkspace,staffProvisioning}.ts` · `api/{auth/preview-as-freelancer,portal/freelancers,portal/freelancer/{submit,message,work},portal/freelancer-access}` · `app/portal/{freelancer,agency/freelancers,agency/freelancer-access}/` · [`smoke-freelancer-real-journey.test.ts`](../../scripts/smoke-freelancer-real-journey.test.ts) · [plan](plans/freelancer-workspace.md) · [issues #8, #112 and #137](issues.md) |
| Enquiry detail card (Phase 1) | **Code-complete, typecheck-clean, full smoke suite green (1574 pass / 0 fail); browser-verified end-to-end on `:3032` — the modal renders with data (both layers, consent, comms, internal scroll).** Clicking an enquiry in the Master Inbox now opens a focus-trapped **modal** (Ed's decision, over side-drawer / in-place-expand) that mirrors the submission in two layers: **A) what they submitted** — every `formCapture` field in the form's own submission order, *plus* the answers Aqua has no column for (now shown in full, previously only counted); **B) Aqua's contact record** — **consent-first** (given / not given / not recorded, with purpose + version + captured date, never surfaced before), then classification, services, source, triage, timeline, linked lead/contact/client. Reuses `EnquiryCommunications` unchanged. Extracted out of `_MasterInbox`'s inline expand into `_EnquiryDetailCard.tsx` (one section-level modal, so the row's `mm-hover-lift` transform can't capture the fixed-position modal). **Verified:** `tsc` clean; 5 existing source-shape contracts retargeted to the card (the asserted strings legitimately moved) + a new behavioural smoke (`smoke-enquiry-detail-card.test.ts`, 5 tests) pinning the modal + both layers + consent + composer reuse. **Browser-verified (this session, in-app browser on `:3032`):** the Master Inbox + Enquiries view render the refactor with **zero console errors** (HMR live), and the **modal itself was rendered with a full mock enquiry** (the dev seed carries no enquiries, so a throwaway `/carddemo` route mounted the real component with mock data, then was deleted) — confirming end-to-end: header + triage pills + close; **Layer A** shows every `formCapture` field in submission order **plus** the "Also captured — beyond Aqua's standard fields" extras in full; **Layer B** leads with **"Consent given"** then the contact record; the **reused `EnquiryCommunications` composer** renders (Email/Text/WhatsApp/Call, send-as, auto subject, message, send); and the body **scrolls internally between a pinned header and footer** (the `min-h-0` fix — body clientHeight 482 vs content 1595). The full *inbox-list → click Reply → modal opens → Close → back to list* flow was then exercised on the **real `MasterInbox`** with a dummy enquiry (a throwaway `cardsim` route rendering the real inbox with one in-memory `WebsiteEnquiry`, since deleted — no live-Supabase write): the actual `openForm → openItem → EnquiryDetailCard` wiring fired on the real Reply click, the modal opened over the dimmed inbox with both layers + extras + consent + composer, and Close reversed it (row button back to "Reply"). So the whole flow is browser-confirmed; the only thing never exercised is a genuinely *server-seeded* enquiry (dummy stood in), which changes nothing about the UI path. **Phase 2 (Import forms) shipped 2026-08-19** — `scanFormSchemasInHtml` extracts each form's field schema (name/label/type/required + capturable), `importFormSchemasForSite` (new `websiteFormSchemas.ts`) fetches SSRF-safe and stores them on `WebsiteSiteConfig.formSchemas`, an `import-forms` action + an "Import forms" button in the website-sources panel surface them. Logic + store-path + wiring test-verified (`smoke-import-forms.test.ts`, 12 tests; full suite 1697 green; tsc clean); **not browser-clicked yet** (live external fetch + shared `:3032`). **Phase 3 (Layout from schema) shipped 2026-08-19** — Layer A now mirrors the whole real form when its schema is imported: `mergeFormLayout` (new pure `enquiryFormLayout.ts`) overlays the submission onto the template (every field in order; blank where skipped; submitted-but-not-in-template kept as extras), `resolveFormSchemaForEnquiry`/`matchFormSchema` pick the template by host+form, a new agency-scoped `website-enquiries/form-template` endpoint serves it, and the card fetches it on open (graceful fallback to the raw submission). Merge/match/resolve + endpoint/card wiring test-covered (`smoke-import-forms.test.ts`; full suite 1709 green; tsc clean); the endpoint is **browser-confirmed live** on `:3032` (returns `{ok, schema:null}` fallback); the full seeded-enquiry template render wasn't browser-clicked (unit-tested `mergeFormLayout`). **Phase 4 (editable "Added by hand" contact layer) shipped 2026-08-19** — Layer B now lets the operator record what the form didn't ask (company, job title, notes, custom key/values) via a self-managing `ManualContactDetails`, saved to a new **file-backed, agency-scoped** `enquiryContactDetails.ts` store (keyed by enquiry id) through a new `contact-details` endpoint — **never touching the live enquiry row or `people.ts`** (a test guard asserts the route imports no `createSupabaseAdminClient`/`brand_enquiries`). Store + wiring test-covered (`smoke-enquiry-contact-details.test.ts`; full suite 1727 green; tsc clean); **browser-verified end-to-end** on `:3032` (type → Save → "Saved" → API-confirmed persisted → reload re-fetched + pre-filled). **Flagged follow-ups (commander):** flow manual details into the canonical `Person` on conversion; inline lead/contact/client re-linking (leads-pipeline). **Phase 5 (polish) shipped 2026-08-19 — the plan is COMPLETE (P1–P5).** Genuinely-empty fields now show a muted "—" via the `Field` helper (never an invented value — the fabricated campaign "Direct" is gone), while the deliberate distinctions (Preferred reply "This form did not ask" vs "Not supplied", consent, record/timeline states) are kept. Browser-verified on `:3032` (a sparse enquiry renders "—" for contact/services/campaign, no "Direct"). Two enhancements remain as **flagged, commander-coordinated follow-ups** beyond the plan: manual details → canonical `Person` on conversion; inline lead/contact/client re-linking. | `agency/inbox/_EnquiryDetailCard.tsx` · `_MasterInbox.tsx` · [plan](plans/enquiry-detail-card.md) |
| Client erasure (GDPR) — plugin data + live scrub | **CURRENT OVERRIDE 2026-08-25: failure-aware and retryable in source/behavioural tests.** Hosted and plugin scrubs run before local deletion; failure preserves the client, records de-identified outcomes and returns retryable 502; success removes local data and leaves a name-free audit. This is not a claim of live-provider acceptance. | `server/clientErasure.ts` · `api/portal/clients/[clientId]/erase` · [issues #24](issues.md) |
| Aqua Tag — tagged sites route to your own companies (Phase 1) | **Code-complete + logic-tested against the real store + suite-green; NOT runtime/browser-verified this session.** The routing keystone now resolves a tagged site's host to **inbox · client · company**: `resolveWebsiteSourceRouting` returns a `WebsiteSourceDestination` union (was a bare client-id string), `WebsiteSource` gains `destinationCompanyId`, and `add`/`updateWebsiteSourceRouting` validate the company (agency-scoped `getTradingCompany`) + enforce **client-XOR-company**. Both **live** ingestion paths (`form-capture`, `brand-enquiry`) record a company route (`routedCompanyId` in the enquiry metadata) and, per "the configured route wins", don't also file it onto a client. The Aqua Tags workspace gained a **"Route a site to one of your companies"** control (its GET picker returns the agency's companies); company cards link **"Set up Aqua tag →"**. **Logic-tested (not just green):** `smoke-website-sources.test.ts` extended — resolver→union, route-to-company, foreign-company refused, client-XOR-company refused, re-point client→company→inbox, + company assertions on both live-path source contracts. Full suite **1574 pass / 0 fail**. **Two honest gaps:** (1) **NOT runtime/browser-verified** — the routing route authenticates via headers-`getSession()`, for which this repo has no in-process request-scope rig (only request-based `getSessionFromRequest` routes, e.g. connect-flow/dev-mode, are driven in-process), and the one-`next dev`-per-folder hazard + no reach to the Commander's `:3032` blocked a browser walk → **Commander: verify Fulfilment → Aqua tags (`/portal/agency/fulfilment?view=tags`) → route a company's site → confirm it lists, and the company-card link.** (2) **No company-facing enquiry surface yet** — Phase 1 makes routing correct + recorded (attributed to the company, not misfiled), landing in the agency inbox tagged to the company; a company enquiry view is later (Phase 3+). **P3 update (2026-08-19):** the workspace now lives as the Fulfilment **Aqua tags** view (`?view=tags`, moved from the Command Centre route, now removed), and the agency routing panel `_WebsiteSourcesConfig` is **company-aware** too — both browser-unverified (nav). | `server/websiteSources.ts` · `server/types.ts` · `api/public/{form-capture,brand-enquiry}` · `api/portal/website-sources` · `agency/fulfilment/_AquaTagsWorkspace.tsx` · [plan](plans/aqua-tag-system.md) |
| Aqua Tag — consent-gated tag manager (injection layer, Phase 4) | **Store, endpoint, tag-side injection and the management UI are shipped; the served tag and the full configuration loop were BROWSER-VERIFIED.** A site can be configured to inject allow-listed tools (GA4/GTM/PostHog/Meta·Google·LinkedIn pixels/GSC) **by id/key only — no raw `<script>`** (each provider has a strict `valuePattern`; the value is the real guard since it becomes injected markup). `server/websiteInjections.ts` is the store (CRUD, agency-scoped, cap/dedupe/consent-validation); `GET /api/public/aqua-tag-config` serves a site's **enabled** injections (cached, CORS); `lib/aquaTagSource.ts` fetches it and injects each tool **only when its consent category is `permitted()`**, retroactively on consent, every recipe wrapped + `typeof fetch`-guarded. **Runtime-verified:** the endpoint via the **real route handler** in-process; the served `/aqua-tag.js` **parses in real V8 on `:3032`** (in-app browser — the definitive "no syntax break", form-capture intact, no `${` leak); config endpoint returns the safe `{injections:[]}` for an unknown key. **UI + full loop shipped + BROWSER-VERIFIED end-to-end (2026-08-19):** the managed API `/api/portal/website-injections` (agency-scoped CRUD + catalogue) + a **"Tools & injections"** section in the Aqua tags view. Walked live on `:3032` (real founder session): configure a GA4 id via the real APIs → the public config endpoint serves `[{ga4, G-…, analytics}]` → cleaned up; the workspace renders with zero console errors. **Remaining gaps to fully User-reachable:** (1) **per-client-key sites** resolve later (v1 = master key); (2) the inherent **"a real GA4/pixel script actually loads on a real external page"** needs a live tagged site — the whole config→serve pipeline is proven. | `server/websiteInjections.ts` · `api/portal/website-injections` · `api/public/aqua-tag-config` · `lib/aquaTagSource.ts` · [plan](plans/aqua-tag-system.md) |
| Perf — bundle split (lazy block registry · React Flow CSS) | **Shipped + BROWSER-VERIFIED on both routes + proven in a real production bundle.** Two load-timing changes, no behaviour change. (1) `blockRegistry.ts`'s 78 static block imports became `lazyBlock(() => import(…))` — **lookups stay synchronous** (`def.Component` renders directly; label/icon/`defaultProps`/`fields` stay static), so the palette, properties panel, `createBlock()` and `pageTemplates` never trigger a download, only rendering a block does. `next/dynamic` is unusable here (the registry loads under `--conditions react-server`, where it reaches `React.createContext`); `lazyBlock` is what Next's App Router compiles `next/dynamic` to anyway, plus a **per-block** Suspense boundary. (2) React Flow's 18.2 KB stylesheet moved off `globals.css` into the lazy `_AutomationsCanvas` chunk. **Browser-verified (own isolated sandbox, `:3043`):** the editor (`/portal/clients/cli_b08b038f527b9ffb/edit-website?mode=design`) renders **all 6 block types on the seeded page — `hero`, `section`, `heading`, `product-grid`, `testimonials`, `cta`** — with real content, including the **container recursing into its children** through the lazy boundary and the **cross-plugin `product-grid`** resolved via `RENDERER_REGISTRATIONS`. Nothing stranded at the `null` fallback; the block palette populates from static metadata with no block chunk fetched. Automations board renders the canvas with **both** the base sheet (`.react-flow__pane` `z-index:1; touch-action:none`) **and** the globals.css override (`cursor:grab`) live at once — the specificity argument holds in practice. **Scoping proven:** on `/portal/agency/marketing?view=automations` the stylesheet loads as its own chunk named `_AutomationsCanvas`; on `/portal/agency/contacts` it is **absent — 0 React Flow base rules**. Only console errors are 3 pre-existing 404s (`/api/portal/ai-builder/status`, `/api/portal/website-editor/funnels` — neither endpoint exists in the repo); **zero chunk 404s**. **The split is measured, not assumed:** static import-closure **84 modules / 346.7 KB → 2 / 58.6 KB**; and in a real `next build`, the route's **78 block modules resolve to 15 chunks, 0 of them shared with the registry's chunk and 0 in the app shell** — i.e. fetched on demand. (That build **compiled successfully**; it then failed type-check on three files owned by other workers — `marketing/page.tsx`, `marketingIntelligence.ts`, `DevConsoleButton.tsx` — none of them mine.) **Suite:** 2 fails, both reproduced with these changes reverted (other workers' in-flight `_DashboardCommandCenter` + dev-team sidebar). Guards added in `smoke-perf-easy-wins` + `smoke-website-visual-builder`, including one resolving **every** lazy loader to a real `blocks/*.tsx` with a default export — the new failure mode, mutation-checked. | `website-editor/src/components/{blockRegistry.ts,lazyBlock.tsx}` · `app/globals.css` · `automations/_AutomationsCanvas.tsx` · [plan](plans/dev-team-portal.md) |
| Marketing — data spine · pulse · marketing radar · live funnel (phases 1–4) | **Code-complete, runtime-verified in memory, behaviourally tested (31 new tests) and runtime-verified in memory (29/29) and `tsc`-clean for these files; NOT browser-verified — Ed called the walk off (too many workers on the box), so no page here has been rendered.** Marketing now *reads* rather than assumes: `lib/server/marketingIntelligence.ts` reshapes the 12 Radar `marketing` families, the `websiteSources` tag registry and live `brand_enquiries` into one spine, and `marketingCommandModel()` adds the KPI-registry pulse (`describeCommandKpis`, read-only) and the `commercialIntelligence.lineage` funnel off the **same** cached-radar read. Surfaced as the overview **Live data spine** panel, new `?view=pulse` and `?view=radar`, a live funnel board on `?view=funnels`, and real enquiry sources on `?view=sources`. **What's proven:** the shaping logic — unmeasured stays `null`/"—" and never becomes a fabricated 0, a demo session's absent enquiries report `available: false` (not "none arrived"), worst-lens-wins per family, direction-aware deviation, per-stage funnel conversion, honest degradation when the radar can't build. **Now runtime-verified in memory** (`scripts/verify-marketing-runtime.ts`, **27/27**): a fresh agency → a real Radar build → a real command-intelligence snapshot → real aqua-tag registry + injection reads → brand scoping, all driven in-process. **This caught a real bug the suite could not**: with no monitored properties the Radar emits `value: 0` / status `learning`, and the spine was reporting that as a *measured* zero — the funnel would have claimed "0 pageviews" for an agency that simply isn't being tracked. Fixed: only a lens that actually assessed something (`pass`/`critical`/`warning`/`watch`) can supply a reading; `blind`/`learning`/`inactive` zeros read as "—". A genuine assessed zero still shows as 0. **The same lie had a second route** — KPIs arrive pre-collapsed (`?? 0`) from `commandIntelligence`, so the pulse was still showing "0" traffic/forms; pulse metrics now carry `measured` and render "—" unless the status is assessed. **The upstream instance is flagged, not fixed** ([issues.md #15](issues.md)): the Command Centre's own commercial funnel still renders "Pageviews 0 · Aqua Tag" for an untracked agency — that is the KPI owner's file. **What is still NOT proven:** that any of the surfaces actually renders — these are server components reading a live radar build, and a static test passes even if a component throws. **The other real gap:** with no tag traffic in the sandbox every telemetry stage will legitimately show "—", so the honest-fallback path is the one a walk would mostly exercise; a seeded-traffic tenant is what would prove the populated path. **Also shipped (same session, decision-free):** real campaign attribution on `?view=campaigns` (`attributeEnquiriesToCampaigns` — exact `sourceKey` match stated as fact, name match labelled "Suggested match — confirm", one enquiry group claimed by one campaign, unmatched campaign names reported as gaps) and real demand evidence (enquiries by brand/source, 30 days) on `?view=customer-profiles`. Both **report only — no match is ever written back**, so the worst case of a wrong guess is a visibly labelled suggestion, not corrupted data. **Data sources, stated honestly on `?view=radar`:** each of the tag's seven injectable tools is reported as *reading back* / *sending only* / *not on any site*. **Only Google Search Console reads back today** (a real API sync → `type:"search"` telemetry → the Radar `search-visibility` family), and only once a sync has run. **PostHog is "sending only"** — that is the people-map's actual blocker, and it is now on screen rather than showing an empty map. Ed is integrating PostHog; enabling it is a one-line addition to `READ_BACK_PROVIDERS`. **Brand scoping (enquiry half only):** selecting a brand narrows enquiries via the tag routing registry (`destinationCompanyId`), not a slug match — trading-company and trading-brand slugs are different id spaces, so a slug match would have silently read zero. Traffic stays agency-wide and the UI says so. **This is the piece most worth a real walk**, because it depends on Ed's registry actually having `destinationCompanyId` set on his sites — if none are routed to a company, a brand-scoped view legitimately shows 0, and only looking at real data distinguishes "correctly zero" from "registry not filled in". **→ Commander / a quiet server:** walk `/portal/agency/marketing` (overview panel), `?view=pulse`, `?view=radar`, `?view=funnels`, `?view=sources`, `?view=campaigns`, `?view=customer-profiles`, and the same with a brand selected. | `lib/server/marketingIntelligence.ts` · `agency/marketing/_MarketingCommandSurfaces.tsx` · `agency/marketing/page.tsx` · [plan](plans/marketing-workspace-overhaul.md) |
| Aqua Tags wizard steps 4–6 | **Core slices shipped.** Steps 4–5 reuse the website editor's repo-discovery/tag-inject/seed flow for **client-routed** sites and expose an `Editor →` link; step 6 company routing is also shipped. The honest remainders are own/company-site editor scope, a company-facing enquiry view, per-client injection keys, deeper registry state and the Radar health/firing findings. | [aqua-tag.md](../workspace/aqua-tag.md) · [plan](plans/aqua-tag-system.md) |
| MFA at login | **Built AND wired** (2026-08-21) — `mfa.ts` decides when aal2 is needed but isn't gating sign-in | [issues #10](issues.md) |
| Meta / Instagram inbox | **Code-complete end-to-end (all 4 phases + webhook), 2026-08-19 — self-serve at the app layer; two non-code steps remain.** **P1 store:** Meta is an integration provider — App ID / App Secret / verify token / Graph API version persist **encrypted** (AES-256-GCM, masked, never echoed), managed from **both** the inbox Channels panel and Agency→Company connections (catalog-driven `IntegrationConnectionsPanel`). **P2 readers:** `metaInboxReadiness`/`readMetaMessagingConfig` read **stored-then-env** (6 call sites; OAuth unchanged) → stored creds flip `configured`→true. **P3 UI:** disabled "Awaiting Meta values" → enabled **"Connect now"** → inline `MetaConnectForm` → saves `meta` via `/api/portal/settings/integrations` → `router.refresh()` → IG/FB consent buttons appear. **P4 webhook:** the session-less `api/webhooks/meta` resolves the owning agency from the payload's account id and verifies the HMAC signature + GET handshake against that agency's **stored** secret/token then env (`verifyMetaWebhookRequest`/`metaWebhookVerifyTokenAccepted`) — env stays a candidate and the HMAC is the only gate, so it can't accept a forged request. **P5 multi-account (one app, many IG/FB):** Facebook OAuth already returns every Page + linked IG account (each saved as its own connection, deduped by `(agency, channel, externalAccountId)`); the webhook routes each delivery by account id; sends use each conversation's own connection. Added the missing **feedback**: the inbox surfaces the OAuth connect result (`metaConnectNotice`: "Connected N accounts" / warnings / errors — was silent), reads "Add Instagram/Facebook" once ≥1 is connected, and shows a connected-count + "Routed" badge. **Runtime-verified at the service layer** (save→encrypt→mask→resolve-stored-then-env→credential-test; stored-agency configured / bare-agency not; webhook verifies the **stored** secret via account→agency lookup, rejects wrong/absent, GET accepts stored+env tokens; **two accounts coexist as distinct profiles, route by account id, disconnect-isolation**) + a Connect-now wiring contract test. Full suite 1636 green; whole tree typecheck-clean. **Browser-verified on `:3032` (2026-08-19):** "Connect now" (dead button gone) reveals `MetaConnectForm` (four catalog fields + help + setup link + encryption note); `?meta=connected&connected=3` → green "Connected 3 accounts" banner, `?meta=no-eligible-accounts` → amber warning, dismiss ✕ works; no app/React console errors (only dev HMR-socket churn). Did **not** submit — on localhost readiness can't reach `configured` (HTTPS-callback gate rejects `localhost` **by design**), so the connect-buttons transition + real OAuth only work on an HTTPS deploy. **Gap to User-reachable (not code):** Ed creates the **Meta Developer app** + supplies creds on an HTTPS deployment. | [issues #11](issues.md) · [plan](plans/meta-inbox-connect.md) |
| Internal chat → owner "Needs attention" | **Code-complete + logic/end-to-end tested; visual browser walk pending (→ Commander).** Internal team chat now has **read-tracking** (`peopleChannelReads`, marked on view/post) and **@mentions** (`PeopleMessage.mentions`, parsed from the roster on post), and `operationalAlerts` raises one `in-app` **`people:chat-attention`** alert when the owner has unread **direct messages** or unread **@mentions** — so it lands in the Needs-attention tab (auto, no `_MasterInbox` edit) and **clears when the owner opens Team chat** (`?view=chat`). **Verified:** behavioural smoke (direct+mention counting, parsing, plain-message ignored, reading clears, owner-own excluded) **and end-to-end** — the alert actually appears in `listOperationalAlerts` and clears after `markChannelRead`; full suite 1664 green, `tsc` clean. **Pending:** the live look — post a message to the owner and see the alert in the inbox + the "@name to notify" composer hint (needs a second seeded user → Commander on `:3032`). Trigger = direct + mentions (Ed). | `server/people.ts` · `lib/server/operationalAlerts.ts` · `api/portal/team-chat` · [plan](plans/internal-chat-attention.md) |
| Advisor / Assistant chat | **Needs an OpenAI key configured** — returns 503 `assistant_not_configured` otherwise | [advisor.md](../workspace/advisor.md) |
| External AI API / MCP | **Needs a token configured** — 503 otherwise | [advisor.md](../workspace/advisor.md) |
| Public bucket (`aquacrm-public`) | **All phases (2026-08-19): wired end-to-end + runtime-verified in memory; NOT against a live bucket/browser.** (P1) `publicUploadStorage.ts` → durable **`getPublicUrl`** (Supabase → hard-error-in-prod → local `public/uploads-public/`, no Blob tier, `upsert`) + `deleteSupabasePublicUpload`. (P2) `publishPage` **promotes inline `data:` media to the bucket on publish** via the additive `publicMedia` foundation port + a pure fail-open walker; drafts stay inline. (P3) gate = the publish click (nothing private leaks; active unpublish-delete **deferred** — shared content-addressed keys need refcounting). (P4) renderers verified — `ImageBlock` + `renderPageHtml` emit the promoted CDN URL directly. **Runtime-verified (not just green):** an **end-to-end capstone** genuinely runs draft `data:` → `publishPage` → `renderPageHtml` and asserts the rendered `<img>` serves the CDN URL with the `data:` gone; plus walker/adapter/publish behaviours — **17/17**; full suite 0-fail; plugin smoke **49/49**. **Live-server browser check (2026-08-19, in-app browser on `:3032` via `/dev`):** the app + full authenticated portal render cleanly with the additive `publicMedia` foundation port HMR'd in — Journey, Fulfilment (all tabs), Radar, etc. all load with **zero console errors**, confirming the shared-foundation change is **runtime-safe live** (the whole plugin runtime now carries the port). **Gaps to User-reachable (non-code):** (1) the real **Supabase-CDN upload** path is source-shape-pinned, not run against a live bucket; (2) the **full author→publish→inspect-`/uploads-public/` walk was NOT completed** — the shared `:3032` was thrashing on constant recompiles from ~5 concurrent workers (the pane hung), and it needs a website authored from scratch; that exact pipeline is proven by the in-memory end-to-end capstone. Re-attempt the live publish walk on a quiet server. | `publicUploadStorage.ts` · `built-ins/runtime/foundation-adapters/publicMediaAdapter.ts` · `website-editor/src/server/publicMediaPromotion.ts` · [plan](plans/public-bucket.md) |
| KPI Intelligence — registry + explorer (Phases 1 + 3 + 4 complete) | **Code-complete + logic-tested + suite-green; PARTIALLY browser-verified on `:3032` (2026-08-19).** ✅ Confirmed live (owner session, 3,124-check seed): the executive Command Centre renders with **no regression from the chart migration**, and the KPI trajectory shows the new **"Explore all KPIs"** button + all 5 primary stations with correct live values/statuses (Growth·Learning, Acquisition·Healthy, Finance·Critical, Systems·11/100·Critical, Operations·Warning). ⏳ The explorer's internal click-through (open → line/area/bar → search a commercial + an evidence series) was **interrupted by a browser-pane hang** on the shared server (many workers recompiling) and remains **test-verified only** — hand that final walk to the Commander or retry on a settled `:3032`. **Phase 3a (2026-08-19): the 40 commercial formulas are now registered + plotting** — the whole comparison chart pipeline was migrated from `CommandKpi` to `KpiDescriptor.series` (command output unchanged by construction; the shared format helpers were decoupled to take `format`; `onInspect` was **contained so the battle table is untouched**); commercial formulas plot as single honest points, plan-mode shows "no numeric plan" for them. **Phase 3b (2026-08-19): all ~1,500 radar evidence series** are now lazily loadable into the explorer (new `GET /api/portal/kpi-registry/evidence` + `describeEvidenceSeries`; they carry real trend points; picker render capped at 200 so they can't jank it). 13 registry tests pass. **Route auth path not runtime-driven** (thin wrapper over the tested mapper). **Phase 4 (2026-08-19): server-persisted, layered, versioned targets** — `agencySettings.kpiTargets` + `resolveKpiTarget`/`applyKpiTargetOverride` (effective-from + history) + `GET/POST /api/portal/kpi-registry/targets`; the explorer loads targets on mount and saves on set/reset. **Store roundtrip runtime-tested** (a config override changes the resolved target, versioned/scoped/cleared); the live browser save→reload→persist walk is the Commander's. New **KPI Registry** ([`lib/kpiRegistry.ts`](../../src/lib/performance/kpiRegistry.ts) + server twin) projects each built command KPI into a uniform `KpiDescriptor` — **wraps, never recomputes**. Ed's call was to **repurpose** the existing `KpiComparisonWorkspace` explorer (it already did search / 24h–12m ranges / raw·indexed·%-change / a plan mode with pace+target+forecast / saved views / target overrides): its selector is now **registry-backed** (Phase 3 adds the 40 commercial + evidence series by growing the descriptor list) and its chart gained **line/area/bar** switching; the executive trajectory gained an **"Explore all KPIs"** entry. **Logic-tested (not just green):** 7 real input→output cases in `smoke-kpi-registry.test.ts` (field projection, series-copy, honest nulls, ordering, search, grouping) + a wiring contract. **Not browser-verified:** did **not** start a 2nd `dev:verify` — two file-backend servers clobber the shared `.data/portal-state.json` and would disturb the Commander's `:3032`. **Hand the click-through to the Commander:** executive view → Explore all KPIs → line/area/bar → search the bank. | `lib/kpiRegistry.ts` (+ server) · `_CommandIntelligenceWorkspace.tsx` · `_CommandCentreKpiTrajectory.tsx` · [plan](plans/kpi-intelligence-overhaul.md) |
| Enquiry features in dev/demo | **Show nothing** — `session.isDemo ? []` loads zero enquiries | [issues #12](issues.md) |
| Radar watchdog `correlation-engine` | **Hardcoded `pass`** — does no real assertion | [radar.md §12](../workspace/radar.md) |
| `.env.example` | **Resolved by construction.** Every variable inspected by production readiness is documented, the three Supabase credentials are present, and the example-secret guard rejects real-looking values. | [issues #4](issues.md) |

## Logic-tested (pure computation with real assertions — trustworthy math)
These have genuine input→output unit tests, so the *calculation* is verified even
though the surrounding UI isn't runtime-checked here:
`company-health` (weak company → overall 34), `client-aqua-health`, the radar
lens/evaluation engine, resolution/action classification, commercial-lifecycle
cohorts. (See [radar.md §11](../workspace/radar.md) for the full assertion list.)
- **Client Health — enquiry + traffic factors + Command Centre alerts (Phases 1–2, 2026-08-19)** — `clientAquaHealth.ts` scores two tag-fed signals (`enquiry`, `traffic`) on an **evolving monthly baseline** (±10% band; two-tier watch/risk; floors gate the risk tier; honest `learning` until a baseline exists), and a firing risk factor now raises a **specific Command Centre `operationalAlert`** (off-system, Fulfilment `?tab=systems` path, exact baseline evidence, `clearsWhen`) — not a bare count. **Logic-tested** — 9 real input→output cases ([`client-aqua-health.test.ts`](../../scripts/client-aqua-health.test.ts)): enquiry-none→risk, ≥50% traffic drop→risk, 10–50% dip→watch, no-history→learning, full-confidence, relationship-only→70% confidence, + `clientTelemetryRiskSignals` (enquiry-none/drop, gone-silent, empty-when-healthy). **Runtime-verified in-process** (memory backend, no dev server): (a) a seeded enquiry-none client drives the real `buildClientRadar` relationship-health check to *critical*; (b) the real `listOperationalAlerts` emits the exact enquiry/traffic alerts ([`smoke-operational-notifications.test.ts`](../../scripts/smoke-operational-notifications.test.ts)); (c) the real `listClientsNeedingAttention` returns the compact roll-up (risk client + reason + href, churned excluded, only risk/watch — [`smoke-client-attention.test.ts`](../../scripts/smoke-client-attention.test.ts)). **Phases 1–4 code-complete** — enquiry/traffic factors → Command Centre alerts → fleet ride → the `ClientsNeedingAttention` panel + `listClientsNeedingAttention` data. **✅ Phase 4 panel MOUNTED + BROWSER-VERIFIED.** The `ClientsNeedingAttention` panel is wired into the Command Centre Day Command station (`page.tsx` + `_DashboardCommandCenter.tsx`, Ed-approved shared-file edit) and confirmed live on `:3032` — "1 to review → Northlight Studio · watch · reason · 91/100 · Fulfilment link". **✅ BROWSER-VERIFIED on `:3032`** (in-app browser, via `/dev` sign-in): the Journey → Aqua Health view now renders **six** factor chips per client — the two new **Enquiry flow** and **Site traffic** alongside the original four (seed clients show honest "Learning", no baseline) — **zero console errors** on that page; the Command Centre dashboard still renders fully (14 Radar alerts, incidents, battle-table exceptions) with my `operationalAlerts` change in place. **Still NOT browser-seen:** the factors *firing* with real telemetry (logic-proven but not injected into the shared sandbox). The mounted `ClientsNeedingAttention` panel was browser-seen as recorded above. Radar consumed read-only. | `clientAquaHealth.ts` · `server/operationalAlerts.ts` · `server/clientAttention.ts` · `agency/_ClientsNeedingAttention.tsx` · [plan](plans/client-health.md)
- **Staff Command (ALL 10 phases — plan complete)** — `people.ts` (directory/card/presence/freelancer-jobs/recognition/feedback/delegatable/orgChart/process-config/contracts/chat + **training modules** `savePeopleTrainingModule`/`gradeTrainingQuiz`/`completeModuleAssignment`/`sanitizeModuleForStaff`) + `staffCapacity.ts` + `components/people/TeamChat.tsx` + `api/portal/{people,team-chat}`. P9 adds **training modules + quizzes** (block+quiz builder, pure grading, pass-gated completion, answer key never leaked to staff, only-assignee-completes) — asserted. P6 adds the **internal chat** (team + direct, membership-gated, working-today roster) — asserted. P10 adds **staff contracts** (draft→sent→acknowledged, only the owning employee's userId may sign) — asserted. P7 adds the **configurable onboarding template** + **hiring-stage labels/guidance** (ids fixed for Radar) — asserted (defaults, persistence, id-stability, new-hire seeding, empty guard). Staff **17/17**; typecheck-clean. Real assertions on days-worked, logged-ms, holiday, task counts, derived-owner path, 3-state presence, freelancer job lifecycle, capacity shaper, recognition, delegatable-task selection, upward feedback lifecycle, growth-path persistence, and the **org chart** (owner-on-top, nested reports, freelancer layer separate, **cycle→unplaced guard**) ([`smoke-people-workspace.test.ts`](../../scripts/smoke-people-workspace.test.ts)). Capacity + org chart are read-only surfaces (no Radar engine edit); delegation reuses `/api/portal/tasks`. **UI — agency `_PeopleCommand.tsx` — BROWSER-VERIFIED on `:3032`** (2026-08-19, via Claude-in-Chrome, `/dev` owner session on AquaOasis-Web): the People Command loads with all 10-phase tabs (Overview · Capacity & hiring · Recruitment · Directory · Org chart · Access · Time & leave · Onboarding · Pay & commission · Contracts · Team chat), **no console errors** (only transient HMR races from concurrent worker edits). Two hardest surfaces confirmed working live: **Capacity & hiring** renders the real Radar `team` reshape (Coverage 100% · Confidence 37% · Readiness 78%, "Where you're stretched" = 43 firing signals with evidence + Act deep-links); **Team chat** renders the Team channel + "Working today" roster + composer + empty state (after a settle window — dev server was recompiling). **Bug fixed during the review:** `TeamChat` sat on an infinite spinner if the initial fetch lost the HMR race (error only rendered inside the loaded view) → now shows the error + a Try-again button. **Staff-side `_TeamWorkspace.tsx` also BROWSER-VERIFIED** (2026-08-19, via the Dev Mode POV switcher → demo staff "Demo Designer · Delivery"): the staff nav carries all new stations, and each renders — **My growth & company** (progression, P5: "your place on the team", growth path, recognition, mission, SOPs, "Talk to the founder" Praise/Idea/Concern form), **Training** (P9, empty-state — no module assigned to the fresh demo staff), and **Team chat** (P6, station + `TeamChat` mount). Exited Dev Mode cleanly back to the real founder. **Both agency + staff sides of the 10-phase plan are now Runtime-verified.** `tsc` 0 errors.
- **Finance — Plans create form repaired; index bug finished plugin-wide (2026-08-19)** — from a self-review sweep of the day's changes. **The Plans page could never create a plan:** a native `<form method="post">` in a server component posted form-encoded into a handler that parses with `req.json()`, so every submit answered 400 `invalid_body` — a finished-looking page, completely non-functional, missed because no test called the endpoint the way the form did. Replaced with a client `NewPlanForm` posting JSON (same fields/labels/endpoint, plus busy + error states) and carrying the idempotency key `plans.create`'s guard already expected. **Transport repair only — whether Plans survives is still the plan's "finish or cut" decision.** Guarded as a class: a test fails on ANY native form POST in the plugin, since every finance handler parses JSON. **Also finished the lost-index-slot class:** `categories.list` (a lost category drops its expenses from every picker), `expenses.listForCategory` (now filters through `list()`), **`expenses/by-category/` + `expenses/by-staff/` deleted** as dead indexes (by-staff read by nothing), and `expenses.list`/`budgets.list`/`operations.listRows` retrofitted onto the shared `listRowIds` — three inline copies collapsed to one. **Verification level: behaviour-tested + mutation-checked + RUNTIME-VERIFIED on a live server (strong).** Against my own isolated sandbox (`sandbox:fork -- money 3042`, own state file + build dir + port — the shared `:3032` sandbox was untouched): the page renders the new client form ("New plan", `monthlyAmountCents`, the corrected "Monthly (pence)" label) and **no native form POST of its own**; the live endpoint answers **400 `invalid_body`** to a form-encoded body (the exact old bug) and **201** to JSON; a repeated POST with the **same key returns the same key-derived id** (`plan_2fcc47d0…`, the 32-hex signature of `deriveRecordId`) while a new key creates a second plan — **3 POSTs → 2 plans**, both rendering as 2 table rows. ⚠ **Not literally clicked:** the browser pane was stuck at a 0×0 viewport and would not take a resize (a fresh tab didn't help), so this is HTTP-driven against the real running server rather than a mouse click — the form's own JS submit path (busy/error states) is unit-level only. Sandbox state + build dir deleted afterwards and the `tsconfig.json` lines Next appended reverted. Full suite **1841/1843** (the 1 fail is `devteam`'s in-flight nav), scoped tsc clean. **NOT launch-safe until the Auditor re-verifies.** | `agency-finance/components/NewPlanForm.tsx` · `pages/PlansPage.tsx` · `server/{expenses,categories,budgets,operations}.ts`
- **Finance — Stripe webhook drop-on-retry closed; the money-correctness set is complete (2026-08-19)** — the auditor's last open finance 🟠. The handler marked an event processed **before** reconcile succeeded, so a transient storage failure poisoned the in-process cache: Stripe's retry was answered "already done" with a 200, Stripe stopped retrying, and a **real payment was never recorded** — customer paid, invoice unpaid, nothing on the books hinting at it. New `reconcileStripeEventOnce` (in `server/stripeReconcile.ts`, beside the logic it guards) caches **only after success** and lets the error propagate; the handler now distinguishes **400 verification-failed** from **500 processing-failed**, because Stripe treats the status code as retry instruction. **Later correction 2026-08-26:** payments, refunds and disputes now all have durable provider identities across processes; the in-process cache is only a warm-process shortcut. **Verification level: behaviour-tested + mutation-checked (strong); NOT browser-walked, and NOT run against live Stripe.** The original checkpoint could not drive signature verification because the package was absent; current source now includes `stripe@22.5.0`, while the live signed-event walk with real test keys remains outstanding. +3 tests incl. the **failure-then-retry** case the audit flagged as missing. Full suite **1827/1829** (the 1 fail is `devteam`'s in-flight nav), scoped tsc clean. **Together with the three fixes below this closes the finance money-correctness set: double-count on create · double-count under concurrency · record lost off the books · payment dropped on retry.** Ed's live Stripe run is still the outstanding non-code proof. | `agency-finance/server/stripeReconcile.ts` · `api/handlers-stripe.ts` · [audits.md](audits.md)
- **Finance — the "record goes missing" concurrency bug closed across every money store (2026-08-19)** — generalises the payments-only fix in the row below. Each store's `<area>/index` array is appended by read-modify-write, so two **concurrent** creates lose one id and its row goes invisible to `list()` though it's stored — an under-count that can also *mask* a double-count. One shared helper, `server/rowIndex.ts` `listRowIds`, unions the index with a row-prefix scan (extracted from the inline copies `ExpenseService.list`/`OperationsService.listRows` already carried) and is applied to `payments`/`invoices`/`income`/`plans` `list()`; `invoices.listForClient` now routes through `list({clientId})`, taking the equally-racy `invoices/by-client/` array off the read path. Storage is namespaced per plugin install, so the scan widens no scope. **Verification level: behaviour-tested + mutation-checked (strong); NOT browser-walked.** +4 tests — concurrent invoices visible agency-wide *and* on the client tab, concurrent income, concurrent plans with ordering intact, plus a guard that a healthy store still lists exactly once newest-first; reverting the scan fails all four money tests at **1 of 2 records visible**. Full suite **1815/1817** (the 1 fail is `devteam`'s in-flight nav), `agency-finance` scoped tsc clean. **NOT launch-safe until the Auditor re-verifies.** ⚠ Noticed, left alone: `payments/by-invoice/` + `payments/by-client/` are **write-only** indexes (nothing reads them) — a safe cleanup, not worth churn inside this fix. | `agency-finance/server/rowIndex.ts` · `server/{payments,invoices,income,plans}.ts`
- **Finance — the 2 residual keyless money paths closed, +1 lost-payment bug (2026-08-19)** — the create-surface audit PASSED but flagged two paths still recording money with **no idempotency key**, safe against a sequential double-click yet double-counting under **true server-side concurrency**. **(1)** `stripeReconcile.ts` relied only on a `findByExternalRef` pre-check — a check-then-write — so overlapping webhook redeliveries all recorded; it now also passes `idempotencyKey: externalRef` (the PaymentIntent was already the stable reference). **(2)** `markInvoicePaidHandler` was guarded only by a balance read; it now passes a **server-derived** `settle:<invoiceId>` — one intent per invoice, and being server-side no UI can forget it. **(3) Found by the new tests:** appending to the shared `payments/index` is a read-modify-write, so two payments recorded **concurrently for different invoices** lost an index slot and one payment, though stored, became **invisible to money-in** — an under-count that was also *masking* bug 1. `PaymentService.list` now unions the index with a prefix scan (the idiom `ExpenseService.list`/`OperationsService.listRows` already use). **Partials stay legal** — a second Stripe payment is a different PaymentIntent, and mark-paid settles only the remaining balance. **Verification level: behaviour-tested against the REAL handler + REAL reconciler, and mutation-checked (strong); NOT browser-walked.** +8 tests; each fix reverted individually → the test fails with the true count (3 payments · 2 and 5 payments · a missing payment). ⚠ **Gotcha for future concurrency tests here:** `Promise.all([handler(), handler()])` does **not** interleave in one process (`req.json()` is a macrotask, everything after is microtasks), so the tests use a latency storage (`racingWorld`) to restore the real read→write window — without it they pass on broken code. Full suite **1792/1794** (the 1 fail is worker `devteam`'s in-flight `findings` nav, not this). No browser walk: server-side logic with no UI change, and the box was busy. **Historical finding, subsequently closed:** the people-payment and Plans UIs did not send keys and the Plans native form posted the wrong encoding. `NewPlanForm.tsx` now sends JSON plus an idempotency key, and the people-payment modal supplies its own key; see the later repair rows. | `agency-finance/server/{stripeReconcile,payments}.ts` · `api/handlers.ts` · [audits.md](audits.md)
- **Finance — money-CREATE idempotency guard (2026-08-19, launch-blocker fix)** — closes the auditor's systemic money double-count/double-bill: a client one-time idempotency key now makes every money-create idempotent via a **deterministic key-derived record id** (`lib/idempotency.ts` `deriveRecordId`), reused across `payments.record`/`income.create`/`plans.create`/`invoices.create`/`createCompensationPayment` + `closeDeal.ts`. **Partial payments stay legal** (a genuine second payment = a new key = allowed). **Verification level: logic+behaviour-tested (strong), NOT browser-walked.** New `smoke-finance-idempotency.test.ts` proves **two rapid identical submits — sequential AND parallel — record exactly one payment**, a **new-key second/partial payment is allowed** (and settles the invoice), plus income dedup + `deriveRecordId` determinism; close-deal test extended (same key → one invoice+contract, no second pay-link; new key → two). **Full suite 1747 green, tsc clean.** Browser double-submit/double-click walk **not run by me** — a `next dev -p 3032` sibling session is live and the file-backend path is `cwd/.data/portal-state.json` (hardcoded), so a self-`dev:verify` would clobber the shared sandbox, and worktree isolation isn't viable on all-uncommitted code (the documented preview-lock). UI wiring statically confirmed (3 callers send the key; 5 handlers pass the body). **→ Commander for the `:3032` UI walk; NOT money-safe until the Auditor re-verifies.** | `agency-finance/src/lib/idempotency.ts` · `server/{payments,income,plans,invoices,operations}.ts` · `lib/server/closeDeal.ts` · [audits.md](audits.md)
- **Finance Phase 1 — nav coherence + payment-plan resolution fix (2026-08-19)** — a de-sprawl refactor with **no visible render change**: one canonical `FINANCE_SECTIONS` source now feeds both the in-page `FinanceNav` tabs and the plugin manifest `navItems` (the drifting second nav def is gone), and the double-mounted founder dashboard (`""` + `/founder`) is collapsed to a single root mount. **Runtime-verified in-process** (memory backend, no dev server): a new behavioural test drives the real `resolutionPlanFor`/`resolutionEvidenceFor` on a seeded client with `metadata.clientPaymentPlans` and proves a **missed-instalment** alert now resolves to its multi-step "Collect …" plan + evidence — the resolver had been reading the never-written `metadata.paymentPlans` and silently returning null ([`smoke-operational-notifications.test.ts`](../../scripts/smoke-operational-notifications.test.ts), **proven to fail pre-fix**). The nav change is **static-tested** (nav-audit / finance-operations / icon-usability contracts retargeted to the canonical source), `tsc` clean, and registry-evaluated (sidebar/healthcheck tests load the manifest), and now **✅ browser-verified on the running `:3032`** (in-app browser, `/dev` founder session): the Finance workspace renders with **all 11 tabs single-sourced** (Overview→Income→Expenses→Invoices→Reports→Budgets→Operations→Planning→Plans→Deposits→Settings, clean labels), **Finance appears once in the sidebar**, every derived href is correct in the live DOM (incl. Income→`/payments`, Deposits→`/lock-in`), the old `/agency-finance/founder` **redirects to the root** (double-mount gone), the Deposits page opens with its tab correctly active, and **zero console errors** on every page visited. | `agency-finance/src/lib/sections.ts` · `FinanceNav.tsx` · `index.ts` · `lib/server/resolutionPlans.ts` · [plan](plans/finance-command-surface.md)
- **Finance Phase 2 — payment channel model + "money in across everything" (2026-08-19)** — channel is now first-class: `channels.ts` (`PAYMENT_CHANNELS` — Stripe automated, bank/cash/other manual, each with its own receipt reference) + `moneyIn.ts` (`summariseMoneyInByChannel`, per-currency, all four always present). The Income sheet (`/payments`) is the unified money-in-by-channel view — breakdown strip + channel badges + Channel filter + channel-aware record forms. Reuse-heavy (the sheet already unified payments + paid invoices + other income). **Record + surface only — never holds funds.** **Logic-tested** (4 real input→output cases: catalogue, normalise legacy `manual`→`other`, per-channel aggregation, empty world) + `tsc` clean + full suite 1639 green. **✅ Browser-verified on `:3032`:** money-in-by-channel view renders (all four channels, Stripe·auto, icons), Channel filter + record-form dynamic reference label work, zero console errors — dev tenant has no income so cards read £0.00 (aggregation proven with data by the unit test). | `agency-finance/src/lib/{channels,moneyIn}.ts` · `components/IncomeSheet.tsx` · [plan](plans/finance-command-surface.md)
- **Finance Phase 3 — Stripe wired for the online channel (2026-08-19)** — per-invoice pay-link (`createInvoiceCheckout`), a public signature-verified webhook → `reconcileStripeEvent` (checkout→auto-settle, idempotent on the PaymentIntent; `charge.refunded`→refunded; `charge.dispute.created`→chargeback surfaced), refunds (`createStripeRefund`), keys via install config. Reused the ecommerce Stripe pattern (per-plugin adapter, injectable client). **App never holds funds; keys never hardcoded/logged.** **Logic-tested** — 9 cases drive the real Invoice/Payment services over an in-memory container with fake events + a mock client ([`smoke-finance-stripe.test.ts`](../../scripts/smoke-finance-stripe.test.ts)): checkout→settle, idempotent redelivery, refund→status-back, dispute→chargeback, safe ignores, checkout params, refund call, webhook-refuses-without-secret, config. `tsc` clean + full suite 1655 green. **NOT live/browser-verified. Historical checkpoint:** Stripe was not installed and `:3032` was down at that verification time. **Current state:** `stripe@22.5.0` and the encrypted Finance settings surface are installed; enter TEST keys, point a webhook at `…/stripe/webhook?agencyId=<id>`, and run the signed payment/refund walk. ⚠ refund/chargeback operational alert is a follow-up in `operationalAlerts.ts` (client-health's). | `agency-finance/src/lib/stripe.ts` · `server/stripeReconcile.ts` · `api/handlers-stripe.ts` · [plan](plans/finance-command-surface.md)
- **Finance Phase 4a — one-button close, existing client (2026-08-19)** — one action → sent contract (`ClientContract`) + issued invoice (real `InvoiceService`, draft→sent) + routed payment (Stripe pay-link P3 / bank / cash / other; a pay-link failure is non-fatal). `lib/server/closeDeal.ts` (engine) + `api/tenants/close-deal` (route) + a "Close the deal" card in `_FinanceTabClient.tsx`. Reuses the client-contract system + P2 channels + P3 Stripe. **Record + route + surface only — never holds funds.** **Logic-tested** — 6 cases over the real `InvoiceService` in-memory (stripe/bank/cash/other routing, non-fatal pay-link, validation; [`smoke-finance-close-deal.test.ts`](../../scripts/smoke-finance-close-deal.test.ts)). `tsc` clean + full suite 1663 green. **Route runtime-confirmed** (curl → 400 validation, not 404); the card render on a finance-enabled client tab wasn't browser-walked (fiddly to reach; static tsc-verified render). **Follow-up (P4b):** the lead→client close reusing leads-pipeline proposals — spans Journey, flagged for coordination. | `lib/server/closeDeal.ts` · `api/tenants/close-deal` · `_FinanceTabClient.tsx` · [plan](plans/finance-command-surface.md)
- **Finance Phase 4b — one-button close for a lead (2026-08-19)** — convert a won lead → client (existing flow) then **close** (the P4a engine) in one step: a "Close the deal" action on the post-convert pipeline banner → modal → `/api/tenants/close-deal`. **Journey UI only — no leads-pipeline server change** (Ed cleared the coordination). `tsc` clean + full suite 1668 green; the close-deal route is live (curl). The pipeline-UI walk wasn't browser-clicked (fiddly; reuses a live, tested endpoint). **Phase 4 done — both flavours.** | `agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx` · `api/tenants/close-deal` · [plan](plans/finance-command-surface.md)
- **Finance Phase 5 — AR/AP aging + hygiene (2026-08-19)** — `lib/aging.ts` (`summariseAging` — 5 buckets by days overdue + a separate `overdueCents`) surfaced in the Reports page as a Receivables/Payables panel (unpaid invoices / approved-unreimbursed expenses, per currency, overdue in red). Reconciliation was already in place (Stripe auto-settles P3; bank/cash via mark-paid). Dead `expense.*` events documented as an unconsumed **event-contract** (hazards). **Logic-tested** — 3 cases ([`smoke-finance-aging.test.ts`](../../scripts/smoke-finance-aging.test.ts): bucketing, empty world, boundaries). `tsc` clean + full suite 1676 green. Aging panel NOT browser-walked (`:3032` down again; tsc-verified server render). **Historical checkpoint:** the You-Deserve-It → Finance wire was still flagged here; it was subsequently built and behavior-tested, as recorded in the following row. **🎉 Finance plan P1–P5 complete** — Ed's live Stripe check remains. | `agency-finance/src/lib/aging.ts` · `src/pages/ReportsPage.tsx` · [plan](plans/finance-command-surface.md)
- **Finance — You-Deserve-It spend → Finance expense (2026-08-19)** — the last flagged wire, Ed cleared the coordination. A **delivered** client delight with a cost becomes an **approval-gated ("pending") finance expense**; hooked in `api/tenants/client-delight/route.ts` (a new `lib/server/clientDelightExpense.ts` bridge — `server/clientDelight.ts` + `types.ts` untouched); **idempotent** via the expense `reference` (`delight:<id>`); no-op when Finance isn't connected. **Logic-tested** — 3 cases over the real `ExpenseService` in-memory ([`smoke-finance-delight-expense.test.ts`](../../scripts/smoke-finance-delight-expense.test.ts): pending expense created, idempotent re-record, safe no-op). `tsc` clean + full suite 1696 green. Record + surface only. **🎉 Finance plan fully complete** — only Ed's live Stripe check + the commander's `operationalAlerts.ts` refund/chargeback alert remain (neither is code I do solo). | `lib/server/clientDelightExpense.ts` · `api/tenants/client-delight/route.ts` · [plan](plans/finance-command-surface.md)

## Everything else
**Coded + (usually) static-tested; runtime and usability UNVERIFIED in this
pass.** That's not a claim it's broken — it's a refusal to claim it works
without running it. To move a feature to Runtime-verified / User-reachable, it
has to be actually exercised (see below) and this row updated with the date and
what was checked.

## How to actually verify (and raise a status)
1. Start a dev server (`npm run dev:sandbox:real`) and **click the flow through** as the real role — or drive it with the browser preview tools.
2. For APIs, hit the endpoint against a running server (the `.mjs` harnesses, or curl) and check the real response + that state changed.
3. Add a **runtime/behavioural** test where practical (not just a static-source assertion) — one that renders the component or calls the handler and asserts on the *result*.
4. Update this register (feature → level, date, what was checked) and log it in [updates.md](updates.md).

_This register is the antidote to a false green. When in doubt, it says "not
verified" rather than implying something works._
<!-- AQUACRM_SOURCE_END path="docs/development/status.md" -->

---

<a id="source-docs-development-todo-md"></a>

## Source document — `docs/development/TODO.md`

<!-- AQUACRM_SOURCE_START path="docs/development/TODO.md" sha256="1803d5dd4755e2a6b66204c831044c9b47f0cee23c471be6b894378c376e525e" -->
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
- [x] Apply the pending Supabase migrations before production rollout — DONE 2026-09-03: all 14 applied live via `supabase db push`, backup confirmed, backfill 52/52 and every row count verified read-only, live `rls-verify.sql` 51 INFO / 0 FAIL → [supabase-alignment-2026-09-03](plans/supabase-alignment-2026-09-03.md) §9  <sub>from checklist.md, no issue number</sub>
- [ ] Activate and prove recovery — the self-managed encrypted backup/runbook exists and was locally rehearsed, but scheduled activation, durable off-Supabase delivery, one downloaded live-artifact restore, timing and missed-backup alert proof remain; PITR is OFF and should be reconsidered → [current readiness](PRODUCTION-READINESS.md) · [backup evidence](plans/production-readiness-roadmap-2026-09-03.md#5-database-migrations-rls-backup-and-recovery)
- [ ] Push `20260903130000_ensure_rls_event_trigger` (a no-op on live; records the already-present rls_auto_enable to reach 0 pending) and decide on tightening the inherited over-broad table grants (optional REVOKE)  <sub>added 2026-09-03</sub>
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
<!-- AQUACRM_SOURCE_END path="docs/development/TODO.md" -->

---
