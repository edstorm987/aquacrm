# `src/built-ins/modules/client-crm/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as memberships + affiliates + agency-finance + agency-marketing.

## Exports (9)

- `interface ClientCrmFoundation (7 members)`
- `registerClientCrmFoundation(deps: ClientCrmFoundation): void`
- `clearClientCrmFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): ClientCrmFoundation`
- `interface ContainerForArgs (4 members)`
- `containerFor(args: ContainerForArgs): ClientCrmContainer`
- `containerWithDeps(args: { agencyId: AgencyId; clientId: ClientId; storage: PluginStorage; tenant: TenantPort; user: UserPort; activity: ActivityLogPort; events: EventBusPort; pluginInstalls: PluginInstallStorePort; membershipBenefits?: Mem…`
- `_containerFromCtx(args: { agencyId: AgencyId; clientId: ClientId; storage: PluginStorage; }): ClientCrmContainer | null`

## Depends on (4)

- [`src/built-ins/modules/client-crm/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/client-crm/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/client-crm/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/client-crm/src/server/ports.ts`](./ports.md)

## Used by (10)

- [`src/built-ins/modules/client-crm/index.ts`](../../index.md)
- [`src/built-ins/modules/client-crm/src/__smoke__/crm.test.ts`](../__smoke__/crm.test.md)
- [`src/built-ins/modules/client-crm/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/client-crm/src/pages/ActivityPage.tsx`](../pages/ActivityPage.md)
- [`src/built-ins/modules/client-crm/src/pages/ContactDetailPage.tsx`](../pages/ContactDetailPage.md)
- [`src/built-ins/modules/client-crm/src/pages/ContactsPage.tsx`](../pages/ContactsPage.md)
- [`src/built-ins/modules/client-crm/src/pages/MyProfilePage.tsx`](../pages/MyProfilePage.md)
- [`src/built-ins/modules/client-crm/src/pages/SegmentsPage.tsx`](../pages/SegmentsPage.md)
- [`src/built-ins/modules/client-crm/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/client-crm/src/server/index.ts`](./index.md)

