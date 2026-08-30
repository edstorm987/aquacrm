# Data dictionary — authoritative fields of the core entities

*Field-level companion to [SEMANTIC-LAYER.md](SEMANTIC-LAYER.md). Types are
quoted from `src/server/types.ts` (the compile-time authority); this file adds
the semantics a type cannot carry. Collections not detailed here are
classified in `PORTAL_STATE_COVERAGE` and typed in types.ts; the 123 metadata
keys are individually contracted in `src/lib/data/metadataContracts.ts` and
not repeated here.*

Conventions: timestamps are epoch ms UTC. `agencyId` on a record is the
enforceable tenant boundary (JS-enforced today, column+RLS as slices
extract). "SoT" = source of truth.

## Agency (tenant) — `state.agencies`

| Field | Type | Semantics |
|---|---|---|
| `id` | string | Stable tenant id. SoT for tenancy joins. |
| `slug` | string | Unique, display/routing. |
| `status` | `active\|paused\|archived` | Lifecycle; no deletion flow exists. |
| `holdingAgencyId` + `companyId` | string? | Set **together or not at all**: marks this tenant as the portal backing one trading company; must stay two-way with `TradingCompany.portalAgencyId` or the third tier evaporates. |
| `createdAt`/`updatedAt` | number | ingestion/bookkeeping. |

## Client (workspace) — `state.clients`

| Field | Type | Semantics |
|---|---|---|
| `id`, `agencyId` | string | id SoT; agencyId the boundary — every read path filters on it (`tenants.ts` discipline). |
| `relationshipId` | string? | Groups several isolated workspaces of one buyer. |
| `personId` | string? | The canonical human. Clients sharing `relationshipId` share `personId`. |
| `companyId` | string? | Owning trading company. |
| `stage` | `ClientStage` | Kept as a string union for agency-customised phases; the six `aqua-*` stages are the canonical progression. **Not** a delivery stage — per-product service stages live on assignments. |
| `status` | `active\|paused\|archived` | Lifecycle distinct from stage. |
| `metadata` | `Record<string,unknown>` | Governed escape hatch — every key contracted in `metadataContracts.ts`; new keys fail the suite. Finance/telemetry/inbox namespaces are extraction targets. |
| `ownerEmail` | string? | PII; part of identity-resolution evidence. |

## ServerUser — `state.users` (keyed by lower-cased email)

| Field | Semantics |
|---|---|
| `agencyIds: string[]` | The real membership list (multi-agency, R025). |
| `agencyId` | Legacy mirror of `agencyIds[0]` — kept for 56+ call sites; never write it independently. |
| `clientId` | Required binding for `client-*`, `freelancer`, `end-customer` roles. |
| `passwordHash` | scrypt `scrypt$N$r$p$salt$derived` — credential class; never leaves the server. |
| `sessionRev` / `accessRev` | Revocation counters — bumping invalidates live sessions / cached access. SoT for "is this session still valid". |
| `role` | One of the 8-value union; cross-checked against the session on every read (`resolveFreshSessionUser`). |

## Person — `state.persons`

| Field | Semantics |
|---|---|
| `emails[]` / `phones[]` | Each keeps normalised `value` + original `raw` + `label` + `isPrimary`; `PersonPhone.shared` marks switchboards that must never identify a person without a compatible name. |
| `classification` (+ `classificationHistory[]`) | 9-valued, hand-set, append-only history `{from,to,at,by,note,sourceType,sourceId}`. |
| `facets` | `{leadId?, contactId?, clientIds?, enquiryIds?}` — retained through reclassification, never deleted ("changing what somebody IS must never destroy what they DID"). |
| `state` | **Derived** by `derivePersonState` — never hand-set. |
| `organisationLinks[]` | `suggested\|confirmed\|rejected`; rejected links retained so a dismissed guess doesn't resurface. |

## AccessGrant — `state.accessGrants`

| Field | Semantics |
|---|---|
| `userId`, `scope`, `environment` | The binding: scope kinds `agency\|workspace\|client\|project` (parent ids legal only on workspace), environments `live\|sandbox` — revoke independently. |
| `capabilities` (+ `templateId`) | Additive; templates merge only when same-agency, un-archived, and the template permits the scope kind + environment. Delegation requires the granter to hold everything granted. |
| `allowedPaths` | Repo-relative; may only **narrow** (intersected with the project's own). |
| `expiresAt` / `revokedAt`+`revokedBy`+`revokeReason` | Grant lifecycle; revocation bumps `accessRev` and is audited. Revoked grants retained forever. |
| `requestId` | Provenance link to the approving request. |

## Enquiry — `brand_enquiries` (Supabase, raw plane)

| Column | Semantics |
|---|---|
| `id` uuid | SoT id. |
| `name`,`email?`,`phone?`,`message?` | The canonical capture vocabulary (`CORE_KEYS`); client-database submissions map ONTO these with per-field provenance `configured\|detected\|absent` (`clientFormMapping.ts`), unrecognised answers kept in `additional[]`. |
| `consent` bool | Enforced in the anon INSERT policy's WITH CHECK, not only app code. |
| `agency_id` | The tenant column — migration written 2026-08-20, applied by hand; until applied, `metadata->>'agencyId'` is the fallback and inserts retry without the column on PGRST204. |
| `created_at` | Ingestion time. Event time, where the source row carries one, maps to `core.submittedAt` and is deliberately kept distinct. |
| `metadata` jsonb | Routing + provenance keys — all contracted (routing/identity/consent namespaces). |

## Inbox family — `inbox_*` (Supabase; the properly-scoped template)

All five tables carry a real `agency_id` column; grants deny anon and
authenticated outright (service-role only). `inbox_messages.sent_at` =
occurred; `created_at` = recorded; `external_message_id` dedupes provider
redelivery (multipart ids included); `inbox_webhook_events.event_key` is the
import idempotency key, claimed via lease RPC, pruned past retention.
`encrypted_access_token` is AES-256-GCM via `PORTAL_VAULT_ENCRYPTION_KEY` —
credential class, never in derived data.

## ActivityEntry — `state.activity` (audit trail)

`{id, ts (occurred), agencyId, clientId?, actorUserId?, actorEmail?,
category (30-value union), action (past-tense verb, e.g. "client.created"),
message, metadata?}` — idempotent by key (sha256 → id), secret-shaped
metadata keys redacted before write, **hard cap 50,000 with silent
oldest-first eviction** (recorded risk).

## Radar evidence — `state.radarEvidence`

Series keyed `${domain}:${familyId}`; per series: typed points (5-minute
buckets, 14-day raw retention), hourly rollups (60d), daily (365d), rolling
baseline (undefined under 3 points — never fabricated), `expectedDirection`,
first/last seen. The metric registry records each KPI's `radarFamilyId` join.

## Metric descriptor (derived, not stored) — `KpiDescriptor`

22 fields projected verbatim from built snapshots; `series` caps at 24
points. Identity and semantics come from `CanonicalMetricEntry`
(`metricRegistry.ts`): `canonicalId` = `<kind>:<id>` is the stable join key;
`computedBy` names the one calculation authority; `overlaps` link every known
competing calculation. Bare-id collisions are pinned to exactly
`["campaign-roas"]`.
