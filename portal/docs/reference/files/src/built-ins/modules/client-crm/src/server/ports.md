# `src/built-ins/modules/client-crm/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the client-CRM plugin.  Six standard ports (Storage, Tenant, User, ActivityLog, EventBus, PluginInstallStore) plus two OPTIONAL cross-plugin ports (MembershipBenefits, EcommerceOrders) that return null when their source plugin isn't installed for the same client. The CRM degrades gracefully — segments work without memberships, contact timelines work without ecommerce.

## Exports (13)

- `interface StoragePort (4 members)`
- `interface TenantPort (2 members)`
- `interface UserPort (2 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type CrmEventName`
- `interface EventBusPort (1 members)`
- `interface PluginInstallStorePort (1 members)`
- `interface MembershipSnapshot (3 members)`
- `interface MembershipBenefitsPort (1 members)`
- `interface EcommerceOrderProjection (6 members)`
- `interface EcommerceOrdersPort (1 members)`

## Depends on (1)

- [`src/built-ins/modules/client-crm/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (7)

- [`src/built-ins/modules/client-crm/src/__smoke__/crm.test.ts`](../__smoke__/crm.test.md)
- [`src/built-ins/modules/client-crm/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/client-crm/src/server/activity.ts`](./activity.md)
- [`src/built-ins/modules/client-crm/src/server/contacts.ts`](./contacts.md)
- [`src/built-ins/modules/client-crm/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/client-crm/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/client-crm/src/server/segments.ts`](./segments.md)

