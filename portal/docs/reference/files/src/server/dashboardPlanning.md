# `src/server/dashboardPlanning.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (18)

- `DASHBOARD_IDLE_PROMPT_MS`
- `DASHBOARD_DEFAULT_CHECK_IN_MINUTES`
- `type DashboardClockOutReviewInput`
- `class DashboardClockOutReviewError`
    - `constructor(message: string)`
- `class DashboardWeeklyReviewError`
    - `constructor(message: string)`
- `interface DashboardPlanningSnapshot (7 members)`
- `interface DashboardWorkAccountabilitySnapshot (18 members)`
- `dashboardPlanningSnapshot(agencyId: string, userId: string, date = isoDate(), now = Date.now()): DashboardPlanningSnapshot`
- `dashboardWorkAccountabilitySnapshot(agencyId: string, now = Date.now()): DashboardWorkAccountabilitySnapshot`
- `upsertDashboardWeekPlan(input: { agencyId: string; userId: string; weekStart?: string; outcome?: string; reviewNotes?: string; wins?: string; misses?: string; lessons?: string; decisions?: string; risks?: string; startDoing?: string; stopD…`
- `upsertDashboardDayPlan(input: { agencyId: string; userId: string; date?: string; focus?: string; planNotes?: string; doneNotes?: string; plannedHours?: number; targetRevenuePounds?: number; }): DashboardDayPlan`
- `clockInDashboard(input: { agencyId: string; userId: string; focus?: string; date?: string; currentPath?: string; now?: number }): DashboardWorkSession`
- `clockOutDashboard(input: { agencyId: string; userId: string; review?: Partial<DashboardClockOutReviewInput>; now?: number; }): DashboardWorkSession | null`
- `heartbeatDashboardWorkSession(input: { agencyId: string; userId: string; visible: boolean; lastInteractionAt?: number; currentPath?: string; now?: number; }): DashboardWorkSession | null`
- `resolveDashboardWorkActivity(input: { agencyId: string; userId: string; mode: Exclude<DashboardWorkActivityMode, "unconfirmed">; focus?: string; note?: string; nextCheckInMinutes?: number; now?: number; }): DashboardWorkSession | null`
- `updateDashboardWorkSession(agencyId: string, userId: string, id: string, notes?: string, focus?: string): DashboardWorkSession | null`
- `logDashboardWorkSession(input: { agencyId: string; userId: string; date?: string; hours?: number; focus?: string; notes?: string; }): DashboardWorkSession | null`
- `deleteDashboardWorkSession(agencyId: string, userId: string, id: string): boolean`

## Depends on (2)

- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (6)

- [`src/app/api/portal/dashboard-planning/route.ts`](../app/api/portal/dashboard-planning/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/team/_TeamWorkspace.tsx`](../app/portal/team/_TeamWorkspace.md)
- [`src/app/portal/team/_data.ts`](../app/portal/team/_data.md)
- [`src/lib/server/advisorContext.ts`](../lib/server/advisorContext.md)

