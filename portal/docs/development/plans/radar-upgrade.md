# Plan — Radar upgrade: sweep types, classification & tests (+ DB/storage health)

← [development.md](../../development.md) · [phases.md](../../context/archive/phases.md) · reference: [radar dossier](../../workspace/radar.md) · **handoff notes + concerns: [radar-update-notes.md](../../context/archive/radar-update-notes.md)**

**Status: ✅ ALL 7 STAGES SHIPPED (2026-08-19).** Radar moved from one
do-everything sweep to typed, classified, properly-tested sweeps — with real
DB/storage health, top-level finding grouping, entity auto-seeding, and a
richer finding→task pipeline. Every stage shipped green (full smoke suite,
typecheck clean); the 2,040-rule catalogue and every prior contract stayed
intact throughout. See the ✅ markers in **Phasing** below for each stage's
landing note, and [updates.md](../updates.md) for the per-stage detail.

> **Count note (current source, 2026-08-24):** 2,040 rules / 170 families is the
> preserved Stage-1–7 checkpoint, not today's catalogue. The later Aqua Tag work
> added two guarded families; current total is **2,064 rules / 172 families**.

---

## Why now
Ed flagged that **database/storage health isn't monitored** and, looking at
Radar to add it, that Radar itself **needs a proper upgrade — better
classification/grouping and different types of sweeps and tests.** Both are the
same problem: Radar has no notion of *kinds* of checks that run at different
costs and cadences, so there's nowhere clean to hang an infrastructure probe,
and everything is recomputed at once.

## Where we are today (verified — see [radar.md](../../workspace/radar.md))
- **One monolithic sweep.** `buildBusinessIssueRadar` runs *everything* on every build: ~150 observations → evidence layer → the full **2,040-check matrix** → correlations → source/property/synthetic sentinels → watchdog → policy → memory. 30-second in-memory cache.
- **Cost is lopsided.** Almost all of it is cheap in-state CPU. The **only expensive part is the synthetic canaries** (real network probes — SSRF-guarded fetch, TLS, headers; ~12s). Those are already "force-only" (run on `POST`/full-scan, not `GET`), which is a *rough, implicit* sweep split — but it's the only one.
- **No cadence differentiation.** Compliance/legal checks (change daily) are recomputed as often as sales KPIs (change hourly). History persistence (`recordRadarEvidence`, `recordRadarSweep`) only happens on `POST`, so time-series only accrues when a human clicks "full scan".
- **Tests are mostly static-source contract tests** — they assert Radar's *shape*, not that a sweep produces the right findings from real state (the "passing ≠ working" gap Ed called out).
- **No real infra health.** `systems:storage-activity` just counts activity-log rows (mislabeled); `healthz/full` has a real `probeDb()` but it's ops-only, not in Radar or any dashboard.

## Goals of the upgrade
1. **Typed sweeps** — split the monolith by *cost + cadence + data source*, so cheap checks run often and expensive ones (network / DB round-trips) run on their own schedule and are *read* by the fast path.
2. **Classification & grouping** — give every check a cost/cadence *tier* and a data-dependency tag (metadata over the existing catalogue, not a rewrite), and group findings for humans more clearly.
3. **Real test types** — keep contract tests but add fixture-driven, behavioural, and integration tests that prove a sweep actually works.
4. **DB & storage health** — the first new signal built on the new structure, proving it out.
5. **Auto-seeding** — adding a new client / product / property / integration automatically provisions its Radar coverage (sensible default checks, honest "calibrating" state), so it's monitored with **no manual setup**. *(Part E.)*
6. **Actionable findings** — refine the issue → recommended-action → task pipeline so **more findings become concrete, assignable tasks** (carrying steps, owner, evidence, expected outcome), not dead-end observations. *(Part F.)*

**Rollout is staged** — each part below ships and is verified on its own; nothing is a big-bang rewrite (see Phasing).

---

## Part A — Sweep types
Decompose the single sweep into named types. The **Pulse** sweep is the live UI
path and assembles from the *cached results* of the slower sweeps; a scheduler
(cron) drives the expensive ones so they accrue independently of a user click.

