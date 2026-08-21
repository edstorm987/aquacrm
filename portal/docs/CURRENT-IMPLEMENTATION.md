# AquaCRM Current Implementation

Last updated: 21 August 2026
Baseline commit: `28bafd5` on branch `work/2026-08-20-parallel-session` (pushed to
origin; NOT merged to `main` — merging is what deploys production).
The previous baseline `b46d8ae` is 57 commits behind and no longer describes the tree.

## Current Release Summary

AquaCRM is now a connected local operating system rather than a static CRM
prototype. The current implementation includes real persisted domain models,
server APIs, role-aware workspaces, client-scoped operating surfaces, Radar
evidence, notification routing, and integration activation paths.

This document records what is present now. It should be updated whenever a
change alters a domain boundary, persisted model, primary workflow, external
integration, or navigation contract.

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

### Portals And Portal Studio

- Master templates and product-specific portal seeds exist.
- Client portal instances and design versions are persisted.
- Portal Studio supports stage and portal selection, pages, blocks, responsive
  settings, data sources, visibility rules, media, custom pages, and controlled
  custom code.
- Product modules compose into a portal while preserving a usable standalone
  experience for a single product.
- Assigned trading company controls the provider brand shown to the customer.
- Separate client workspaces can produce separate portals for one buyer.
- Customer portal records include only inherent or deliberately client-visible
  information.

### Finance, Company, Staff, And Experience

- Finance supports GBP-first multi-currency records, income, expenses,
  invoices, reports, budgets, allocations, operations, and planning.
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
  resume per project, and a mode switch (Just tell it / Just the words / Design
  it / Developer) with a per-mode accent and cutscene.
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
- **Aqua Editor AI** is a reskin of the SAME assistant engine as the Advisor and
  the Librarian. It proposes; a person applies.
- **PR management**: commit to a branch, then `openPullRequest()` and
  `mergePullRequest()` — two steps, so a preview exists before anything reaches
  main.
- **Also**: `src/engines/{editor,sop,data}/` is real; Operations and Tools are
  single flat sidebar rows onto hub pages; pinned pages ship as chrome; the
  cross-tenant `brand_enquiries` read is closed.

Known gaps, deliberately: binary upload, saved components, the env "are you
sure" overlay, the funnel/client-side editor convergence
(`docs/development/plans/super-editor.md`), and a React hydration failure on
`/portal/agency/portals/editor` that breaks interactivity on that route.
