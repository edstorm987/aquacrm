# `src/app/portal/agency/_battleWarRoom.ts`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** ─── Battle Table war room — the live decision model ──────────────────────────  The Battle Table used to open on a form. This module is the model behind the war-room front door: it turns the SAME live payload the station already receives (per-scope actuals, retained company plans, hiring capacity signals and Radar incidents) into three deterministic, testable structures:  1. the battlefield  — one row per scope: health, target-vs-actual, alerts 2. the decisions     — the live queue of calls, each with its own evidence 3. the pulse         — key metrics vs target with deviation and forecast  It is deliberately pure and free of React so the behaviour can be asserted in the smoke suite rather than grepped for in JSX. Nothing here invents a number: when the evidence is missing the state is `learning`, and when no target has been set the state is `no-target` — never a healthy pass.

## Exports (18)

- `type WarRoomTargetState`
- `type WarRoomSeverity`
- `type WarRoomDrillSection`
- `type WarRoomActuals`
- `type WarRoomScopeInput`
- `type WarRoomIncident`
- `type WarRoomRevenuePosition`
- `type WarRoomBattlefieldRow`
- `type WarRoomDecision`
- `type WarRoomPulseMetric`
- `monthPaceFraction(now: number): number`
- `revenuePosition(input: { revenueCents: number; targetCents: number; paceFraction: number; financeConnected: boolean }): WarRoomRevenuePosition`
- `capitalWatchCount(profile: CompanyProfile, now: number): number`
- `scopeHiringAnalysis(scope: WarRoomScopeInput): HiringCapacityAnalysis`
- `buildBattlefield(input: { scopes: WarRoomScopeInput[]; incidents?: WarRoomIncident[]; now: number }): WarRoomBattlefieldRow[]`
- `buildWarRoomDecisions(input: { scopes: WarRoomScopeInput[]; incidents?: WarRoomIncident[]; now: number; limit?: number }): WarRoomDecision[]`
- `buildWarRoomPulse(input: { scope: WarRoomScopeInput; now: number }): WarRoomPulseMetric[]`
- `summariseBattlefield(rows: WarRoomBattlefieldRow[]): { scopes: number; behind: number; critical: number; alerts: number; criticalAlerts: number }`

## Depends on (2)

- [`src/lib/performance/hiringCapacity.ts`](../../../lib/performance/hiringCapacity.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`src/app/portal/agency/_BattleTableWorkspace.tsx`](./_BattleTableWorkspace.md)
- [`src/app/portal/agency/_DashboardCommandCenter.tsx`](./_DashboardCommandCenter.md)