| Sweep | Runs | Cost | Cadence | Trigger | Writes | Reads |
|---|---|---|---|---|---|---|
| **Pulse** | observations, KPI matrix (2040), correlations, source/property sentinels, watchdog, policy, memory-digest | cheap (in-state CPU) | on demand, 30s cache | page load / `GET` | nothing | latest probe + infra + evidence results |
| **Deep / Synthetic** | the network canaries (uptime, TLS, security headers, tag-detect) | expensive (network) | every ~10–15 min | cron + explicit full-scan | `radarSyntheticProbes` | site list |
| **Infra** *(new)* | DB reachability + latency, storage usage/health | medium (DB round-trip) | every ~5–10 min | cron + full-scan | a new `radarInfraHealth` slice | env/backends |
| **Evidence rollup** | `recordRadarEvidence` + `recordRadarSweep` (history/anomaly persistence) | cheap-medium | hourly | cron | `radarEvidence`, `radarMemory` | current pulse |
| **Compliance / slow** | legal/tax/insurance/contract expiry families | cheap | daily | cron | (memoised) | legal register |

**Key idea:** the Pulse never does I/O — it renders instantly from whatever the
scheduled sweeps last wrote. Today's `GET` (no probes) → Pulse; today's `POST`
(force probes) → "run Deep + Infra + Evidence now, then Pulse". The existing
`cron/inbox` job is the natural place to drive the scheduled sweeps.

## Part B — Classification & grouping
- **Add a `tier` to each check/family** (metadata, *not* a catalogue rewrite): `instant` (in-state derivation) · `probe` (network/DB round-trip) · `rollup` (needs retained history). The scheduler uses `tier` to decide what each sweep runs; the UI can filter by it.
- **Add a `dataDependency` tag:** `in-state` · `derived` · `external`. Makes "why is this blind?" answerable (external dep down vs. not-yet-instrumented).
- **Keep** the 12 domains × 12 lenses × 6 scopes and the 2,040 ids — they're good and heavily tested. This is additive metadata.
- **Improve finding grouping for humans:** today incidents group by `{domain}:{category}`. Add a clearer top-level classification — e.g. *Infrastructure / Commercial / Compliance / Delivery / Reliability* — so the operator sees "what kind of problem" before drilling into domain detail. (Design the buckets with Ed.)

## Part C — Test strategy (directly answers "a passing test ≠ working")
| Test type | Proves | New? |
|---|---|---|
| Contract / structure (`smoke-business-radar` etc.) | the catalogue's shape, floors, id-uniqueness | keep |
| **Evaluator unit tests** | each lens turns a crafted observation into the exact status (real input→output) | expand |
| **Fixture-driven golden sweep** | a known `PortalState` fixture → run a real sweep → assert the produced findings/counts (a snapshot that fails if behaviour drifts) | **new** |
| **Sweep-isolation tests** | Pulse does **zero** network/DB I/O; Deep runs only probes; Infra only the DB probe | **new** |
| Probe safety (SSRF) | reserved hosts / private IPs blocked on every hop | keep |
| **Integration sweep** | run a sweep against a seeded server + hit `/api/portal/advisor/radar`, assert a real response | **new** (needs the server story sorted) |

The golden + sweep-isolation tests are what turn "Radar is green" into "Radar
actually evaluates correctly", and they'd cover the new sweep types by
construction.

## Part D — Database & storage health (the first new signal)
Rides the **Infra** sweep.
1. **Probe** — promote `healthz/full`'s `probeDb()` into `databaseStorageHealth()`: backend in use (file/postgres/supabase), `connected|down|untested`, round-trip latency, and row counts of key tables (`app_datastores`/`portal_kv`, `brand_enquiries`, `inbox_*`).
2. **Radar observations** — real `systems` families: `database-reachability`, `database-latency`, `storage-usage` — so a down/slow DB becomes a proper **blind/critical** finding across the lenses (not a fake pass), and relabel/retire the misleading `storage-activity`.
3. **Dashboard panel** — a "Database & storage health" card (status / latency / backend / row counts). **Placement is Ed's call** — my rec is the Performance workspace or Command Centre (systems), though he named the marketing dashboard.
4. **Honest measurability limit** — reachability, latency, and row counts are directly queryable; **total Supabase Storage bytes is not available from the service-role client** and would need the Supabase management API. The panel should show what's real and mark bucket-size as "not available in-app" rather than fake it.

