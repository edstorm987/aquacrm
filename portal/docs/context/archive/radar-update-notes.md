# Radar update — progress & concerns

> 🗄 **ARCHIVED 2026-08-21.** Historical worker note, and a genuine **subset** of [radar-handoff.md](radar-handoff.md) — every operational item here (the `RADAR_EXTERNAL_DB_TARGETS` registry, the `CRON_SECRET` + sub-daily-cron prerequisite, the string-match maintenance trap) is in that file, in more detail. Read the handoff instead; this is kept only as the dated record. Live dossier: [workspace/radar.md](../../workspace/radar.md).

← [development.md](../../development.md) · **full handoff: [radar-handoff.md](radar-handoff.md)** · plan: [plans/radar-upgrade.md](../../development/plans/radar-upgrade.md) · changelog: [updates.md](../../development/updates.md) · dossier: [workspace/radar.md](../../workspace/radar.md)

> This is the short version. The complete pick-it-up doc — architecture, full
> test inventory, decisions, problems, file map, next work — is
> **[radar-handoff.md](radar-handoff.md)**.

A plain-English handoff for the Radar upgrade. **All 7 stages of
[radar-upgrade.md](../../development/plans/radar-upgrade.md) shipped** (2026-08-19), full smoke
suite green, typecheck clean, docs current. This note is the "what actually
happened + what I'd still watch" read — the per-stage detail is in
[updates.md](../../development/updates.md).

---

