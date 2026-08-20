# `src/built-ins/modules/memberships/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as ecommerce + agency-hr.  The foundation imports this module at boot, calls `registerMembershipsFoundation({...})` once with concrete port implementations + a per-request Stripe-client factory, and from then on every page + handler resolves its services via `containerFor({ agencyId, clientId, storage, install })`.  Why a factory instead of a singleton StripePort: per-install Stripe keys live on the **ecommerce** install (memberships requires ecommerce). Building a Stripe client without knowing which (agencyId, clientId) install we're operating against is impossible. The foundation wires this up by reading the ecommerce install's config inside the factory closure.

## Exports (11)

- `interface MembershipsFoundation (6 members)`
- `registerMembershipsFoundation(deps: MembershipsFoundation): void`
- `clearMembershipsFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): MembershipsFoundation`
- `interface ContainerForArgs (4 members)`
- `containerFor(args: ContainerForArgs): MembershipsContainer`
- `isStripeAvailable(args: { agencyId: AgencyId; clientId: ClientId }): boolean`
- `interface ContainerWithDepsArgs (1 members)`
- `containerWithDeps(args: { agencyId: AgencyId; clientId: ClientId; storage: PluginStorage; tenant: TenantPort; user: UserPort; activity: ActivityLogPort; events: EventBusPort; pluginInstalls: PluginInstallStorePort; stripe: StripePort; }): …`
- `_containerFromCtx(args: { agencyId: AgencyId; clientId: ClientId; storage: PluginStorage; }): MembershipsContainer | null`

## Depends on (4)

- [`src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/memberships/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/memberships/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/memberships/src/server/ports.ts`](./ports.md)

## Used by (11)

- [`src/built-ins/modules/memberships/index.ts`](../../index.md)
- [`src/built-ins/modules/memberships/src/__smoke__/memberships.test.ts`](../__smoke__/memberships.test.md)
- [`src/built-ins/modules/memberships/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/memberships/src/pages/BenefitsPage.tsx`](../pages/BenefitsPage.md)
- [`src/built-ins/modules/memberships/src/pages/MyMembershipPage.tsx`](../pages/MyMembershipPage.md)
- [`src/built-ins/modules/memberships/src/pages/PlansPage.tsx`](../pages/PlansPage.md)
- [`src/built-ins/modules/memberships/src/pages/ReportsPage.tsx`](../pages/ReportsPage.md)
- [`src/built-ins/modules/memberships/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/memberships/src/pages/SubscriberDetailPage.tsx`](../pages/SubscriberDetailPage.md)
- [`src/built-ins/modules/memberships/src/pages/SubscribersPage.tsx`](../pages/SubscribersPage.md)
- [`src/built-ins/modules/memberships/src/server/index.ts`](./index.md)

