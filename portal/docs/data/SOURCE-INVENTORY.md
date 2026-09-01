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
| Business Radar snapshot (`BusinessIssueRadar`) | `engines/data/server/radar/businessIssueRadar.ts` | cache only; **evidence** persists (below) | Command Centre, Advisor, My Radar |
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
