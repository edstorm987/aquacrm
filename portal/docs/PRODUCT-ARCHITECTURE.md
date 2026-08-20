# AquaCRM Product Architecture

Last updated: 17 August 2026

## System Shape

AquaCRM is one Next.js application containing four related surfaces:

1. The public AquaCRM website and brand enquiry capture.
2. Secure agency operations under `/portal/agency`.
3. Internal client workspaces under `/portal/clients/[clientId]`.
4. Customer and team portals under `/portal/customer` and `/portal/team`.

These surfaces share identity, agency scope, products, client records,
communications, finance, delivery, and evidence. They are different views of
the same operating system, not separate products with copied data.

## Macro And Micro Rule

Agency workspaces are the macro view. They answer questions across the whole
business: all tasks, all clients, all finance, all delivery, and all risk.

Client workspaces are the micro view. They must let an authorised operator do
the same ordinary work for one client without returning to the macro view.
Examples include creating an invoice, updating a payment plan, managing a
contract, assigning a service, moving a service stage, uploading evidence,
editing a portal, and recording a call.

Do not replace one with the other:

- Agency Finance remains the complete portfolio ledger.
- Client Finance remains a writable, permission-scoped view of that client's
  ledger.
- Agency Fulfilment remains the cross-client delivery command surface.
- Client Fulfilment remains the complete delivery surface for that client.

## Agency Domain Ownership

### Command Centre

Route: `/portal/agency`

Command Centre is the owner operating layer. It currently brings together:

- Day Command: clock in/out, inactivity review, planned outcomes, work queue,
  schedule, evidence, briefings, and mandatory clock-out review.
- Executive Command Centre: health, Radar, confidence, readiness, business
  signals, full scans, actionable findings, and KPI intelligence.
- Battle Table: strategy, business plans, targets, projections, quarterly
  reviews, capacity, hiring recommendations, ownership, investment, dividends,
  and governance.

Command Centre uses a deliberate dark naval visual mode. Do not accidentally
apply that theme to ordinary workspaces. Performance Mode can suppress the
entry/exit transition while preserving functionality.

### Master Inbox

Route: `/portal/agency/inbox`

Master Inbox owns communication and attention across enquiries, support,
social channels, client messages, operational alerts, and updates.

The `Needs attention` view is an action surface, not a notification archive.
Every row must provide:

- exact problem and evidence;
- an authoritative resolution destination;
- a visible Resolve action;
- Remind later choices;
- Dismiss until the underlying evidence changes.

Inbox threads are only opened when the alert actually resolves to a matching
conversation. A finance, delivery, or system issue must not open an unrelated
contact merely because names happen to match.

### Actions

Route: `/portal/agency/actions`

Actions unifies committed and proposed work from four origins:

- manual;
- Radar;
- Advisor;
- CRM.

The All view ranks these in one queue with source badges. Source tabs expose
deeper origin-specific views. Suggested work remains approval-gated.

Focus protection normally limits a large queue to five items. A direct link to
an exact task temporarily promotes that task into the visible window and opens
its editor. Never let overload protection make a resolution link ineffective.

### Journey

Primary routes: `/portal/clients` and `/portal/agency/pipelines/[slug]`

Journey owns the relationship before, during, and after conversion:

- enquiries and identity review;
- contacts and relationship categories;
- leads, opportunities, and sales pipelines;
- cold scouting and qualification;
- follow-up and recontact scheduling;
- meetings, reminders, no-shows, recordings, and notes;
- conversion into a client workspace;
- relationship health and contact cadence.

Not every enquiry is a lead. Supplier, partner, marketer, recruitment, spam,
and other relationship categories stay outside the sales Journey unless a
human classifies them as sales.

A lead workspace should evolve into the client workspace when converted,
preserving identity, notes, messages, attribution, and history.

### Fulfilment

Route: `/portal/agency/fulfilment`

Fulfilment owns the work that delivers what was sold:

- cross-client delivery overview;
- product/service catalogue and workspaces;
- service stage boards and process steps;
- client delivery workspaces;
- portal operations;
- website, technical, development, performance, resources, vault, and workflow;
- service-specific marketing delivery where sold as a client service.

Development is intentionally integrated into Fulfilment. Legacy development
routes may remain for compatibility, but new navigation and functionality
should reinforce Fulfilment as the operational owner.

### Finance

Route: `/portal/agency/agency-finance`

Finance owns income, expenses, invoices, payment plans, budgets, allocation
pots, workforce costs, currency handling, tax evidence, profitability, legal
obligations, and financial planning.

Client Finance writes to the same underlying commercial records through a
client-scoped interface. Payment status, paid-in-full state, instalments,
missed payments, stage time, upsell signals, and client profitability must
remain traceable at both scopes.

### Staff

Route: `/portal/agency/people`

Staff owns applicants, employment records, access, onboarding, leave, shifts,
training, pay/commission configuration, and employee Day Command. Access is
composed from permitted workspaces and clients, not from one unrestricted
agency role.

### Marketing

Route: `/portal/agency/marketing`

Marketing owns campaign planning, social and ads, newsletters, direct
messages, cold campaigns, physical and charitable campaigns, funnels,
audiences, demographics, attribution, Google Business Profile, and internal
automations. Booking funnels belong here even when Journey uses their booking
links.

When social media or ads are sold as a service, the reusable capability is
surfaced inside that client's Fulfilment workspace with client scope.

### Other Domains

- You Deserve It: client/staff experience, rewards, events, trips, welcome
  packs, reputation, and care packages.
