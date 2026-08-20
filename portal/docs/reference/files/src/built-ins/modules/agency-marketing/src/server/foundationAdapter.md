# `src/built-ins/modules/agency-marketing/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as agency-finance.

## Exports (9)

- `interface AgencyMarketingFoundation (5 members)`
- `registerAgencyMarketingFoundation(deps: AgencyMarketingFoundation): void`
- `clearAgencyMarketingFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): AgencyMarketingFoundation`
- `interface ContainerForArgs (3 members)`
- `containerFor(args: ContainerForArgs): AgencyMarketingContainer`
- `containerWithDeps(args: { agencyId: AgencyId; storage: PluginStorage; tenant: TenantPort; user: UserPort; activity: ActivityLogPort; events: EventBusPort; pluginInstalls: PluginInstallStorePort; }): AgencyMarketingContainer`
- `_containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage; }): AgencyMarketingContainer | null`

## Depends on (4)

- [`src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-marketing/src/server/ports.ts`](./ports.md)

## Used by (13)

- [`src/built-ins/modules/agency-marketing/index.ts`](../../index.md)
- [`src/built-ins/modules/agency-marketing/src/__smoke__/marketing.test.ts`](../__smoke__/marketing.test.md)
- [`src/built-ins/modules/agency-marketing/src/api/handlers-r008.ts`](../api/handlers-r008.md)
- [`src/built-ins/modules/agency-marketing/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-marketing/src/pages/CalendarPage.tsx`](../pages/CalendarPage.md)
- [`src/built-ins/modules/agency-marketing/src/pages/CampaignsPage.tsx`](../pages/CampaignsPage.md)
- [`src/built-ins/modules/agency-marketing/src/pages/LeadsPage.tsx`](../pages/LeadsPage.md)
- [`src/built-ins/modules/agency-marketing/src/pages/PerformancePage.tsx`](../pages/PerformancePage.md)
- [`src/built-ins/modules/agency-marketing/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)
- [`src/built-ins/modules/agency-marketing/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/agency-marketing/src/pages/TemplatesPage.tsx`](../pages/TemplatesPage.md)
- [`src/built-ins/modules/agency-marketing/src/pages/TouchpointsPage.tsx`](../pages/TouchpointsPage.md)
- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)

