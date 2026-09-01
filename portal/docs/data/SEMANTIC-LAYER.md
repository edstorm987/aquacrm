# The canonical semantic layer

*The machine-readable authority is `src/lib/data/semanticRegistry.ts`,
enforced by `scripts/smoke-semantic-registry.test.ts` (every PortalState
collection classified, exactly; relationships resolvable; retention stated
wherever personal data is classified). This document is the prose view — if
it disagrees with the registry, the registry wins and this file has a bug.*

## 1. Entity map

Thirty-three entities cover the concepts the product operates on. Grouped:

- **Tenancy & identity** — `tenant` (Agency), `tradingCompany`, `workspace`
  (five senses, mostly not a persisted entity), `userAccount`, `staffMember`,
  `role`, `permission`, `resourceEntitlement` (grant/template),
  `approvalRequest`.
- **CRM** — `person`, `organisation`, `prospect`, `client`, `endCustomer`,
  `contactPoint`.
- **Journey** — `enquiry`, `journey` (pipeline), `opportunity` (card),
  `lifecycleStage`.
- **Communication** — `conversation`, `communication` (message),
  `inboxItem` (derived), `action`.
- **Delivery** — `project`, `fulfilmentItem`, `task`.
- **Commerce** — `product`, `financialEvent`.
- **Platform** — `provider`, `integrationEvent`, `auditEvent`, `evidenceItem`.

Each entry in the registry carries: canonical definition, id rule, tenancy
scope + tenant fields, source of truth, plane, provenance, timestamp
semantics, sensitivity, retention, lifecycle states/transitions, confidence
notes, relationships.

## 2. The distinctions that keep the vocabulary honest

Machine-readable as `SEMANTIC_DISTINCTIONS`; the load-bearing ones:

| Not the same thing | The rule |
|---|---|
| **Person vs client** | A Person is a human; a Client is a *workspace*. `Client.personId` names the human; one buyer relationship (`relationshipId`) may own several isolated client workspaces sharing one person. |
| **Organisation vs workspace** | Organisation = the customer's real-world company. Workspace = Aqua-side structure. `TradingCompany` = the agency's *own* business — a third thing that never "becomes an agency". |
| **User account vs staff member** | A login (`users.ts`, keyed by email) vs an employment record (`people.ts`). Linked via `PeopleEmployee.userId`, deliberately separate storage. The CRM `Person` is a third record again. |
| **Role vs permission vs entitlement** | Role: which surfaces a session may enter (8-value union, ceiling only narrows). Permission: one capability string (`element.<key>.<view\|use\|manage>`, manage⇒use⇒view). Entitlement: an `AccessGrant` binding capabilities to one user + scope + environment, optionally templated, path-narrowed, expiring. |
| **Project vs fulfilment** | Project = technical artefact (repo, preview, editor). Fulfilment = the operating model delivering a sold service (phases, briefs, deliverables). Neither implies the other. |
| **Enquiry vs prospect** | One inbound ask (raw row) vs a pursued relationship on a journey. Many enquiries per prospect via identity resolution. |

## 3. Timestamp doctrine (`TIMESTAMP_DOCTRINE`)

`occurred` (event time — sent_at, issuedAt) ≠ `created` (ingestion time) ≠
`updated` (bookkeeping) ≠ `effective` (targets, grant windows) ≠ `measured`
(readings). A client-form row's own timestamp maps to `core.submittedAt`
precisely because it is the client's clock, not Aqua's
(`clientFormMapping.ts` keeps them apart by construction).

## 4. Value doctrine (`VALUE_DOCTRINE`)

- **missing** = null/undefined, renders "—"; a missing date must never render
  as today (regression #169).
- **zero** = a real measured 0, only valid when the instrument was live —
  `CommandDemandFlow.pageviews` is `number | null` so a fake zero is
  *unrepresentable*.
- **false** = an explicit negative answer.
- **unknown** = instrumented but unanswerable now — Radar `blind`, surfaced
  as a blind spot, never a pass.
- **not-applicable** = the dimension doesn't exist — modelled by field
  absence (radar memory: "absent means not retained; `[]` means genuinely
  none").

## 5. Approval-request lifecycle — why five states are four-plus-two

The brief asks for pending/approved/denied/expired/revoked. As built, and as
the registry records: the **request** is
`pending → approved | denied | cancelled`, while **expiry and revocation are
grant lifecycle** (`expiresAt` passive, `revokedAt` audited + `accessRev`
bump). This decomposition is deliberate — a request that was approved stays
approved as a historical fact even after its grant expires — and both records
are retained in all terminal states. Approval must *narrow* the request
(capabilities and expiry), self-approval is rejected, and every transition is
audited.

## 6. Metric semantics

`src/lib/data/metricRegistry.ts` gives every metric one stable
`canonicalId` (`<kind>:<id>`), one definition, grain, dimensions, window,
timezone, direction, freshness, confidence, owner — and names `computedBy`,
the single authoritative calculation site, instead of restating the formula
(restating it would recreate the second-source-of-truth problem). Known
competing calculations are linked as `same-quantity` overlaps;
`smoke-metric-registry.test.ts` pins the registry to the defining source
files, pins the one existing bare-id collision, enforces canonical durable
references (including deterministic legacy migration), and golden-tests the
boundary semantics of the dedup-hazard metrics. Target/baseline authority stays with
the layered `KpiTargetsConfig` (agency → company, with effective-from
history) — the registry does not duplicate targets.

## 7. Metadata namespaces

`src/lib/data/metadataContracts.ts` catalogues all 124 keys across the
client/enquiry/activity/auth-user bags into 16 namespaces (contact,
crm-lineage, identity, routing, journey, portal-provisioning, portal-config,
product, finance, telemetry, inbox, consent, delivery, files, bespoke,
system), each with owner, type and sensitivity.
`smoke-metadata-contracts.test.ts` scans the source tree: an uncatalogued key
fails the suite, and dead entries fail it too. A namespace is the unit a
strangler migration moves (MIGRATION-PLAN §phases).
