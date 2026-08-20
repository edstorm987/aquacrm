# `src/built-ins/modules/affiliates/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as memberships + agency-hr + ecommerce.  Foundation imports this at boot, calls registerAffiliatesFoundation once with concrete port implementations, and from then on every page + handler resolves its services via containerFor({...}).  The cross-plugin EcommerceOrdersPort is read by the foundation from `@aqua/plugin-ecommerce/server`'s `containerFor(storage).orders` — the foundation's adapter projects the ServerOrder shape into our EcommerceOrderProjection. Until ecommerce ships a `referralCodeId` field on its order shape (foundation pending), the projection reads from `metadata.referralCodeId` the storefront stamps.

## Exports (9)

- `interface AffiliatesFoundation (7 members)`
- `registerAffiliatesFoundation(deps: AffiliatesFoundation): void`
- `clearAffiliatesFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): AffiliatesFoundation`
- `interface ContainerForArgs (4 members)`
- `containerFor(args: ContainerForArgs): AffiliatesContainer`
- `containerWithDeps(args: { agencyId: AgencyId; clientId: ClientId; storage: PluginStorage; tenant: TenantPort; user: UserPort; activity: ActivityLogPort; events: EventBusPort; pluginInstalls: PluginInstallStorePort; ecommerceOrders: Ecommer…`
- `_containerFromCtx(args: { agencyId: AgencyId; clientId: ClientId; storage: PluginStorage; }): AffiliatesContainer | null`

## Depends on (4)

- [`src/built-ins/modules/affiliates/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/affiliates/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/affiliates/src/server/ports.ts`](./ports.md)

## Used by (10)

- [`src/built-ins/modules/affiliates/index.ts`](../../index.md)
- [`src/built-ins/modules/affiliates/src/__smoke__/affiliates.test.ts`](../__smoke__/affiliates.test.md)
- [`src/built-ins/modules/affiliates/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/affiliates/src/pages/AffiliatesPage.tsx`](../pages/AffiliatesPage.md)
- [`src/built-ins/modules/affiliates/src/pages/AttributionsPage.tsx`](../pages/AttributionsPage.md)
- [`src/built-ins/modules/affiliates/src/pages/CodesPage.tsx`](../pages/CodesPage.md)
- [`src/built-ins/modules/affiliates/src/pages/MyAffiliatePage.tsx`](../pages/MyAffiliatePage.md)
- [`src/built-ins/modules/affiliates/src/pages/PayoutsPage.tsx`](../pages/PayoutsPage.md)
- [`src/built-ins/modules/affiliates/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/affiliates/src/server/index.ts`](./index.md)

