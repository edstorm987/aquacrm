# Radar upgrade — full handoff

← [development.md](../development.md) (the law) · plan: [plans/radar-upgrade.md](plans/radar-upgrade.md) · quick notes: [radar-update-notes.md](radar-update-notes.md) · changelog: [updates.md](updates.md) · deep dossier: [workspace/radar.md](../workspace/radar.md)

**Status: the entire 7-stage Radar upgrade shipped + 2 follow-ups (external-DB wiring, dedicated probe cadence). Full smoke suite green (1,482 pass / 0 fail / 1 pre-existing skip), typecheck clean, both new UI panels browser-verified.** This doc is the single "pick it all up" read: what was done, how it's tested, the decisions and why, problems hit, and what's left.

---

## 1. The mission (what this was)
Move Radar from **one monolithic do-everything sweep** to **typed, classified, properly-tested sweeps**, give **database/storage health** a real home, add **finding grouping**, **auto-seed** coverage for new entities, and make findings **actionable**. Source of truth for intent: [plans/radar-upgrade.md](plans/radar-upgrade.md) (parts A–F).

**Hard rules honoured throughout:**
- The 2,040-rule catalogue (170 families × 12 lenses) is **untouched** — infra and coverage ride *new scopes/layers*, never new catalogue families, so `catalogChecks === 2040` still holds.
- **No existing Radar contract/test broken** — where a legitimate refactor moved code that a *string-match* contract test pinned, the assertion was **relocated** (behaviour-identical), never weakened.
- **Guess-then-human-confirm** preserved — richer proposals, a human still accepts before work is committed.

## 2. What shipped, stage by stage
| Stage | What | Key files |
|---|---|---|
| **1 · Sweep scheduler** | Typed sweeps (pulse/deep/infra/evidence/compliance) as a thin orchestration over the *existing* builders; scan route + `cron/inbox` delegate to it. No behaviour change. | `lib/server/radarSweeps.ts` |
| **2 · Classification** | `tier` (instant/probe/rollup — which sweep refreshes a check) + `dataDependency` (in-state/derived/external) on every check + all 2,040 catalogue rules; scheduler wired via `tiers` + `RADAR_TIER_TO_SWEEP`. | `lib/radarClassification.ts` |
| **3 · Real test types** | Fixture-golden test that runs the *actual* `buildBusinessIssueRadar` and asserts produced structure; sweep-isolation tests (Pulse does zero I/O, writes nothing). The "passing ≠ working" answer. | `scripts/smoke-radar-golden-sweep.test.ts`, `smoke-radar-sweep-isolation.test.ts` |
| **4 · Infra + DB/storage health** | `databaseStorageHealth()` promoted from `healthz/full`'s `probeDb` (which now reuses it); new `infra` scope + `buildInfraHealthChecks`; env-referenced external DB targets; app-wide `radarInfraHealth` state; Command Centre panel. `storage-activity` relabelled honestly. | `lib/server/databaseStorageHealth.ts`, `lib/radarInfraChecks.ts`, `app/.../_InfraHealthPanel.tsx` |
| **5 · Finding grouping** | Six "what kind of problem" buckets (Infrastructure / Commercial / Compliance / Delivery / Reliability / People) above the domain grouping; `radar.findingGroups` summary; chip bar in the UI. | `lib/radarClassification.ts` (`radarFindingGroup`), `app/.../_FindingGroupBar.tsx` |
| **6 · Auto-seeding** | Coverage registry (detector-pack template per entity type + generic fallback); `resolveRadarCoverage` → `radar.coverageManifest`; watchdog `coverage-gaps` self-check (proves nothing is un-watched); event-driven cache invalidation. | `lib/radarCoverageRegistry.ts`, `lib/server/radarSeeding.ts`, `lib/radarSentinels.ts` |
| **7 · Actionable findings** | Recommended actions carry the resolution model (kind, expectedOutcome, concrete steps, owner, group); judgement findings with a real fix are **widened** to off-system; genuine judgement still carries steps (never a dead end). | `lib/businessRecommendedActions.ts`, `lib/advisorActions.ts` |
| **+ External DB** | Env-driven registry (`RADAR_EXTERNAL_DB_TARGETS`) probes Ed's external Postgres DBs for reachability + latency; secrets stay in env, never in state. | `databaseStorageHealth.ts`, `.env.example` |
| **+ Probe cadence** | `runRadarProbeRefresh` (light Deep-only) driven by a dedicated `api/cron/radar-probes` cron every 10 min, so probe data is genuinely fresh (not daily-stale). | `radarSweeps.ts`, `app/api/cron/radar-probes/route.ts`, `vercel.json` |

