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
- **Events are in-memory fire-and-forget.** `eventBus.ts` loses events on
  process exit and does not cross serverless instances; `automationRuns` is
  the only durable shadow. There is no outbox, no correlation/causation ids.
- **Derived intelligence is strong but identity-fragmented.** The radar
  evidence vault is typed, three-tier retained, honestly absent-vs-empty, and
  golden-tested; but metric identity was split across three schemes and at
  least nine business quantities were computed in 2–4 places
  (SOURCE-INVENTORY §2).
- **123 metadata keys** hide whole subsystems inside `Client.metadata`
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
  immutable-in-practice and idempotent. *Telemetry ingest is the gap*: events
  get random ids and no dedupe — MIGRATION-PLAN phase 5 gives beacons a
  deterministic identity before any "raw layer" claim covers them.
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

Target: a **transactional outbox** written in the same mutation as the state
change (an `outbox` collection first, a table when its slice extracts), with
stable versioned past-tense names, actor/tenant/source, correlation and
causation ids, `occurredAt` + `recordedAt`. The in-memory bus becomes a
delivery mechanism fed from the outbox, not the record. Imports stay
idempotent by provider ids (`event_key`, `external_message_id`,
`submissionId`) and gain checksums where payloads lack ids. We do not claim
event sourcing: state is not rebuildable from events and the docs must never
say otherwise.

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
