# Plan — Finish + connect Client Health (Aqua Health)

← [todo.md](../todo.md) · [development.md](../../development.md) · ties to [aqua-tag-system](aqua-tag-system.md)

**Status: ✅ SHIPPED — all 4 phases + browser-verified on `:3032` (2026-08-19); auditor PASSED the thin-data honesty contract. Every Ed decision resolved — nothing here is open.**

> 📌 **Why this has NOT been moved to `plans/archive/` despite qualifying.** It was archived on 2026-08-20 and moved straight back. `scripts/smoke-dev-tasks-parse.test.ts:71` pins `client-health#1` and `client-health#4` as existing, done tasks, and `scanTasks` reads the **top level of `plans/` only** — so archiving this plan deletes those two tasks and turns the suite red. Archiving it is a two-part change (move the file *and* update that test) and the test is source, not docs. **Commander's call.** _(Was mislabelled "PLAN (not finished)" after it shipped.)_

Re-verified in source 2026-08-20 before archiving:
- `enquiry` and `traffic` are real factors on the health model (`src/lib/clients/clientAquaHealth.ts:24`, built at `:75–76`), with the absent-tag blind spot handled at `:51`.
- The telemetry risk verdicts the alerts share are exported as `ClientTelemetryRiskKind` — `enquiry-none` · `traffic-silent` · `traffic-drop` (`:146`) — so an alert cannot disagree with the health chip.
- The roll-up ships and is **mounted**: `listClientsNeedingAttention` is called in `src/app/portal/agency/page.tsx:101` and the panel renders at `src/app/portal/agency/_DashboardCommandCenter.tsx:1330`.
- ⚠ **One path in this plan was wrong** and is corrected below: the module is `src/lib/server/clients/clientAttention.ts`, **not** `server/clientAttention.ts`.

The "client health thing" Ed started — meant to
surface per-client alerts in Command Centre ("XYZ had no enquiries this month",
"XYZ traffic dropped") so you know which client needs attention *without opening
each one*. This is what actually solves the "tell me in Command Centre" problem.

> 📎 **The two sections immediately below — "Where we are" and "The gap" — are the ORIGINAL 2026-08-19 audit, written before the build.** They describe the roll-up as missing and the factors as relationship-only. Both were fixed by phases 1–4. Kept for the record; do not read them as current.

## Why
Clients' full detail lives in **Fulfilment**; Command Centre should only get the
**alerts**. The mechanism for those alerts is client health — score a client from
its real signals, and when it dips, raise a specific Command Centre alert with a
link into Fulfilment. Right now Command Centre shows a bare *count* of clients
needing attention, not *which* or *why*.

## Where we are (verified — it's MORE built than it feels)
- **The Client Radar — this IS the "client health thing" Ed built.** `_ClientRadarPanel.tsx` on every client workspace (`clients/[clientId]`) renders **Client system health** (`healthScore`/100, state `risk`/`strong`/`learning`/`watch`), **evidence confidence**, **system readiness**, **checks live** (critical/warning), adaptive detector packs, and a per-client scan. Built on `buildClientRadar` (`server/clientRadar.ts`) + **`clientAquaHealth.ts`** `calculateClientAquaHealth(...)` — which **is** wired (client page, clients hub, `_JourneyCommercialWorkspace`). So **per-client health is real and working.**
- `clientAquaHealth` tested (`client-aqua-health.test.ts`): `learning` (no evidence → score null), `risk` (overdue-payment factor), `strong` (contact + paid + terms → 100).
- **`companyHealth` / `companyHealthSnapshot`** compute `clientsNeedingAttention` — a **count** (feeds the `client-attention` command KPI); `brandPortfolio.clientNeedsAttention()` flags per-client attention (no owner / last contact >14d / telemetry errors / open requests / blocked milestones).
- Radar [auto-seeding](radar-upgrade.md) now covers each client's properties.

## The gap (why it felt like a rabbit hole) — CLOSED by phases 1–4
Built **at client-scope**, but not **rolled up + fed** — so it doesn't yet do the "tell me in Command Centre" job:
1. **Built at client-scope, not rolled up.** You see a client's health by *opening the client* (the Client Radar panel). It doesn't aggregate into **Command Centre** as **per-client alerts** — so you must open each client to know something's off. The roll-up + alerting is the **"connecting"** gap.
2. **Missing the tag-fed factors.** `clientAquaHealth`'s factors are relationship-only (payment / contact / terms). It doesn't yet ingest the **enquiry flow** ("none this month" / drop) and **traffic** (drop / surge / silence) signals from the client's tagged sites — the ones Ed named. The **"finishing"** gap.

