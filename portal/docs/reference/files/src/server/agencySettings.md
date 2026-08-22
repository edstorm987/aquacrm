# `src/server/agencySettings.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (2)

- `getAgencyWorkspaceSettings(agencyId: string): AgencyWorkspaceSettings`
- `updateAgencyWorkspaceSettings(agencyId: string, patch: Partial<Omit<AgencyWorkspaceSettings, "agencyId" | "updatedAt">>, actorUserId: string): AgencyWorkspaceSettings`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (16)

- [`scripts/smoke-dev-team-editor.test.ts`](../../scripts/smoke-dev-team-editor.test.md)
- [`scripts/smoke-kpi-shared-views.test.ts`](../../scripts/smoke-kpi-shared-views.test.md)
- [`src/app/api/portal/advisor/radar/route.ts`](../app/api/portal/advisor/radar/route.md)
- [`src/app/api/portal/settings/route.ts`](../app/api/portal/settings/route.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/settings/page.tsx`](../app/portal/agency/settings/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/engines/data/server/kpi/kpiSavedViews.ts`](../engines/data/server/kpi/kpiSavedViews.md)
- [`src/engines/data/server/kpi/kpiTargets.ts`](../engines/data/server/kpi/kpiTargets.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../engines/data/server/radar/businessIssueRadar.md)
- [`src/lib/server/assistants/advisorSkillsService.ts`](../lib/server/assistants/advisorSkillsService.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../lib/server/editing/appConfigAdapter.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)