## What shipped (one line each)
1. **Sweep scheduler** — typed sweeps (pulse/deep/infra/evidence/compliance) over the *existing* builders; route + cron delegate to it. No behaviour change. `lib/server/radarSweeps.ts`.
2. **Classification** — every check + all 2,040 catalogue rules carry `tier` (which sweep refreshes it) + `dataDependency` (what it relies on). `lib/radarClassification.ts`.
3. **Real test types** — a fixture-golden test that runs the *actual* sweep and asserts the produced structure, and sweep-isolation tests (Pulse does zero I/O). This is the "passing ≠ working" answer for Radar.
4. **Infra + DB/storage health** — `databaseStorageHealth()` (promoted from `healthz/full`'s probeDb) + infra-scope checks + a Command Centre panel. First new signal on the new structure.
5. **Finding grouping** — six "what kind of problem" buckets (Infrastructure/Commercial/Compliance/Delivery/Reliability/People) above the domain grouping, shown as a chip bar.
6. **Auto-seeding** — a coverage registry + a watchdog `coverage-gaps` self-check proving every entity resolves to a pack + event-driven cache invalidation so new entities register immediately.
7. **Actionable findings** — recommended actions now carry the resolution model (kind, expected outcome, concrete steps, owner, group); judgement findings with a real fix are widened rather than dead-ending.

## Verification status (what's actually proven)
- **Automated:** full smoke suite **1480 pass / 0 fail / 1 skip**, typecheck clean. New behavioural tests actually *run* the sweep (golden, isolation, classification, infra, coverage-seeding, actionable, external-db).
- **Browser-verified:** the two new UI panels render correctly in the running app (file backend) — the finding-group chip bar (with severity tones + dynamic re-sort) and the DB-health card (both the "not run yet" and the populated "AquaCRM database · file · UNTESTED" states).
- **The 2,040 catalogue and every prior contract stayed intact** throughout — infra and coverage ride new scopes/layers, never new catalogue families.

---

## Concerns & follow-ups (the honest bits)

### 1. ✅ Sweep cadence — DONE (2026-08-19)
*Was:* `RADAR_SWEEP_DEFINITIONS` declared cadences but nothing enforced them — Deep/Infra only refreshed on the daily `cron/inbox` run or a manual full scan.
*Now:* a dedicated `runRadarProbeRefresh` (Deep-only, light — no Pulse rebuild/evidence rollup) is driven by the new **`api/cron/radar-probes`** route, scheduled **every 10 min** in `vercel.json` (Infra probed once app-wide, Deep per active agency). The cheap Pulse now reads genuinely fresh probe data. *Remaining prerequisites for it to actually fire in production:* set `CRON_SECRET`, and a Vercel plan that permits sub-daily crons (Hobby is daily-only). Evidence rollup (#6) still rides the daily `cron/inbox` — a smaller, separate cadence question.

### 2. External DB monitoring needs your env config to do anything
The wiring is built + tested (real connection attempts, honest untested/down states), but it watches nothing until you add targets. Two lines in `.env.local`:
```
RADAR_EXTERNAL_DB_TARGETS=[{"id":"personal-site","label":"Personal site DB","urlEnvVar":"PERSONAL_SITE_DATABASE_URL"}]
PERSONAL_SITE_DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
```
Postgres only in v1. I deliberately did **not** touch your live-secrets `.env.local`.

### 3. Infra health is app-wide, not per-agency
The Infra sweep writes one global `radarInfraHealth` snapshot (it's one database). Fine for a solo/single-agency setup — but if AquaCRM ever goes multi-tenant with per-tenant DBs, this needs revisiting (per-agency infra targets). Noted in the plan's open questions.

### 4. Storage bytes are honestly "not available in-app"
Total Supabase Storage usage isn't reachable from the service-role client (needs the Supabase management API), so the card says so rather than faking it. Reachability, latency and row counts *are* real. If you want true storage-usage numbers, that's a separate management-API integration.

### 5. Infra checks are `inactive` on file/memory backends
On the verify server (file backend) the DB is `untested` → the 3 infra checks show `inactive` (nothing external to probe — correct, not a fake pass). They only light up meaningfully on the postgres/supabase backend. So to see real infra health you need to run against the live backend (mind the [live-Supabase hazard](../../../CLAUDE.md) — local dev writes to live).

### 6. Compliance sweep isn't separately scheduled
It exists in the taxonomy but is still folded into the Pulse (computed every build). Splitting it onto a genuine daily schedule is a small future optimisation, not a correctness issue.

### 7. Event-driven seeding is eventually-consistent
New-entity cache invalidation runs as an eventBus microtask, so coverage refreshes on the *next* tick, not synchronously. In practice a real request after entity creation is a later tick, so it's fine — just don't expect same-tick invalidation.

### 8. Live integration test deferred (by decision)
A test that boots a seeded server and hits `/api/portal/advisor/radar` for a real response was deliberately deferred until the server test-harness story is sorted. The fixture-golden test covers the sweep behaviour in-process in the meantime.

### 9. Contract tests are string-match on source — a maintenance trap
Several existing Radar tests assert the *exact source text* of route/cron/probe files. When you refactor (as I did in Stages 1 & 4), these break and must be **relocated**, not deleted — the behavioural intent moves with the code. Watch for this on any future Radar refactor; run the **full** suite, not adjacent files.

---

## Where things live (pickup map)
- **Scheduler + sweeps:** `src/engines/data/server/radar/radarSweeps.ts` (+ route `api/portal/advisor/radar`, cron `api/cron/inbox`)
- **Classification + grouping:** `src/engines/data/radar/radarClassification.ts`
- **Infra probe + checks:** `src/lib/server/databaseStorageHealth.ts`, `src/engines/data/radar/radarInfraChecks.ts`
- **Coverage seeding:** `src/engines/data/radar/radarCoverageRegistry.ts`, `src/engines/data/server/radar/radarSeeding.ts`, watchdog in `src/engines/data/radar/radarSentinels.ts`
- **Actionable findings:** `src/lib/intelligence/businessRecommendedActions.ts`, `src/lib/advisor/advisorActions.ts`
- **UI panels:** `src/app/portal/agency/_InfraHealthPanel.tsx`, `_FindingGroupBar.tsx` (both in the Command Centre → Radar Workspace → **Live Radar feed**)
- **Tests:** `scripts/smoke-radar-*.test.ts` (sweeps, classification, golden-sweep, sweep-isolation, infra-health, finding-groups, coverage-seeding, actionable, external-db)
- **The big builder** everything folds into: `src/engines/data/server/radar/businessIssueRadar.ts`