---

## Part E — Radar seeding (auto-coverage for new entities)
**Adding a new thing should make Radar start watching it automatically** — no
manual check setup.

- **Where we are:** client-scoped radar already *derives* per-`product:*` and per-`property:*` detector packs at sweep time, and an unknown product gets a generic 3-check pack (verified in `smoke-client-radar`). But it's derived ad-hoc, only for a couple of entity types, and there's no single place that guarantees "every new monitorable entity has coverage."
- **The design — a coverage registry + seeder:**
  - A declarative **detector-pack template per entity type** — `client`, `product`, `property`/`website`, `integration`, `portal-connection`, `trading-company` — saying which families/checks apply to one instance of that type.
  - A **seeder** that, for every entity of a covered type, instantiates its pack (with the real `entity` object attached, as client-radar already does). A **generic fallback pack** covers any type without a bespoke template (generalising today's "unknown product → 3-check pack"), so nothing is silently un-watched.
  - **Event-driven seeding:** hook entity-creation on the `eventBus` (client/product/property created) so new coverage registers immediately in a **`calibrating`/`learning`** state — honest (not a fake pass), graduating as evidence accrues. Falls back to derive-at-sweep so nothing is missed if an event is dropped.
  - **A "coverage gaps" self-check** in the watchdog: every active entity of a covered type must resolve to a pack, else raise a blind-spot finding. This is how we *prove* seeding worked.
- **Payoff:** add a client → it's in the fleet and counts toward agency coverage; add a product → its pack seeds; add a website → property + synthetic + (new) infra coverage. "It auto-checks for us."

## Part F — Radar issues → actionable tasks (make more findings do-able)
**More findings should turn into concrete, assignable tasks** — fewer should
dead-end as observations you can't act on.

- **Where we are:** `reconcileAgencyTasksWithRadar` links active findings to existing tasks and reopens a done task if its condition returns; `buildBusinessRecommendedActions` is the deterministic action floor; accepting a suggestion in the Actions workspace mints a task (`origin:"radar"`). But **many findings classify `judgement`** (route to Advisor, *no* Resolve/next-step), and the finding→task mapping is coarse — one finding, at most one generic task.
- **The design — a richer finding→action mapping (reusing what exists):**
  - For each family/finding, define the **concrete recommended action** and build the proposed task from the **existing resolution model** — the `resolutionPlans` steps + evidence-steps (every family already has ≥1 concrete instruction step per `smoke-evidence-steps`). So a generated task carries: the instruction, a suggested owner, the evidence source ids, and the **expected outcome = the clearance condition**.
  - **Widen actionability:** where a finding currently dead-ends as `judgement` but a real action exists, reclassify it (`in-app`/`off-system`) so it offers a next step. Keep *genuine* judgement calls as judgement — but even those should propose a concrete **"review & decide"** task rather than nothing.
  - **One finding → several tasks** ("actionable for more tasks"): let a finding decompose into multiple concrete tasks via its steps (e.g. an outage → *investigate* → *notify the client* → *record the fix*), instead of a single catch-all.
  - **Keep the human-acceptance contract** (guess-then-confirm): these are richer *proposals*; a human still accepts. The win is that accepting is one click and the task arrives fully-formed.
  - **Tie to the new classification (Part B):** infra findings → infra tasks, compliance → compliance tasks, so the Actions workspace groups them the same way Radar does.
- **Payoff:** the loop closes — Radar finds it, proposes the exact task(s) to fix it, a click makes them real, and completing them clears the finding (which `reconcileAgencyTasksWithRadar` already verifies).

## Phasing (incremental, non-breaking)
1. ✅ **Scheduler layer** *(shipped 2026-08-19)* — `src/engines/data/server/radar/radarSweeps.ts` introduces the typed sweep taxonomy + a thin orchestration over the *existing* builders (`runRadarFullSweep` / `runRadarScheduledSweep` / `runRadarDeepSweep` / `runRadarEvidenceRollup`). The scan route and `cron/inbox` loop delegate to it; synthetic probes + evidence recording already ran on `cron/inbox`. No behaviour change; full suite green (contract test `smoke-radar-sweeps.test.ts` added).
2. ✅ **Classification metadata** *(shipped 2026-08-19)* — `src/engines/data/radar/radarClassification.ts` adds the two axes: **tier** (`instant`/`probe`/`rollup`, scope-driven — which sweep refreshes the check) and **dataDependency** (`in-state`/`derived`/`external` — what the answer relies on). Every one of the 2,040 catalogue rules carries them (computed in the cartesian product, ids unchanged), and every built check is stamped at finalization. The scheduler is wired via `tiers` on each sweep + `RADAR_TIER_TO_SWEEP`. Behavioural test `smoke-radar-classification.test.ts` (all 2,040 classified). *Grouping (Part B's UI buckets) is deferred to Stage 5, per the phasing.*
3. ✅ **New tests** *(shipped 2026-08-19)* — `smoke-radar-golden-sweep.test.ts` seeds a known agency fixture and runs the *real* `buildBusinessIssueRadar` end-to-end, asserting the produced structure (2,040 catalogue intact, 2,925 total checks, status partition, every check classified, zero-blindness, determinism). `smoke-radar-sweep-isolation.test.ts` proves the Pulse does zero network I/O and writes none of the three radar state collections, the Deep sweep is scoped to probes, and only a scheduled sweep persists memory + evidence. *The live integration test (seeded server → `/api/portal/advisor/radar`) stays deferred until the server test-harness story is sorted.*
4. ✅ **Infra sweep + DB/storage health** *(shipped 2026-08-19)* — `databaseStorageHealth()` (promoted from `healthz/full`'s `probeDb`, which now reuses it) probes backend + reachability + latency + key-table row counts for the primary DB, **plus env-referenced external targets** (`RADAR_EXTERNAL_DB_TARGETS`, connection strings stay in env — never in state). `runRadarInfraSweep` writes `radarInfraHealth`; the Pulse reads it and folds **infra-scope** checks in (down→critical, untested→inactive, never a fake pass) — the 2,040 catalogue stays intact (infra rides a new scope, like synthetic). `storage-activity` relabelled honestly. Panel: **Database & storage health** card in the Command Centre radar feed. Storage bytes shown "not available in-app". *Decisions taken: Command Centre placement; external DBs in scope.* **Panel browser-verified** (populated card reads "AquaCRM database · file · UNTESTED" on the file backend).
5. ✅ **Finding grouping** *(shipped 2026-08-19)* — six top-level "what kind of problem" buckets (Ed's choice): **Infrastructure / Commercial / Compliance / Delivery / Reliability / People**. `radarFindingGroup()` classifies each finding (Reliability + Infrastructure are cross-domain overrides applied first, then domain defaults, with team→People and compliance id fallbacks); incidents carry `group`, and the radar exposes `findingGroups` (per-bucket incident/critical/warning/watch counts). Surfaced as a `FindingGroupBar` above the Command Centre radar feed. Behavioural test `smoke-radar-finding-groups.test.ts`.
6. ✅ **Auto-seeding** *(shipped 2026-08-19)* — `radarCoverageRegistry.ts` declares a detector-pack template per entity type (client/product/property/integration/portal-connection/trading-company) + a **generic fallback**; `resolveRadarCoverage()` resolves every monitorable entity to a pack, producing a manifest (`radar.coverageManifest`, `state` = `calibrating`/`active`). A new **watchdog `coverage-gaps` self-check** proves nothing is silently un-watched (pass = all bespoke, watch = on fallback, critical = a true gap). `radarSeeding.ts` idempotently subscribes cache invalidation to entity-lifecycle events (`ensureRadarSeedingRegistered`, called at sweep top) so new coverage registers *immediately*, with derive-at-sweep as the fallback. Test `smoke-radar-coverage-seeding.test.ts`.
7. ✅ **Actionable findings** *(shipped 2026-08-19)* — `AdvisorActionSuggestion` now carries the resolution model: `kind` (in-app/off-system/judgement via `resolutionKindOf`), `expectedOutcome` (the clearance condition), concrete `steps` (via `stepsFor` — one finding can decompose into several tasks), a `suggestedOwner`, and its `group` (Stage 5). `buildBusinessRecommendedActions` **widens** judgement findings with a real remediation (coverage/source/readiness/infra/reliability/compliance/delivery) to `off-system` with a clearance, while genuine judgement calls keep their kind but still carry steps — never a dead end. The human-acceptance contract is preserved (richer *proposals*). Test `smoke-radar-actionable.test.ts`.

Each stage is independently shippable and testable; the 2,040 catalogue and its
contracts stay intact throughout. **Ship them in this order** — the scheduler and
classification (1–2) are the foundation the rest builds on; seeding (6) wants the
classification metadata; actionable findings (7) wants the resolution/grouping
work; so 1→2 first, then 3–5 in any order, then 6, then 7.

## Open questions / decisions for Ed
- **Dashboard placement** for DB/storage health: Performance / Command Centre / Marketing?
- **Scope:** AquaCRM's own DB + storage only, or also your external personal-site databases (bigger — needs connecting them)?
- **Probe cadence vs cost:** how often should Deep/Infra sweeps hit the network/DB (every scheduled `cron/inbox` run is daily today — likely too slow; may want a dedicated schedule)?
- **Per-client infra sweeps?** Should client-scoped radar get its own infra checks, or agency-only for now?
- **Finding classification buckets** — agree the top-level groups.

## Non-goals (v1)
- Not rewriting the 2,040-rule catalogue or the 12×12×6 model.
- Not breaking any existing Radar contract/test.
- Not connecting external/third-party databases (unless "scope" above says so).
- Not real-time streaming — this stays poll/sweep-based.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/engines/data/server/radar/radarSweeps.ts`
- `src/engines/data/radar/radarClassification.ts`
- `src/engines/data/radar/radarCoverageRegistry.ts`
- `src/engines/data/server/radar/radarSeeding.ts`
- `src/lib/server/databaseStorageHealth.ts`
- `src/engines/data/radar/radarInfraChecks.ts`
- `src/engines/data/server/radar/businessIssueRadar.ts`
- `src/engines/data/radar/businessRadar.ts`
- `src/engines/data/radar/radarRuleCatalog.ts`
- `src/engines/data/radar/radarPolicyEngine.ts`
- `src/lib/intelligence/businessRecommendedActions.ts`
- `src/app/portal/agency/_InfraHealthPanel.tsx`
- `src/app/portal/agency/_FindingGroupBar.tsx`
- `src/app/portal/agency/_DashboardCommandCenter.tsx`
- `src/app/api/portal/advisor/radar/route.ts`
- `src/app/api/cron/inbox/route.ts`
- `src/app/healthz/full/route.ts`
- `scripts/smoke-radar-sweeps.test.ts`
- `scripts/smoke-radar-classification.test.ts`
- `scripts/smoke-radar-golden-sweep.test.ts`
- `scripts/smoke-radar-sweep-isolation.test.ts`
- `scripts/smoke-radar-finding-groups.test.ts`
- `scripts/smoke-radar-coverage-seeding.test.ts`
- `scripts/smoke-radar-actionable.test.ts`
- `docs/workspace/radar.md`
- `docs/context/archive/radar-update-notes.md` (archived 2026-08-21)
- `docs/development/plans/radar-upgrade.md`
