# Lineage — how a number on a screen traces back to a record

*Companion to [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md). Machine-readable
joins live in `src/lib/data/metricRegistry.ts` (`computedBy`,
`radarFamilyId`, `overlaps`) and `src/lib/data/semanticRegistry.ts`
(provenance per entity).*

## 1. The three metric identity schemes and their join

| Scheme | Example | Lives in |
|---|---|---|
| KPI / descriptor id | `lead-conversion` | `commandIntelligenceService.ts` makeKpi / `commercialIntelligence.ts` makeFormula |
| Radar rule family id | `lead-conversion-rate` | `radarRuleCatalog.ts` (172 families × 12 lenses) |
| Evidence series id | `sales:lead-conversion-rate` | `radarEvidence` vault (`${domain}:${familyId}`) |

The join is declared per metric as `radarFamilyId` in the canonical registry
(previously hand-passed as makeKpi's `familyId` argument with nothing
checking it). Evidence sampling only records checks with
`scope==="kpi" && lens==="threshold" && numeric value` — that filter is why
some KPIs have rich histories and others plot a single honest point.

## 2. Worked traces

**Radar → canonical records.** A Radar check (e.g. `sales/lead-conversion-rate`
threshold) reads the commercial lifecycle snapshot ← built from `pipelineCards`
+ `Lead` records + `clients` (all agency-filtered PortalState collections) ←
cards/leads created from `brand_enquiries` rows via capture + identity
resolution (which stamps `identityResolution` — confidence, reasons,
explanation — onto the enquiry's metadata) ← raw form POST, consent-gated at
the RLS policy. Every hop is inspectable: the check carries `evidence[]` and
`sourceIds`, the Radar's source-dataset inspection lists the records, and the
review trail lives in `identityResolutionReviews`.

**KPI Explorer point → storage.** Descriptor `series` ← `CommandKpi.history`
← evidence vault points (`radarEvidence`, retained 14d/60d/365d by tier) ←
sweep writes ← the same snapshot builders. The descriptor never recomputes
(pinned by `smoke-kpi-registry.test.ts`).

**Traffic KPI → beacon (the weak edge).** `traffic-7d` ←
`clientTelemetryService` ← `Client.metadata.telemetryEvents` (untyped bag,
random event ids, **no dedupe** — a replayed beacon double-counts) ← Aqua Tag
POST `/api/telemetry/collect` (rate-limited, consent-gated; only consent
events get a durable audit row). Fixing this edge is MIGRATION-PLAN Phase 5.

**Inbox message → provider (the strong edge).** Inbox row ←
`append_inbox_provider_message` RPC ← webhook event claimed by lease
(`claim_inbox_webhook_events`, idempotent by `event_key`, retention-pruned)
← provider POST. Duplicate delivery cannot double-write
(`external_message_id` ownership checks include multipart ids).

## 3. Provenance strength by area (honest grades)

| Area | Grade | Evidence |
|---|---|---|
| Inbox messaging | **Strong** | provider ids as idempotency facts, lease-claimed events, atomic RPCs, race reconciliation |
| Enquiry capture | **Good** | per-field mapping provenance (`configured\|detected\|absent`), `purposeSource` (declared/chosen/guessed), submissionId + ingestionState, identity-resolution stamps |
| Identity resolution | **Good** | frozen resolution + reasons + confidence per review; append-only classification history on Person |
| Access kernel | **Good** | every mutation audited with actor + ids; grants keep request back-reference |
| Connections | **Adequate** | connection-level status/test/actor stamps — but **no record-level back-reference** from data an integration wrote to the connection that wrote it |
| Telemetry | **Weak** | random ids, no dedupe, no batch identity |
| Imports generally | **Absent** | no import-batch records, no content checksums anywhere in `portal/src` |
| Audit trail | **Capped** | idempotent + redacted, but 50k hard cap evicts silently |

## 4. Deliberate non-lineage (by design, keep)

Client-website submissions: Aqua stores only `{clientId, table, rowId,
timestamp}` and never copies the client's row — a data-controller boundary
(`types.ts:4375-4392`). The `rowId` may dangle after the client deletes the
row; surfaces must render that honestly rather than caching a copy.

## 5. Secrets never enter lineage

Credential-class fields (scrypt hashes, `encrypted_access_token`, external
assistant keys, vault-encrypted secrets) are excluded from derived datasets
and redacted from activity metadata by pattern
(`redactActivityValue`). Any new derived model must consult the sensitivity
class in the semantic registry / metadata contracts before copying a field.