## Phases
1. ✅ **Finish the factors — SHIPPED (2026-08-19).** Added `enquiry` (form/conversion telemetry) and `traffic` (pageview telemetry) factors to `clientAquaHealth`, threaded telemetry through all 3 call sites (`clients/page.tsx`, `clients/[clientId]/page.tsx`, `server/clientRadar.ts`). **Evolving monthly baseline, ±10% band, two-tier watch/risk** (see Decisions). Folded `clientNeedsAttention`'s telemetry-error check into the traffic factor as a cap. Honest `learning` until a baseline exists. Weights rebalanced to sum to 100 across six factors (no-site clients cap at ~70% confidence — a visible blind spot). Suite 1555 green, files `tsc`-clean, server path runtime-proved in memory. 6 behavioural tests. Radar consumed read-only; `operationalAlerts.ts` untouched.
2. ✅ **Connect to Command Centre alerts — SHIPPED (2026-08-19).** A firing enquiry/traffic risk factor → a specific `operationalAlert` ("XYZ: no enquiries this month", "XYZ: traffic down 80%", "XYZ: site traffic has gone silent") with a Fulfilment resolution path (`?tab=systems`), exact baseline evidence, and client identity. Exported `clientTelemetryRiskSignals` from `clientAquaHealth` (shared verdicts — alert can't disagree with the health chip); `operationalAlerts` consumes it, gated by `clientAlerts`. Classified **off-system** with a `clearsWhen` (metric returns to baseline); registered the `client-health-` family in the inbox `CLEARS_WHEN` + `FOCUS_BY_PREFIX` tables (additive — flagged to commander) so the "every action classified" guarantee stays green. `traffic-silent` = critical, else warning. Suite 1588 green; runtime-proved via the real `listOperationalAlerts`.
3. ✅ **Radar integration — SHIPPED (2026-08-19).** Client health rides `buildClientRadarFleet` (the canonical per-client rollup that already folds in the Phase-1 enquiry/traffic factors) — the Phase-4 roll-up reads the fleet, so health rolls up from monitored signals with no second source of truth.
4. ✅ **Command Centre surface — SHIPPED + BROWSER-VERIFIED (2026-08-19).** `listClientsNeedingAttention` (`src/lib/server/clients/clientAttention.ts` — this plan originally wrote the path as `server/clientAttention.ts`, which does not exist) + the `ClientsNeedingAttention` panel (`agency/_ClientsNeedingAttention.tsx`) give the compact list — each client + state + top reason + Fulfilment link, "All clear" empty state. Behavioural test (`smoke-client-attention.test.ts`, 3 cases). **Mounted** in the Command Centre Day Command station (`page.tsx` fetch + `_DashboardCommandCenter.tsx` render, Ed-approved shared-file edit) and **verified live on `:3032`** — renders "1 to review → Northlight Studio · watch · reason · 91/100 · Fulfilment link".

**PLAN COMPLETE** — all four phases shipped, tested, and browser-verified.

## Verified: issues → Radar → Actions (Ed's check, 2026-08-19)
Confirmed in-process (real functions, memory backend) that a firing client-health signal flows the whole way through the existing pipeline — no new code needed:
- **→ Radar:** `buildBusinessIssueRadar` flattens the client-radar fleet's checks + issues into the business Radar, so an enquiry-none client appears as a Radar issue ("*Client: Relationship health — Enquiry flow needs attention: No enquiries in the last 30 days…*").
- **→ Actions:** `buildBusinessRecommendedActions` turns the client-health **alert** into a recommended action (`recommended-alert:client-health-…`, high priority, addable to tasks). It ranks by severity against every other finding — in a busy workspace it can fall below the Day Command **top-5 cap** (observed rank #6 behind 25 company/systems incidents), but it's present in the full Actions list, the dedicated panel, and the Radar feed. **If Ed wants client-attention to rank higher in the top-5, that's a scoring tweak in `businessRecommendedActions.ts` (shared — coordinate), not a client-health gap.**

## Reuse
`clientAquaHealth.ts` (finish it), `clientRadar` + radar auto-seeding, `operationalAlerts` + the attention/resolution model, `clientTelemetry` + the Aqua Tag per-client enquiry/traffic data, `clientNeedsAttention` (fold into the factors).

## Decisions (Ed) — RESOLVED 2026-08-19
- **Thresholds → evolving baseline, not fixed cut-offs.** Both enquiry and traffic compare this trailing 30-day window to a **rolling baseline of prior months**, tolerate a **±10% band**, and flag when they fall below. Growth ratchets the baseline up ("not growing" → a dip; each new high sets the new standard). Risk-tier floors: baseline ≥ 3 enquiries / 20 views per month before a hard signal can fire.
- **Which factors → risk (fire an alert) vs informational:** risk = enquiries fallen to **none** vs an established baseline, traffic **gone silent**, or traffic **≥50%** below baseline. A softer >10% dip lowers the health factor but stays *informational* (watch, no alert).
- **Command Centre surface:** one **dedicated "clients needing attention" panel** (client + state + top factor + Fulfilment link), not folded into the general Radar feed. → drives Phase 4.

## Done when (verified)
A client with no enquiries this month / a real traffic drop shows as a **specific
alert in Command Centre** (not just a count), linking into Fulfilment; healthy
clients stay quiet; states honest (`learning` with no evidence). Behavioural test
on the factor computation + the alert surfacing.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/clients/clientAquaHealth.ts`
- `src/lib/server/clients/clientAttention.ts`
- `src/app/portal/agency/_ClientsNeedingAttention.tsx`
- `scripts/smoke-client-attention.test.ts`
- `scripts/client-aqua-health.test.ts`
- `docs/development/plans/client-health.md`
- `src/lib/server/radar/clientRadarService.ts`
- `src/lib/server/inbox/operationalAlerts.ts`
- `src/lib/inbox/resolutionFocus.ts`
- `src/lib/inbox/resolutionExplain.ts`
- `src/lib/intelligence/businessRecommendedActions.ts`
- `src/app/portal/agency/page.tsx`
- `src/app/portal/agency/_DashboardCommandCenter.tsx`
- `src/app/portal/clients/page.tsx`
- `src/app/portal/clients/[clientId]/page.tsx`