## 3. Architecture in one picture
```
                       cron/inbox (daily 6am)            cron/radar-probes (~10 min)
                              │                                    │
              full scan: Deep+Infra+build+evidence      light: Infra once + Deep per agency
                              │                                    │  (writes probe state, invalidates cache)
                              ▼                                    ▼
   ┌─────────────── state: radarSyntheticProbes · radarInfraHealth · radarMemory · radarEvidence ───────────────┐
   │                                            (written only by the sweeps)                                    │
   └──────────────────────────────────────────────▲──────────────────────────────────────────────────────────┘
                                                   │ reads (no I/O)
   GET /api/portal/advisor/radar  ──►  buildBusinessIssueRadar (the PULSE)  ──►  serialized radar
        (page load)                     observations → 2,040 matrix → correlations → sentinels
                                        → INFRA checks → watchdog(+coverage-gaps) → policy → memory
                                        → stamp tier/dataDependency → findingGroups → coverageManifest
```
- **Pulse = read-only**, assembles instantly from what the sweeps last wrote. Proven by `smoke-radar-sweep-isolation`.
- **scope → tier → sweep:** `kpi/source/property/watchdog → instant → pulse`; `synthetic/infra → probe → deep/infra`; `history → rollup → evidence`.

## 4. Test inventory (what's actually proven)
Run everything: `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts` (from `portal/`). **Full suite 1,482 pass / 0 fail / 1 skip.**

