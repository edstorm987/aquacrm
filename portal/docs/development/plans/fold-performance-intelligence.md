# Fold src/lib/performance + src/lib/intelligence into src/engines/data (queue #14)

**Status:** PLAN — the split decided here; the move itself is mechanical once agreed. Captured 2026-08-21, autonomous loop.

## Proven current state

- Both dirs exist exactly as named. `src/lib/performance/` = 5 files, 1,196 lines: companyHealth.ts (82), hiringCapacity.ts (288), kpiRegistry.ts (451), performanceAnalytics.ts (309), performanceReports.ts (66). `src/lib/intelligence/` = 6 files, 1,771 lines: attentionProtection.ts (185), businessRecommendedActions.ts (284), commandIntelligence.ts (347), commercialIntelligence.ts (372), commercialLifecycle.ts (458), operationalAttention.ts (125).
- Agreed layout: `docs/development/STRUCTURE.md:26-30` defines Data Engine = "Radar + KPI (Ed's definition) — signals → health, evidence-confidence, forecasts"; line 28 marks `lib/performance/ + lib/intelligence/` as "NOT MOVED (fuzzy) — separate split decision"; line 66 already earmarks the client-safe layer as "from src/engines/data/radar/ + src/lib/performance/[kpi] + src/lib/intelligence/" — note the `[kpi]` qualifier: only the KPI part of performance. Line 78: run on a clean tree, no parallel lane.
- Engine today: `src/engines/data/radar/` (12 client files), `src/engines/data/server/{radar,kpi}/` (15 server files) — 27 files total, no top-level `kpi/` or `intelligence/` client dir yet.
- The engine currently reaches BACK into lib (7 backreference lines — the layering smell this queue item fixes): `src/engines/data/server/kpi/companyHealthSnapshot.ts:10` → performance/companyHealth; `server/kpi/kpiRegistryService.ts:5` and `server/kpi/kpiTargets.ts:3` → performance/kpiRegistry; `server/radar/radarObservations.ts:6,13` → intelligence/commercialLifecycle + performance/hiringCapacity; `server/radar/businessIssueRadar.ts:23` and `radar/businessRadar.ts:7` → intelligence/commercialLifecycle.
- All 11 files are client-safe: zero `server-only`/`use client` markers (grep clean; kpiRegistry.ts:23 even documents "client-safe"). `@/engines/*` tsconfig alias exists (tsconfig.json:29).
- Classification with consumer evidence (external consumer files / import lines incl. scripts):
  - BELONGS-IN-DATA-ENGINE (6): **commandIntelligence** (12 files, 15 lines — STRUCTURE.md:29 lists "Command Intelligence" as DONE engine scope; imports engines/data/radar/businessRadar); **commercialLifecycle** (5 lines — 4 of its consumers ARE engine files); **commercialIntelligence** (4 lines — feeds commandIntelligenceService; leads-pipeline import at commercialIntelligence.ts:1 is `import type` only); **kpiRegistry** (6 lines — 2 consumers are engine server/kpi files); **companyHealth** (5 lines — consumed by engine companyHealthSnapshot); **hiringCapacity** (6 lines — consumed by engine radarObservations; judgement call, it's a "forecast from signals").
  - BELONGS-ELSEWHERE (5): **performanceAnalytics** + **performanceReports** — Aqua Tag / web-marketing analytics for client deliverables (consumers: performance workspace, customer portal, googleSearchConsole.ts, clientMilestones.ts; zero engine consumers) — not Radar+KPI; **operationalAttention** (12 consumers, ALL inbox/chrome/notifications, e.g. src/components/chrome/NotificationAttentionProvider.tsx, src/lib/inbox/attentionThread.ts) — Inbox & Actions domain; **attentionProtection** (chrome + actions UX, localStorage keys, attentionProtection.ts:35-36) — same domain; **businessRecommendedActions** — downstream Actions-surface consumer of the engine, imports lib/advisor + lib/inbox (businessRecommendedActions.ts:1-9); folding it in would drag inbox/advisor deps into the engine.
  - DEAD: none — every file has ≥3 external consumers.
- Test coupling: 20 scripts/*.test.ts files import via relative `../src/lib/...` paths (e.g. scripts/smoke-kpi-registry.test.ts:21, scripts/company-health.test.ts:3) — sed must cover `scripts/` too, not just `@/lib/` aliases.
## What is genuinely missing

- Client-safe `src/engines/data/kpi/` and `src/engines/data/intelligence/` directories (only `radar/` exists client-side).
- Nothing else — no new code; this is a pure 6-file relocation + import rewrite (~41 import lines: commandIntelligence 15, kpiRegistry 6, hiringCapacity 6, companyHealth 5, commercialLifecycle 5, commercialIntelligence 4).
## Options

- **A — Fold the 6 engine-true files only** (kpiRegistry, companyHealth, hiringCapacity → `engines/data/kpi/`; commandIntelligence, commercialIntelligence, commercialLifecycle → `engines/data/intelligence/`). Cost: 6 git-mvs, ~41 import lines across ~35 files (incl. 8 test files). Risk: LOW — mechanical, all client-safe, kills all 7 engine→lib backreferences.
- **B — Maximal fold (all 11 files)**. Cost: ~70+ import lines incl. 12 chrome/inbox consumers of operationalAttention. Risk: MEDIUM-HIGH — violates Ed's engine definition (STRUCTURE.md:26), pulls advisor/inbox deps into the engine via businessRecommendedActions, misfiles client-report analytics.
- **C — Option A + dissolve leftovers** (attention trio → `lib/inbox/`, which also breaks the existing lib/intelligence↔lib/inbox mutual coupling; rename residual 2-file `lib/performance/` → `lib/analytics/`). Cost: +5 moves, ~30 more lines incl. scripts/smoke-task-templates.test.ts:528-540 string refs. Risk: MEDIUM — scope creep inside a lane STRUCTURE.md:78 says must run alone.
## Recommendation

Option A. It is exactly what STRUCTURE.md:66 already agreed (`performance/[kpi]` + intelligence core), matches "only the parts that truly belong", and leaves both residual dirs coherent (performance = web analytics; intelligence = attention/actions). Log the residuals in hazards-and-duplication.md and queue Option C's cleanup as its own item.
## Risks

- Parallel-lane collision: the rewrite touches ~35 files across app/, server/, engines/, scripts/ — must run on a clean tree with no other lane active (STRUCTURE.md:78).
- Missed relative test imports (`../src/lib/...` in scripts/) leave tsc green but the smoke suite red — sweep both alias and relative forms.
- hiringCapacity is a judgement call; if Ed vetoes, it stays with 1-line revert of that step (its engine consumer keeps one backreference).
- Docs drift: CLAUDE.md law requires regenerating `docs/reference/` and updating workspace chapters after the move.
## Phases

1. **Preflight** — clean tree, no parallel lane; baseline `npx tsc --noEmit` + full smoke suite (`npx tsx --test scripts/*.test.ts`); confirm `@/engines/*` alias (tsconfig.json:29).
2. **Move intelligence core** — git mv commandIntelligence, commercialLifecycle, commercialIntelligence to `src/engines/data/intelligence/`; rewrite ~24 import lines (src `@/lib/intelligence/*` + scripts relative paths); tsc green.
3. **Move KPI core** — git mv kpiRegistry, companyHealth, hiringCapacity to `src/engines/data/kpi/`; rewrite ~17 import lines (src + scripts); tsc green.
4. **Verify engine isolation** — grep engines/data for `@/lib/performance|@/lib/intelligence` (expect 0 hits, was 7); run full smoke suite, not just adjacent tests.
5. **Docs law** — update STRUCTURE.md:28 NOT-MOVED note, regenerate `node scripts/generate-symbol-reference.mjs`, update workspace chapters + feature-index, log residual lib/performance + lib/intelligence contents in hazards-and-duplication.md, changelog entry in docs/development/updates.md.
6. **Queue follow-up** — file the Option C cleanup (attention trio → lib/inbox, lib/performance rename) as a separate queue item; do not execute in this lane.