- SOP Library: folders, tags, uploads, relocation, and multiple media types.
- Tools: calendar, notepad, quick utilities, and internal tooling access.
- Company/Battle Table: company profile, plans, legal records, connections,
  capacity, capital, ownership, and executive review.

## Client Workspace Architecture

Canonical route: `/portal/clients/[clientId]`

The standard client lenses are defined in `src/lib/clients/clientWorkspace.ts`:

- Overview
- Relationship
- Fulfilment
- Social & ads, when relevant
- Systems, when relevant
- Finance
- Communications
- Files
- Portal
- Record

The sidebar should stay understandable as services grow. Core lenses remain
stable; assigned product/service workspaces appear as service-specific entries
rather than flattening every capability into one enormous list. Simple mode
shows the next operational step. Advanced mode reveals stages, SOPs,
variations, configuration, and deeper controls.

### Buyer, Workspace, Company, And Portal

These concepts must not be collapsed:

- A person or buyer identity may own several workspaces.
- A client workspace represents one commercial/delivery engagement.
- A workspace may be assigned to a trading company.
- The assigned company determines customer-facing portal branding.
- The same buyer may have separate portals for separate projects or companies.
- The relationship ledger can read across linked workspaces without merging
  their delivery, finance, permissions, or portal state.

### Products And Services

`AgencyProduct` is the catalogue template. It contains pricing, status,
portal requirements, portal template, internal workspace modules, stages,
steps, and related operating configuration.

Important rules:

- Products/services may be draft, live, or archived.
- A client assignment can carry a `ClientProductVariation` without mutating the
  catalogue template.
- New product definitions should be able to create a viable standalone client
  workspace and compose cleanly with other assigned products.
- Each assigned service owns its own stages. Website delivery can be in review
  while photography is already delivered.
- Global client stage is relationship-level context, not a substitute for
  per-service delivery state.
- Product changes may be rolled out deliberately; do not silently overwrite a
  client's bespoke variation.

### Internal Record And Customer Visibility

The client Record is a chronological ledger across messages, notes, calls,
commercial events, delivery movement, files, recordings, and system activity.

Visibility is explicit:

- `internal`: agency team only;
- `client`: deliberately shared into the customer portal;
- `inherent`: already customer-facing by the nature of the source;
- `system`: generated system evidence.

Do not leak internal notes, recordings, risk assessments, or staff-only
evidence into the customer portal. Do not hide deliberately shared records
from the client either.

## Radar And Advisor Architecture

Radar evaluates business, domain, client, service, system, and evidence state.
Its policy model supports setup, launch, operating, scaling, seasonal, and
paused stages, plus per-check lifecycle and exceptions.

Three values must remain separate:

- Health: outcomes against approved targets and commitments.
- Confidence: whether fresh, decision-grade evidence supports the assessment.
- Readiness/setup: whether sources and policies are configured enough to run.

New clients, products, websites, portals, and services should contribute their
own checks through data-driven rule generation. Client Radar rolls into the
agency Radar but remains inspectable inside the client workspace.

Advisor receives the same evidence-backed business context and visibility
limits. It can recommend, brief, rank, and propose. It must not have
unrestricted mutation access. External assistants use scoped API keys and a
proposal inbox with human approval.

## Canonical People And Companies

`Person` is the canonical human and `Organisation` the customer company. They
sit above the older records rather than replacing them: `Lead`, `Contact` and
`Client` are facets that point back with `personId`.

The rule this exists to enforce is that changing what somebody IS must never
destroy what they DID. A meeting held while they were a lead is still a meeting
once they are a supplier, so it is held on the Person and survives
reclassification. Facets are retained, never deleted, and the card's face
(enquiry / contact / lead / client) is DERIVED from which facets exist plus the
classification — never stored, so it cannot drift from the records behind it.

Distinctions that must not be collapsed:

- `Organisation` is the CUSTOMER's company. `TradingCompany` is one of Ed's own
  brands and drives customer-facing portal branding.
- `Person.organisationId` is only ever set from a confirmed link. Membership is
  proposed by the system and decided by a human; a rejection is retained so the
  same guess is never proposed again.
- A shared phone number is not proof of a shared person. A company switchboard
  would otherwise collapse every contact behind it into one record.
- `Client.relationshipId` still groups client workspaces for one buyer. Clients
  sharing a `relationshipId` share a `personId`; the two agree rather than
  compete.

Where a person opens depends on what they are now — contact card, lead card, or
client workspace. Resolve one destination through `personDestination` rather
than hard-coding a link, or a list keeps sending an operator to the contact
card long after somebody became a client.

## Actions And Resolution

Every operational alert declares how it can be dealt with:

- `in-app` - a control on a screen resolves it;
- `off-system` - the work happens elsewhere and Aqua records the outcome;
- `judgement` - there is no fix, only a decision.

This is declared by the check, not inferred from its id at render time. Roughly
half of all alert families are `off-system`: offering a Resolve button on those
promises a control that cannot exist.

A judgement call must never claim a mechanical clearance condition, and an
alert whose own wording is statistical ("99 robust deviations from its retained
median") must be translated into plain English before it reaches an operator —
including saying plainly when the numbers are too thin to conclude anything.

## Source Of Truth Rule

Before adding a new store or UI-only state, locate the authoritative model:

- persisted aggregate types: `src/server/types.ts`;
- aggregate storage and backend selection: `src/server/storage.ts`;
- domain server modules: `src/server/`;
- server-only integrations and evidence builders: `src/lib/server/`;
- reusable domain calculations: `src/lib/`;
- API boundaries: `src/app/api/`;
- UI routes: `src/app/portal/`.

Prefer extending these layers over introducing a second representation of the
same client, task, invoice, stage, alert, or portal.
