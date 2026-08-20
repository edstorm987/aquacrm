# `src/built-ins/modules/leads-pipeline/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the leads-pipeline plugin.  Same minimal slice as agency-hr (Tenant + Activity + EventBus + PluginInstallStore) plus two plugin-specific ports:  - `EmailEnqueuePort` — adapter onto the email-sender plugin's `EmailService.enqueue`. The foundation binds this so this plugin never imports the email-sender package directly (cross-plugin coupling stays inside foundation glue).  - `PipelinePort` — adapter onto T1's foundation pipelines service (R034). When the cross-plugin subscriber fires, it asks for the leads pipeline + the "New" column and adds a card. The port is optional in v1 — if the foundation hasn't wired it up yet, the subscriber still creates the Lead row, just without the card (foundation-pending — see chapter).

## Exports (14)

- `interface TenantPort (1 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type LeadsEventName`
- `type SubscribedEventName`
- `interface EventBusPort (2 members)`
- `interface PluginInstallStorePort (1 members)`
- `interface EmailEnqueueInput (7 members)`
- `interface EmailEnqueueResult (3 members)`
- `interface EmailEnqueuePort (2 members)`
- `interface PipelineCardRef (3 members)`
- `interface AddLeadCardInput (8 members)`
- `interface PipelinePort (3 members)`

## Depends on (1)

- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (10)

- [`scripts/smoke-client-journey.test.ts`](../../../../../../scripts/smoke-client-journey.test.md)
- [`src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts`](../__smoke__/leads-pipeline.test.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/server/campaigns.ts`](./campaigns.md)
- [`src/built-ins/modules/leads-pipeline/src/server/commercial.ts`](./commercial.md)
- [`src/built-ins/modules/leads-pipeline/src/server/contacts.ts`](./contacts.md)
- [`src/built-ins/modules/leads-pipeline/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/leads-pipeline/src/server/leads.ts`](./leads.md)
- [`src/built-ins/modules/leads-pipeline/src/server/prospects.ts`](./prospects.md)

