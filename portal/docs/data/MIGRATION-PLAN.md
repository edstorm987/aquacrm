# Migration plan — strangler, one coherent vertical slice at a time

*Rules that bind every phase below: the PortalState/blob system is not
deleted; existing APIs and UI behaviour are preserved; each phase is
independently deployable and reversible; backfills are idempotent with
dry-run, checkpoints, counts, reconciliation and rollback instructions;
legacy fields are not removed until parity and rollback have been
demonstrated; reads switch only after legacy-vs-canonical comparison. The
house template for "two copies coexist until the new one is CONFIRMED" is the
sidecar split's `sidecarPopulated` discipline (`storage.ts`) — every
extraction below follows it.*

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
to the existing bus emit-then-mark (a crash between the two redelivers rather
than silently losing — at-least-once, consumers stay idempotent),
`emitDurable` is the drop-in for detached emit sites, delivered rows prune
after 14 days / 5,000-row cap with pending never pruned. Envelope carries
name + version, actor, tenant, source, correlationId (defaults to the event
id), causationId, and occurredAt strictly apart from recordedAt. First
adopted call site: `tenants.createClient` → `client.created` (payload
unchanged; pinned by source-scan). Company promotion classifies the
collection as `leave` (events are the origin tenant's history).

**Adoption COMPLETE for the foundation (2026-08-30, second pass):** every
`emit()` under `src/server/**` now announces through the outbox —
agency.created, client.updated/stage_changed (tenants + productWorkspaces),
user.signed_up, action.completed, person.created/updated/classified,
organisation.created/updated — plus the plugin lifecycle events
(built-ins/runtime + ensureLeadsPipelineInstall). `smoke-outbox.test.ts`
pins the manifest: plain `emit(` under `src/server` is confined to the bus
and its drain. The drain is deliberately SYNCHRONOUS (nothing in it awaits),
so all outbox writes settle before the domain function returns — an async
drain left delivered-marks trailing into "a GET does not write" pins.
Deliberately still plain: the plugin PORT adapters
(built-ins/runtime/foundation-adapters) and module-internal emits — the one
seam a later phase flips to make every plugin event durable at once.

**Correlation scope SHIPPED (2026-08-30, third pass):** `runWithCorrelation`
(AsyncLocalStorage) groups every event recorded inside one operation under
one correlationId — explicit values still win, defaults return outside the
scope — and `updateClient`'s updated/stage_changed pair now shares a
correlation with the stage move naming the update as its cause. Both pinned
in `smoke-outbox.test.ts`.

Remaining in this phase: flip that port-adapter seam (with volume review);
wrap the other multi-record operations (lead conversion, company promotion)
in `runWithCorrelation` as each is touched; a cross-process claim (lease)
when the outbox extracts to a table — the in-blob version's single-instance
serialization is what synchrony buys.

- **No event-sourcing claim**: state is not rebuildable from events; the
  outbox supports reliability and lineage, nothing more.

## Phase 4 — journey (enquiries → pipelines → conversion)

Apply the enquiry agency-column migration outcome; move
`enquiryContactDetails`, `pipelines`, `pipelineCards`. Conversion lineage
stamps (`leadId`, `promotedFromLeadId` — crm-lineage namespace) become real
columns. `smoke-enquiry-tenant-isolation`, `smoke-enquiry-dedupe`,
`smoke-lead-identity-conflict` are the parity oracles.

## Phase 5 — telemetry out of the metadata bag + import provenance

The highest-risk derived-data dependency: `Client.metadata.telemetryEvents`
(sole source of traffic/forms/conversion KPIs, no dedupe) becomes an
append-only table keyed by a **deterministic event id** (site key + beacon
content hash + time bucket) so replays stop double-counting; ingest stamps
`connectionId`/site provenance. Golden KPI tests must produce identical
numbers across the switch for a captured fixture week. Finance facts
(`clientPaymentPlans`, invoice keys — finance namespace) extract next with
the same care; money before convenience.

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
4. Retire the `campaign-roas` bare-id collision: namespace the commercial
   descriptor ids (`commercial:` prefix, as evidence/custom already do),
   with saved custom-KPI definitions migrated by backfill.
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
- Sandbox realms multiply every extraction: tables carry `realm_id` (default
  `live`) or extractions exclude realm-scoped rows until designed — decide
  per slice, recorded in its ADR.
- Do not build against the empty first-cut tables (`clients`,
  `client_portals`, `client_portal_members`, `audit_events`) without a
  decision to adopt or drop them.
