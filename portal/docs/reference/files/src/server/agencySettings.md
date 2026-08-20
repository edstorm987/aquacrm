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

## Used by (14)

- [`scripts/smoke-dev-team-editor.test.ts`](../../scripts/smoke-dev-team-editor.test.md)
- [`src/app/api/portal/advisor/radar/route.ts`](../app/api/portal/advisor/radar/route.md)
- [`src/app/api/portal/settings/route.ts`](../app/api/portal/settings/route.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/settings/page.tsx`](../app/portal/agency/settings/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/lib/server/assistants/advisorSkillsService.ts`](../lib/server/assistants/advisorSkillsService.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../lib/server/editing/appConfigAdapter.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/kpi/kpiTargets.ts`](../lib/server/kpi/kpiTargets.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../lib/server/radar/businessIssueRadar.md)

