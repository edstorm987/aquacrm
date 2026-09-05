# Fractal Radar — Architecture & Migration Plan

> **Provenance.** Produced 2026-09-05 by a 14-agent design workflow (7 parallel
> code maps → 3 competing designs → 3 adversarial critiques → synthesis), every
> load-bearing claim verified against source that session. It **corrects the
> original premise** where the code contradicts it — read §1 before building.
> This is the design of record for the Radar rework in the production goal; the
> phased migration in §8 is what the goal's Radar workstream executes.
>
> **Origin of the idea:** Ed's proposal to fractalise the Radar into mini-radars
> (cheap always-on top-level sweep → descend the problem chain only where red →
> full sweep on demand → event/DB-triggered targeted checks + "alerts as it
> goes"), with a semantic grouping layer on top, fast-first, and blind-spots
> first-class ("know what being blind means"). See the conversation of 2026-09-05.

---

## 1. The idea in one paragraph — and an honest correction

**The idea, in Ed's terms:** every workspace, template, and monitored element gets its own *mini-radar*; the whole business radar is those mini-radars composed into one; a cheap always-on sweep watches the top level, and where a top-level element is red we *descend the problem chain* into its secondary and tertiary checks, computing deeply only where there is actually a problem. Full radar runs on demand; a specific-area query runs only that area; database writes and events trigger a re-check in the affected area and raise alerts "as it goes."

**The correction to make before building.** The premise that the cost is "~2000 checks" and that computing "~200 suites" instead saves the day does **not** hold against the code. The 2,064 catalog checks (`BUSINESS_RADAR_RULE_CATALOG` = 172 signal families × 12 lenses, `radarRuleCatalog.ts:238-249`) are **pure arithmetic over ~183 pre-computed observations** (`evaluateLens`, `radarCheckEngine.ts:138-303`) — they are the *cheap* part. Running fewer of them saves almost nothing. The real render cost is three things the lens count hides:

1. **`buildRadarObservations` scanning the entire `PortalState` once** to produce the ~183 observations (`radarObservations.ts:37`) — one monolithic function, not decomposable per-domain today.
2. **The awaited async loaders**, above all **`listOperationalAlerts`** — an ungated, single-threaded, whole-portfolio in-memory scan with a live Supabase read and two write-on-read side effects (`operationalAlerts.ts:89`), consumed as one of five `Promise.allSettled` inputs (`businessIssueRadar.ts:134-140`). MEMORY records this exact sweep as the shared render-time culprit (Command Centre 5.8s→178ms came from *caching this sweep*, not from fewer checks).
3. **`buildClientRadarFleet`** — its batch I/O (`listRadarInvoices` for all clients, `listClientMilestones`, telemetry, the alert sweep) runs **once before** the per-client loop (`clientRadarService.ts:102-119`); only per-client rule-evaluation CPU scales with client count.

So the fractal payoff is **not** "compute 200 not 2000." It is: **(a) per-node caching** so an unchanged client or domain is never recomputed; **(b) gating the expensive loaders** so they don't run wholesale on every render; **(c) on-demand/targeted descent** so most page renders read a cheap cached top level and pay the deep cost only where red or when explicitly asked. The lens/family "descent" imagined is genuinely valuable — but for **alerting and drill-down presentation** (surfacing the exact failing lens in the problem chain), not for CPU savings. Keep it for that, and put the efficiency win where the cost actually is.

---

## 2. The node / suite tree

Every node identity below already exists as a field on data the radar emits — **no per-rule registry edits are needed**; parentage is a pure function of `BusinessRadarCheck` fields (`businessRadar.ts:202-231`).

```
L0  Agency (× realm)                      key: `${realmId}:${agencyId}`     ← businessIssueRadar.ts:88
    │  (realm = getActiveDataRealmId(); LEAD_AGENCY_ID excluded)
    │
    ├─ L1  Domain × 12                     AdvisorDomain                      ← businessRadar.ts:9-21
    │   │   rollup EXISTS: RadarDomainSummary (assurance/confidence/readiness/blind)  ← :277-294
    │   │   presentation rollup: 6 finding groups (radarFindingGroup)         ← radarClassification.ts:127-134
    │   │
    │   └─ L2  Signal family × 172          check.familyId / DOMAIN_SIGNAL_FAMILIES ← radarRuleCatalog.ts:38
    │       └─ L3  Lens check × 12/family    RADAR_RULE_LENSES → BusinessRadarCheck   (leaf; the 2,064 matrix)
    │
    └─ L1'  Monitorable entity × N          collectRadarCoverageEntities       ← businessIssueRadar.ts:828
        │   RadarCoverageEntityType: client | product | property | integration | portal-connection | trading-company  ← businessRadar.ts:58
        │   (entities roll UP into domains; they are a parallel spine, not a rival tree)
        │
        └─ Client × N   ClientRadarSnapshot (already a self-contained mini-radar)  ← clientRadar.ts:161
            └─ Client element × 8  overview|relationship|fulfilment|marketing|systems|commercial|communications|portal ← clientRadar.ts:16
                └─ product / property sub-node   entity.parentId chain          ← businessRadar.ts:171-176
```

**Why domains are the primary L1 and not the governed workspaces.** `RadarDomainSummary` already carries the exact three-axis split the contract needs, computed at the domain tier by `summarizeRadarChecks` (`radarCheckEngine.ts:60-103`). The governed workspaces (`staff|growth|fulfilment`, `workspaceElementAccess.ts`) are an **access mask / projection** over these nodes (who may descend where), not a third compute tree — there is **no single `domain→element` table**; the crosswalk `RADAR_SOURCE_DATASET_RULES` (`radarSourceInspection.ts:193`) is many-to-many and per-data-source. Treat workspaces as the visibility filter (§4 targeted query), never as suites that compute.

**The client subtree already IS a fractal mini-radar** (`buildClientRadarSnapshot`, `clientRadar.ts:161`): its own `healthScore`/`confidencePercent`/`readinessPercent`, its own checks grouped into packs, its own per-product/per-property sub-nodes. It rolls up into the business radar via `issues.push(...clientRadars.flatMap(r => r.issues))` (`businessIssueRadar.ts:441`). This is the working template to generalise — but see §3/§4 for the two ways the existing gating misleads.

**Known gap (not a node):** `development.*` / `project.*` (the Dev Workspace, one per project) exist in the governance vocabulary but the radar does **not** sweep them. "Every workspace/template has its own mini-radar" is realised for clients and entities, not for the project subtree — future scope, not something to claim exists (§9 Q7).

---

## 3. The node contract

Every node — domain, family, client, element — returns the same small summary, and this is where the "green without evidence" hazard is closed. The vocabulary already exists; **add no new `RadarCheckStatus` value** (a new enum ripples through `evaluateLens`, `summarizeRadarChecks`, `recordRadarSweep`'s status filter at `radarMemory.ts:88`, and the `RadarEvidencePoint.status` union at `types.ts:3724`).

```ts
// PROPOSED, additive — mirrors RadarDomainSummary's existing shape
interface RadarNodeResult {
  key: string; level: "group"|"domain"|"family"|"entity"|"element"; parentKey?: string;
  // three axes kept SEPARATE, never collapsed to one green — as RadarDomainSummary already does (:288-291)
  health: RadarCheckStatus;      // pass|critical|warning|watch|blind|learning|inactive
  assurancePercent: number;      // health backed by evidence
  confidencePercent: number;     // how much evidence stands behind it
  readinessPercent: number;      // setup / instrumentation completeness
  firing: number; blind: number; learning: number;
  // descent bookkeeping — the anti-"green-because-we-didn't-look" flags
  descent: "descended" | "suppressed-clean" | "blocked-blind" | "stale-dirty";
  childCount: number; childrenObserved: number;
  computedAt: number; evidenceCheckedAt?: number; dirtyAt?: number;
}
```

**How "green without evidence" is prevented — three mechanisms, all reusing existing semantics:**

1. **A node that was not descended is `learning` or `blind`, never `pass`.** `summarizeRadarChecks` already excludes **both** `blind` and `learning` from `assuredChecks` and weights `learning` at 0.25 confidence (`radarCheckEngine.ts:76,82`). So `descent: "suppressed-clean"` mechanically caps `confidencePercent` well below 100 and drops `assurancePercent`: the node reads "top signal clean, sub-checks not yet evaluated," which is honest and never a full-confidence green. A node that *could not* descend for lack of evidence is `blocked-blind` → `blind`, exactly as `evaluateRadarRule` returns `blind` ("explicit instrumentation gap, not a healthy result") for a missing/unconnected observation (`radarCheckEngine.ts:112-128`).

2. **Blind-spots stay actionable, not a count.** Do **not** replace the watchdog blindness checks with a `childrenObserved/childCount` ratio — a ratio is "a vague count with nowhere to act," which the CLAUDE.md operational-alert contract forbids. Undescended/blind nodes must still surface the existing routed, evidenced issue `coverage:{domain}-check-blindness` (`businessIssueRadar.ts:510-522`), which carries `href`/`evidence`. The ratio is a *supplementary* readiness signal, never the alert.

3. **The descent condition itself must be able to see the faults it gates on (the critical fix).** The naïve "descend if the top signal is red" fails because the cheap top signals — the connection lens (always `pass` when connected) and `calculateClientAquaHealth` (fed only finance/contact/requests/contracts/telemetry, `clientAquaHealth.ts:43-59`) — are **structurally blind** to the exact criticals descent would find: blocked milestones, over-budget campaigns, blocked product decisions, `errors24h>=5`, urgent support, and derived-lens deterioration (`trend/anomaly/baseline/forecast/volatility`). Gating descent on those top signals would let a red client read green and drop the alert entirely — worse than a vague count. **Fix:** the "top signal" is a purpose-built **conservative fault pre-scan** computed from the arrays the fleet *already batch-loads* (milestones, campaigns, decisions, `errors24h`, requests — all in memory after `clientRadarService.ts:102-119`), evaluating the **critical-eligible** checks cheaply and always; only the derived/history lenses and non-critical rollups are deferred to descent. In practice: **run all cheap in-state critical checks; defer only what genuinely needs the evidence vault or per-entity deep I/O.**

---

## 4. Descent

**Cheap top-level summary (the always-on sweep).** `radarTopSweep(agencyId, now): RadarNodeResult[]` returns L1 domain nodes + entity rollups from the per-node cache (§6), computing only: (i) the conservative critical pre-scan (§3.3) over already-in-memory state, and (ii) cached/persisted child summaries folded up (max-severity for health, min for confidence, sum for blind — the fold shape `summariseFindingGroups` already uses, `businessIssueRadar.ts:860`). It does **not** run the expensive awaited loaders wholesale and does **not** re-gather observations for cache-clean subtrees. This is what the agency sidebar (`layout.tsx:164`) and Command Centre's paused state (`buildPausedBusinessRadar`) should read.

**Branch / descend condition:**
```
descend(node) :=
     node.faultPreScan is non-green            // a critical-eligible check fired  (§3.3 — the honest trigger)
  OR node.cached.blind > 0                      // unproven ⇒ must look
  OR isDirty(node) && dirtyAt > computedAt      // an event marked it (§5)
  OR node.cache is stale (age > TTL)            // backstop
  OR request explicitly targets this node       // on-demand / targeted
```
Note what is **absent**: descent is *not* triggered by a connection-lens "green" or an aquaHealth "strong." Honesty and efficiency are reconciled by making the cheap pre-scan able to see criticals, so a clean pre-scan genuinely means "no critical in the cheaply-checkable set," while derived-lens deterioration is caught by the evidence-vault movement check the pre-scan also runs (comparing the current in-memory value to the stored series last point in `radarEvidence`, `radarEvidenceVault.ts`).

**On-demand full radar.** Reuse the existing stored-handle door: `POST /api/portal/agency/command-scan` already runs the heavy graph off the render path and returns an opaque handle that GET reads back. "Full radar" = force-descend every node there. The full build remains the writer of record for evidence/memory (§7) — render-path partial descent never writes durable state (`recordRadarSweep` is not on the render path).

**Targeted query.** `radarDescend(agencyId, path, now)` descends exactly one subtree. The single-client case **exists end-to-end**: `buildClientRadar(agencyId, clientId, {now})` (`clientRadarService.ts:258`) and its route `/api/portal/clients/[clientId]/radar`, fetched on-demand by `_ClientRadarPanel`. **But two corrections from the critiques:**
- Do **not** claim the fleet's `visible(element)` gate gives health-driven descent for free. `visible()` is a **permission** axis (`ClientRadarVisibility`); on the trusted business-radar path `visibility` is `undefined` so `visible()` is always `true` and skips nothing. Worse, forcing it false drives `compositeHealthVisible` (`clientRadarService.ts:144-148`), which suppresses inputs to `calculateClientAquaHealth` and marks finance `hidden` — "we didn't look" rendered as a non-actionable state, which the contract forbids. Health-driven descent is **new machinery**, not a reuse of `visible()`.
- A background/targeted recheck has **no request actor**. `buildClientRadar` with omitted visibility resolves the current actor's access (`clientRadarService.ts:269-271`) and will misresolve off-request; passing an actor-scoped visibility sets `actorScopedRead=true` and **strips the agency-wide alert collector** (`:102`), so the client can read green while an operational alert fires. **A recheck must call `buildClientRadarFleet` with `FULL_CLIENT_RADAR_VISIBILITY` and injected `operationalAlerts`** — which re-introduces the alert-sweep cost, so rechecks must be rate-limited (§5) and lean on the alert sweep's own 60s TTL.

---

## 5. Event / DB triggers — "alerts as it goes"

The seams are real; the granularity and the write-cost are the honest constraints.

**The single existing hook** is `ensureRadarSeedingRegistered` (`radarSeeding.ts:36`): 10 lifecycle events, each firing the **blunt whole-agency** `invalidateBusinessIssueRadarCache(event.agencyId)`. Widen this to a **per-node dirty map** — but only after the per-node cache exists (§6), because on today's flat `radarCache` (one entry per `realm:agency`) "mark `dom:clients` dirty" can only bust the whole-agency entry. **Sequencing: node cache first, then event-dirty.**

**Tier A — domain events → node (precise where possible).** The `on("*")` wildcard (`eventBus.ts:82`) covers plugin-defined names with zero new emit sites; the map is a static table. Honest granularity limits:

| Event (`AquaEventName`, `eventBus.ts:21-54`) | Dirty node(s) |
|---|---|
| `client.created/updated/stage_changed/archived` | `entity:client:<id>` **+ `dom:clients` + `dom:company`** |
| `person.created/updated/classified` (already `substantive`-gated) | `dom:clients` (+ client relationship if payload resolves) **+ `dom:company`** |
| `plugin.installed/enabled/…` | `dom:systems` + `entity:integration:<id>` **+ `dom:company`** |
| plugin `agency-finance.*` | `dom:finance` + `entity:client:<id>:commercial` **+ `dom:company`** |
| plugin `leads.*`, `website-enquiry.received` | `dom:sales` + `dom:inbox` **+ `dom:company`** |

**Two mandatory corrections:** (1) **every leaf mark must also dirty the cross-cutting rollup domains** — `company` (its families `overall-health`/`client-health` are explicit cross-domain rollups), and `compliance`/`team` need their own triggers (legal-document and user writes). Without this, a leaf write refreshes its own domain while the `company` tile reads a stale green — a direct contract violation. (2) **`client.updated` cannot distinguish which element changed** — no finance/invoice/task/milestone/element-level events exist — so event-dirtying is **whole-client**, not per-element. Element-level dirty tracking requires emitting new events from finance/task/milestone mutations (real new work — §9 Q3).

**Tier B — the universal net (writes with no domain event).** Surface the changed-key set `mutate()` already computes — **but key it off the `operations` diff paths (`operations[].path[0]`), NOT `beforeByKey.keys()`.** The coordinated write path (`replacePortalState`, `storage.ts:1574`) deletes and reassigns every top-level key, so `beforeByKey` = the whole state on every transactional commit and would mark every domain dirty. The `operations` diff lists only genuinely-changed collections. Map collection→domain (coarse): `clientMilestones→delivery`, `agencyTasks→operations`, `agencyWebsites/radarSyntheticProbes→systems/development/marketing`, finance `pluginData→finance`, `people*→clients+company`. This must be an O(1) `Set.add` + `queueMicrotask` on the hot write path — never anything that clones state.

**Operational alerts are a SEPARATE pipeline.** A `dom:*` recheck via `radarRulesForDomain` + `buildRadarCheckMatrix` does **not** recompute `listOperationalAlerts` (they arrive via a separate `Promise.allSettled` input). So "alerts as it goes" for operational alerts means re-driving `listOperationalAlerts` on its own (behind its 60s TTL), not for free from a domain recheck.

**Execution under single-instance + one-row constraints.** On `PORTAL_SINGLE_INSTANCE=true` CPU blocks all requests and each big-row write is 2–6s. Therefore:
- **Rechecks perform ZERO durable big-row writes** — pure read+compute+cache. All durable evidence/memory writes stay on the daily cron.
- **A cooperative serial queue** (new; modelled on `scheduleFlush`'s timer, `storage.ts:1425`, and the eventBus microtask) drains **one node at a time** with a ~15ms yield, plus a per-node cool-down and "collapse upward" (if >K sibling leaves are dirty, dirty the parent domain instead).
- **Coalescing:** per-node last-writer-wins + keyed post-commit dedup `deferUntilPortalStateCommit(kick, radar-kick:${agencyId})` (returns `false` outside a commit scope, so carry the `if(!defer) kick()` fallback).

**How the alert actually "fires."** On a recheck flip (`prev ∈ {pass,watch} → next ∈ {critical,warning}`, or `→ blind`): (i) the per-node cache is updated to already-red so the *next read* of any surface is correct and cheap — no 7–9s rebuild; (ii) **one tiny focused notification `mutate()`** (the per-key-diff proxy makes a single-row write cheap in *diff size* — though still a big-row commit, so rate-limited) carrying the flipped issue's `href`/`evidence`/`sourceIds`, satisfying "identify the exact evidence + direct resolution path." **No SSE/WebSocket transport was found** — "as it goes" means *next-read-is-already-red + a durable notification waiting*, not a socket push. **Human acceptance is preserved:** a flip produces a suggestion/alert only; `reconcileAgencyTasksWithRadar` stays the sole path from suggestion to committed work.

---

## 6. Caching per node

Replace the single `radarCache: Map<string, RadarCacheEntry>` with a per-`RadarNodePath` map that **preserves the proven entry shape** — `{expiresAt, value?, pending?}` with in-flight single-flight dedup (concurrent callers share `entry.pending`) and the `${realmId}:${agencyId}` prefix. Per-node TTLs come from the **already-declared** cadences in `RADAR_SWEEP_DEFINITIONS`: domain summary ~30s; probe/property children carry `deep`/`infra` staleness (daily); history/evidence children daily. Keep the existing **oldest-probe-wins** freshness rule so a fresh assembly never papers over day-old probe evidence; and keep the `agedOut→blind` degrade (`radarInfraChecks.ts:101-104`) so stale probe evidence rolls up as `blind`, not `pass`.

`markRadarDirty(node)` evicts that node **and its descendants**, and bubbles a cheap `needsAttention` flag up the parent chain (`…:commercial → entity:client → dom:finance → dom:company → agency`) **without recomputing parents** — so the always-on top level can render "attention below" the instant a leaf flips, and the deep descent runs only on drill-in or when the queue reaches it. A dirty-but-not-yet-rechecked node caches as `stale-dirty` + last-known-verdict and renders as recheck-pending (a `watch`-equivalent), **never** its old green.

Persist the node cache as a **fifth sidecar collection** (§7) so the daily sweep can seed it; on the render path it is read, and the 30s TTL + daily cron remain the backstop that reconciles anything the incremental layer misses — the incremental layer is an *accelerator over* derive-at-sweep, never the sole source of correctness.

---

## 7. Mapping today's checks / evidence / memory onto the tree (reuse, not rewrite)

- **The 2,064 catalog checks stay exactly as they are and keep being computed.** They are cheap, and the watchdog floors count them: `catalog-floor` ≥ 1,728 kpi checks, `domain-floor` ≥ 144/domain (`radarSentinels.ts:90,92`). **No phase lazily skips catalog checks, so the floors are never at risk.** Placeholders (a `descended?:boolean` marker, additive on `BusinessRadarCheck`) are kept only where genuinely useful: representing an *undescended entity/element* in the confidence rollup so it reads `learning`, not absent.
- **Node identity is derived, not declared.** `radarLeafParents(check)` and `projectRadarNodeTree(radar)` (new pure helpers beside `radarClassification.ts`) reduce the existing `BusinessIssueRadar` output into L0–L2 nodes using `check.domain`/`familyId`/`entity.parentId` + `radarFindingGroup()`. **Zero catalog edits.**
- **Evidence & memory already have the per-node substrate.** `radarEvidence.series[seriesId]` (per family/entity time series) supplies the derived-lens baselines and the "material movement" descent signal; `radarMemory.{issues,checks,sources}[id]` already keys lifecycle per node, so a parent can read a child's last-known verdict without recomputing it. **Do not re-key these.**
- **The hard whole-set constraints stay at the root and are handled explicitly:**
  - **Watchdog checks** (`catalog-floor`, `zero-blindness`, `coverage-gaps`, `radarSentinels.ts:89-125`) run **only on the full descend** (on-demand / daily) — they assert whole-tree completeness. In the top sweep they are not evaluated as pass/fail.
  - **Memory digest must NOT run on a partial sweep.** `buildRadarMemoryDigest`/`buildRadarMemoryIssues` diff the *whole* current set against the previous scan; on a partial render they would report spurious "recovered"/"assurance-drop"/"blindness-growth." **Hard rule: `buildRadarMemoryIssues` runs only on the full sweep.**
  - **Correlations** (`buildRadarCorrelationIssues`, `radarCorrelations.ts:109`) return `[]` when any evidence family is unobserved — silently suppressing cross-domain compound risk under partial descent. **Rule: correlations run only on the full sweep, OR their input paths are force-descended first and a blind-correlation path is built** (new work — §9 Q5).
  - **Whole-radar health score** (`companyHealth×0.7 + incidentHealth×0.3`, `radarPolicyEngine.ts:151-157`) is a global aggregate; the top sweep computes a *confidence-discounted envelope* from cached child summaries and only the full descend writes an authoritative score.
- **Independent quick win, orthogonal to all of this:** `applyAdaptiveRadarPolicy` runs **twice** per build (`businessIssueRadar.ts:535,614`). The second pass folds in `buildRadarMemoryIssues`, so it is *not* purely redundant — but the per-check policy resolution is repeated and can likely be collapsed for a partial saving. Worth a spike; needs none of the tree work.

---

## 8. Phased migration

Every phase is flag-gated, independently shippable, and rehearsed on an isolated Docker stack first per the storage-incident doc. **Perf figures are structural projections, not measured** — the only measured anchors are ~7–9s cold radar; 2–6s single-row writes; caching `listOperationalAlerts` gave Command Centre 5.8s→178ms. Before Phase 3, **measure** whether observation-gathering, the loaders, or fleet CPU dominates — the "fleet-dominant" premise is a MEMORY assumption, not verified in this code.

**Phase 0 — baseline (no work).** Classification metadata (`classifyRadarCheck`) and finding-group rollups already exist. Confirm `stampRadarCheckClassification` still stamps.

**Phase 1 — top-level tree as a pure projection, behind a flag.** Add `radarNodeTree.ts`; expose `projectRadarNodeTree(radar)` as `BusinessIssueRadar.nodes?`. Full build still runs. New read surface renders L1 from the projection. *Perf:* neutral. *Risk:* minimal, visual only. *Rollback:* flag off. *Proves:* tree + drill-down UI without touching the hot path.
> **CORE SHIPPED 2026-09-05** (`src/engines/data/radar/radarNodeTree.ts` + `scripts/smoke-radar-node-tree.test.ts`, 6/6): the pure `projectRadarNodeTree(radar): RadarNode[]` reducer — agency → domain → family + a parallel entity spine, wired by parent/child keys. Domain nodes reuse the authoritative `RadarDomainSummary`; family/entity nodes derive assurance/confidence with `summarizeRadarChecks`' exact formulas. The "never a false green" contract is pinned: an all-blind node reads `blind`, `pass` ranks above `blind`, blind/learning always counted separately and discounted in confidence. It is a pure projection (zero hot-path change), so it is safe ahead of Ed's §9 decisions.
> **EXPOSE-ON-OUTPUT SHIPPED 2026-09-05** (`withRadarNodeTree` + `radarNodesEnabled` in
> `radarNodeTree.ts`; `nodes?: RadarNode[]` on `BusinessIssueRadar`; wired into
> `buildBusinessIssueRadar`'s return; 2 new flag-contract tests, suite now 8/8 + business-radar
> 20/20). `buildBusinessIssueRadar` now attaches `radar.nodes` **only when `RADAR_NODES_ENABLED
> === "true"`** — off by default, so production radar output is byte-identical until the flag is
> flipped (verified: the real radar build passes with the flag off, `nodes` absent). The projection
> shape is fixed by the existing radar structure, **not** by any §9 answer, so this doesn't preempt
> Ed's decisions. **Remaining for full Phase 1:** the L1 read/drill-down UI surface that renders
> `radar.nodes` — needs the flag on + a **foreground browser** to verify (this session's pane is
> hidden/throttled), so it's the one Phase-1 piece left, gated on a real browser session.

**Phase 2 — gate the expensive loaders (the first real win).** This is where the measured MEMORY win lives, and it needs none of the tree. Ensure `listOperationalAlerts` (and `getRequestWebsiteEnquiries`/`listInboxSnapshot`) are served from their caches on every render surface, and that render paths pass `{operationalAlerts: []}` where the sweep isn't needed (the pattern Command Centre already uses). *Perf:* the big measured lever. *Risk:* low; alerts up to 60s stale (already production behaviour). *Rollback:* remove the gate. **(Much of this is already shipped 2026-09-04/05: the operationalAlertsCache, the Command Centre `operationalAlerts:[]` branch, and the plans.list `recover:false` render fix. Finishing = auditing every render surface that reaches the sweep and gating the rest.)**

**Phase 3 — per-node cache + conservative fault pre-scan.** Generalise `radarCache` to per-node (§6). Add the pre-scan (§3.3). Serve cache-clean nodes; recompute only pre-scan-red / stale / dirty nodes. *Perf:* saves per-node rule-evaluation CPU for unchanged nodes (the fleet's batch I/O is agency-wide-once and is *not* saved here — only the single-client targeted query narrows I/O). *Risk:* the "green because undescended" hazard — closed by `suppressed-clean→learning` + confidence cap + the pre-scan seeing criticals. *Rollback:* one flag → descend-all.

**Phase 4 — persist the node cache to a fifth sidecar (off the render path).** Register `radar-node-cache` in `SIDECAR_COLLECTIONS` (non-dedicated). Write **only** on the daily rollup, never on GET. Inherits the compare-and-swap machinery (no SQL migration) and its two documented traps. Non-lazy first — flip to `lazy:true` only once all radar reads funnel through one `getRadarNodeTree()` service that owns the `include`. *Risk:* storage — **caveat: those sidecars are proven but NOT applied to live; rehearse on isolated stack before any live write.** *Rollback:* stop writing; loader falls back main-wins.

**Phase 5 — event-dirty for ONE write path.** Widen `radarSeeding.ts` from whole-agency invalidate to per-node dirty-mark, starting with `client.updated`/`client.stage_changed` → dirty `entity:client:<id>` **+ `dom:clients` + `dom:company`**. Add the serial recheck queue with FULL-visibility + injected-alerts client rechecks. *Perf:* targeted freshness. *Bounded regression to accept:* between sweeps, a fault in an *undescended* node raises no alert until the daily rollup re-descends (mirrors the #170 daily-staleness decision — §9 Q2). *Rollback:* revert handlers to `invalidateBusinessIssueRadarCache`.

**Phase 6 — on-demand full + targeted query.** Route "full radar" through `POST …/command-scan` and specific-area queries through `radarDescend(key)`. GET renders read cached nodes + descend only red/dirty. Watchdog/memory-digest/correlations run **only** on the full path. *Perf:* render never pays a full descend. *Rollback:* flag forcing GET-full.

---

## 9. Open questions / decisions for Ed

1. **Accept the reframed win.** The efficiency comes from caching + loader-gating + on-demand descent, **not** "200 suites instead of 2000 checks." Phase 2 (loader gating) is the highest-confidence, already-measured lever and needs none of the tree. **Ship Phase 2 first as a standalone perf fix, decoupled from the fractal?** (Recommendation: yes — and it is already largely done.)
2. **Between-sweep alert latency.** Phases 3/5 mean a fault in an undescended node may not alert until the next daily rollup. The conservative pre-scan catches *critical-eligible* faults immediately, but derived-lens deterioration in a cache-clean node waits. **Is a bounded ≤daily delay for non-critical deterioration acceptable** (as with #170), or must every node be descended on every render (forfeiting most of the win)?
3. **Element-level events don't exist.** True "a finance write re-checks only that client's commercial element" requires emitting new domain events from finance/task/milestone mutations. **Build that new event surface, or is whole-client dirtying enough for now?**
4. **Per-domain observation decomposition.** `buildRadarObservations` is monolithic; a genuinely cheap *targeted* domain query needs it split into per-domain slices — real net-new work. **Is targeted-domain-query a goal, or is per-client targeting (which already exists) sufficient?**
5. **Correlations & memory on partial sweeps.** Ruled here to run **only on the full sweep** to avoid silent false-negatives. Alternative: build a blind-correlation path + force-descend inputs (more work, real-time compound risk). **Which?**
6. **Notification write cost.** "Alerts as it goes" writes a notification row, still a big-row commit (2–6s) even if diff-cheap. **Accept rate-limited/batched notifications, or hold notifications to the daily sweep?**
7. **The Dev-project subtree** (`development.*`/`project.*`) has no radar today. **In scope for "every workspace has a mini-radar," or explicitly deferred?**

### 9a. My recommended defaults (added 2026-09-05 — approve/adjust in seconds to unblock Phases 3–6)

These are engineering-tradeoff recommendations, each low-risk/reversible so building on them doesn't
trap you. Say "yes to your §9 defaults" and I can build Phases 3–6 on these; change any line and I
adjust. I did **not** build ahead on guesses — the node model could shift with your answers, and
speculative building risks rework (I'd rather have your nod first).

| Q | Recommendation | Why (and how reversible) |
| --- | --- | --- |
| **1. Ship Phase 2 first** | **Yes** | Already largely shipped + the only *measured* win. Decouples the perf fix from the fractal build. Zero regret. |
| **2. ≤daily latency for non-critical deterioration** | **Accept it** | Consistent with the #170 daily-probe decision you already made. The conservative pre-scan still fires *critical*-eligible faults immediately; only derived-lens drift in a cache-clean node waits. Descending every node every render forfeits the win and reintroduces the slowness we just fixed. One flag flips back to descend-all. |
| **3. Element-level events** | **Whole-client dirtying first; defer element-level** | Whole-client dirty-marking captures most of the value for a fraction of the effort; element-level events are a large new surface across finance/task/milestone writes. Ship whole-client, measure, add element-level only where a hot path proves it's needed. Purely additive later. |
| **4. Targeted-domain-query** | **Per-client targeting is enough for now; defer domain decomposition** | Splitting the monolithic `buildRadarObservations` into per-domain slices is real net-new work with uncertain payoff; per-client targeting already exists and covers the common "one client changed" case. Revisit only on measured need. |
| **5. Correlations/memory on partial sweeps** | **Full sweep only** | A blind-correlation path risks the exact silent false-negative ("false green") the north star forbids. Keep compound-risk analysis on the authoritative full sweep. Safety-first; this is the conservative default. |
| **6. Notification write cost** | **Rate-limited/batched notifications** | An "alert as it goes" still writes a big-row commit (2–6s); batching/rate-limiting keeps the always-on PING without reintroducing the write-convoy the perf work just removed. Tunable by a single rate constant. |
| **7. Dev-project subtree** | **Defer** | `development.*`/`project.*` has no radar today; adding it is scope expansion. Prove the fractal on the existing business domains first, then add the dev subtree as a later mini-radar using the same pattern. |

**Net effect of these defaults:** Phase 2 ships now (done); Phases 3–5 build the fractal on whole-client
dirtying + conservative pre-scan + full-sweep correlations + batched notifications; Phase 6 (on-demand
full + per-client targeted) rides the existing per-client path. Element-level events, domain
decomposition, and the dev subtree are all deferred-until-measured — smallest safe first step, biggest
levers, nothing that boxes you in.

---

## Confidence & provenance

**Verified in source (across the maps):** the type contracts (`businessRadar.ts`), `summarizeRadarChecks`' blind/learning exclusion (`radarCheckEngine.ts:76,82`), the flat cache + single-flight (`businessIssueRadar.ts:60-113`), the client-fleet batch-I/O-once shape and actor/visibility behaviour (`clientRadarService.ts:96-173`), `calculateClientAquaHealth` inputs (`clientAquaHealth.ts:43-59`), the sidecar machinery (`storage.ts:460-510`), the `mutate` diff and `replacePortalState` whole-key rewrite (`storage.ts:1574,1737-1787`), `eventBus`/`deferUntilPortalStateCommit`, `radarSeeding`'s blunt invalidate, the twice-run policy pass, and the correlation/memory whole-set semantics.

**Not re-opened / flagged — confirm before implementing the dependent phases:** exact `radarObservations.ts` per-family decomposition; `RADAR_SWEEP_DEFINITIONS` cadence lines; the command-scan route internals; `reconcileAgencyTasksWithRadar`; `tenants.ts` event `clientId` payloads; whether any SSE/realtime transport exists (none found).

**Line numbers are as of the design session (repo `HEAD` `be8d760`) and will drift — treat them as pointers, re-grep before editing.**
