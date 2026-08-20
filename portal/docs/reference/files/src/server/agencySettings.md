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

## Used by (13)

- [`src/app/api/portal/advisor/radar/route.ts`](../app/api/portal/advisor/radar/route.md)
- [`src/app/api/portal/settings/route.ts`](../app/api/portal/settings/route.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/fulfilment/page.tsx`](../app/portal/agency/fulfilment/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/app/portal/agency/settings/page.tsx`](../app/portal/agency/settings/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/app/portal/clients/page.tsx`](../app/portal/clients/page.md)
- [`src/lib/server/advisorSkills.ts`](../lib/server/advisorSkills.md)
- [`src/lib/server/businessIssueRadar.ts`](../lib/server/businessIssueRadar.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../lib/server/editing/appConfigAdapter.md)
- [`src/lib/server/kpiTargets.ts`](../lib/server/kpiTargets.md)
- [`src/lib/server/operationalAlerts.ts`](../lib/server/operationalAlerts.md)