New radar test files (all behavioural unless noted):
- **`smoke-radar-sweeps.test.ts`** — taxonomy + route/cron delegation + tier wiring + the probe cron contract (source-match).
- **`smoke-radar-classification.test.ts`** — every scope → valid tier; all **2,040** rules classified correctly.
- **`smoke-radar-golden-sweep.test.ts`** — runs the *real* sweep on a seeded agency: 2,040 catalogue intact, **2,927 total checks**, status partition covers every check, every check classified, zero-blindness, deterministic. *(Structural counts are date-independent — verified — so they're snapshotted; if the pipeline drifts, this fails.)*
- **`smoke-radar-sweep-isolation.test.ts`** — Pulse does zero network I/O (fetch stubbed to throw) + writes none of the state collections; Deep is probe-scoped; the light probe refresh writes probes but not memory/evidence; only the scheduled sweep persists memory+evidence+infra.
- **`smoke-radar-infra-health.test.ts`** — `buildInfraHealthChecks` status mapping (connected→pass, slow→warning, down→critical, untested→inactive — never a fake pass); external targets; storage "not available"; probe on memory backend; `runRadarInfraSweep` persistence; panel wiring; healthz reuse.
- **`smoke-radar-finding-groups.test.ts`** — every domain → valid group; cross-domain overrides (reliability/infra); a real sweep rolls incidents into consistent group summaries.
- **`smoke-radar-coverage-seeding.test.ts`** — registry, resolver (bespoke/fallback/gap), watchdog states, and **end-to-end**: create a client → it appears in coverage on the next read (event invalidated the cache).
- **`smoke-radar-actionable.test.ts`** — every action carries kind+outcome+steps+owner+group; restorable findings widened; incident actions inherit group; dedup preserved.
- **`smoke-radar-external-db.test.ts`** — env registry parsed; a target with no conn string → untested; an unreachable target → **real down** → critical check; multiple targets; malformed config ignored.

Modified existing tests (contract assertions relocated, not weakened): `smoke-business-radar.test.ts` (Stages 1–2, watchdog count 16→17), `smoke-observability.test.ts` (probeDb internals moved to `databaseStorageHealth`).

**What tests do NOT cover** (be honest): no live HTTP integration test hitting `/api/portal/advisor/radar` on a booted server (deferred by decision — see §6.8); UI panels are covered by render + a browser pass, not automated screenshot diffing.

## 5. Decisions taken (and why) — the forks Ed resolved
1. **Contract-test relocation (Stage 1)** — string-match tests pinned route/cron source text. Chose to *wire route/cron through the scheduler and relocate the ~9 pinned assertions* to the scheduler (behaviour-identical) rather than leave the scheduler as dead code. *Ed approved.*
2. **DB/storage as a new `infra` scope, not new catalogue families (Stage 4)** — Part D suggested `systems` families, but that would break `=== 2040`. Rode a new scope like the synthetic canaries do. `storage-activity` **relabelled**, not retired (retiring breaks 2,040).
3. **Panel placement = Command Centre (systems); external DBs in scope.** *Ed's calls.* External-DB connection strings live in an env var referenced by the target list — never in state.
4. **Finding buckets = 6 (problem-kind + People).** *Ed chose* "Problem-kind + a People bucket" over the plan's 5 or the operating-area mirror. Reliability + Infrastructure are cross-domain overrides applied before the domain default.
5. **Stage 3 scope = fixture-golden + isolation only**, live integration test deferred. *Ed's call.*

## 6. Problems, concerns & open items (the honest register)
1. **✅ Probe cadence — FIXED.** Deep/Infra now run on `cron/radar-probes` every 10 min. *Prereqs to fire in prod:* set `CRON_SECRET`; a Vercel plan allowing sub-daily crons (Hobby is daily-only).
2. **External DB monitoring is inert until configured** — add two lines to `.env.local` (`RADAR_EXTERNAL_DB_TARGETS` + the `…_DATABASE_URL`). Postgres only in v1. I did **not** touch Ed's live-secrets `.env.local`.
3. **Infra health is app-wide, not per-agency** — one global `radarInfraHealth`. Fine for solo/single-agency; revisit if multi-tenant with per-tenant DBs.
4. **Storage bytes are honestly "not available in-app"** — total Supabase Storage usage needs the Supabase *management* API (service-role client can't read it). Reachability/latency/row-counts are real. A true storage-usage number is a separate integration.
5. **Infra checks are `inactive` on file/memory backends** — the verify server (file backend) shows the DB `untested` → checks `inactive` (correct, not a fake pass). They only light up on postgres/supabase — where the [live-Supabase hazard](../../CLAUDE.md) applies (local dev writes to live).
6. **Compliance sweep isn't separately scheduled** — exists in the taxonomy but still computed in every Pulse. Small future optimisation.
7. **Evidence rollup still rides daily `cron/inbox`** — the taxonomy says hourly. A smaller cadence follow-up now that the probe cron pattern exists (could add evidence to a mid-interval cron).
8. **Event-driven seeding is eventually-consistent** — cache invalidation runs as an eventBus microtask; refreshes on the next tick, not synchronously. Fine in practice.
9. **Live integration test deferred** — needs the server test-harness story sorted (memory backend + auth stub + port). Golden test covers sweep behaviour in-process meanwhile.
10. **Contract tests are string-match on source — a maintenance trap.** Future Radar refactors that move code will break these; **relocate** them, don't delete. Always run the **full** suite (`scripts/*.test.ts`), not adjacent files — a contract test in a distant file may pin what you changed.

## 7. Environment / running notes
- **Tests:** `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts` · **Typecheck:** `npx tsc --noEmit` · **Symbol ref:** `node scripts/generate-symbol-reference.mjs` (re-run after src changes).
- **Run the app for a visual check:** the `.claude/launch.json` `aquacrm-verify` config → `dev:verify` = `PORTAL_BACKEND=file PORTAL_DEV_MODE=true next dev` (file sandbox, dev auth — **safe**, no live Supabase). Panels live at **Command Centre → Radar Workspace → Live Radar feed** (`/portal/agency/radar`, click "Live Radar feed").
- **Hazard:** the default `dev` script and any supabase backend write to **live Supabase** — there is no local Supabase sandbox. Use `dev:verify` (file) for local work.
- **Prod prereqs for the probe cron:** `CRON_SECRET` set; Vercel plan with sub-daily crons.

## 8. File map (pickup)
**New:** `lib/server/radarSweeps.ts` · `lib/radarClassification.ts` · `lib/server/databaseStorageHealth.ts` · `lib/radarInfraChecks.ts` · `lib/radarCoverageRegistry.ts` · `lib/server/radarSeeding.ts` · `app/portal/agency/_InfraHealthPanel.tsx` · `app/portal/agency/_FindingGroupBar.tsx` · `app/api/cron/radar-probes/route.ts` · the 9 `scripts/smoke-radar-*.test.ts` files.
**Modified:** `lib/businessRadar.ts` (types) · `lib/server/businessIssueRadar.ts` (the big builder — everything folds in here) · `lib/radarRuleCatalog.ts` · `lib/radarSentinels.ts` · `lib/radarPolicyEngine.ts` · `lib/businessRecommendedActions.ts` · `lib/advisorActions.ts` · `lib/server/radarObservations.ts` · `server/types.ts` · `server/storage.ts` · `app/healthz/full/route.ts` · `app/api/portal/advisor/radar/route.ts` · `app/api/cron/inbox/route.ts` · `app/portal/agency/_DashboardCommandCenter.tsx` · `vercel.json` · `.env.example`.

## 9. Suggested next work (priority order)
1. **Turn on the probe cron in prod** — set `CRON_SECRET`, confirm the Vercel plan allows `*/10`. Then watch `radarInfraHealth`/probes actually refresh.
2. **Point external DB monitoring at a real target** — Ed adds the two `.env.local` lines; verify the external row renders in the panel (connected/latency).
3. **Evidence-rollup cadence** (#6.7) — mirror the probe-cron pattern for `recordRadarEvidence` at a mid interval.
4. **Live integration test** (#6.9) — sort the booted-server harness, then assert a real `/api/portal/advisor/radar` response.
5. **Real storage bytes** (#6.4) — Supabase management API integration, if wanted.
6. **Per-agency infra** (#6.3) — only if AquaCRM goes multi-tenant with separate DBs.

*Every change here follows the law: after building, run the full suite, update the relevant doc + this handoff, regenerate the symbol reference, and log it in [updates.md](updates.md).*
