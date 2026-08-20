# `src/built-ins/modules/leads-pipeline/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as agency-hr.

## Exports (8)

- `interface LeadsPipelineFoundation (6 members)`
- `registerLeadsPipelineFoundation(deps: LeadsPipelineFoundation): void`
- `clearLeadsPipelineFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): LeadsPipelineFoundation`
- `containerFor(args: { agencyId: AgencyId; storage: PluginStorage; }): LeadsPipelineContainer`
- `containerWithDeps(args: { agencyId: AgencyId; storage: PluginStorage; foundation: LeadsPipelineFoundation; }): LeadsPipelineContainer`
- `_containerFromCtx(args: { agencyId: AgencyId; actor: UserId; storage: PluginStorage; }): LeadsPipelineContainer | null`

## Depends on (4)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/leads-pipeline/src/server/ports.ts`](./ports.md)

## Used by (6)

- [`src/built-ins/modules/leads-pipeline/index.ts`](../../index.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/leads-pipeline/src/pages/CampaignsPage.tsx`](../pages/CampaignsPage.md)
- [`src/built-ins/modules/leads-pipeline/src/pages/ContactsPage.tsx`](../pages/ContactsPage.md)
- [`src/built-ins/modules/leads-pipeline/src/pages/LeadsBoardPage.tsx`](../pages/LeadsBoardPage.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)

