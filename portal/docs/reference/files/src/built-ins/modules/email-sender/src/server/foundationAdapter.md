# `src/built-ins/modules/email-sender/src/server/foundationAdapter.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation registration adapter — same pattern as forms + agency-marketing + client-CRM.

## Exports (10)

- `interface EmailSenderFoundation (6 members)`
- `registerEmailSenderFoundation(deps: EmailSenderFoundation): void`
- `clearEmailSenderFoundation(): void`
- `isFoundationRegistered(): boolean`
- `requireFoundation(): EmailSenderFoundation`
- `interface ContainerForArgs (3 members)`
- `containerFor(args: ContainerForArgs): EmailSenderContainer`
- `containerWithDeps(args: { agencyId: AgencyId; storage: PluginStorage; tenant: TenantPort; activity: ActivityLogPort; events: EventBusPort; pluginInstalls: PluginInstallStorePort; marketingTemplates?: MarketingTemplatePort; drivers?: Map<Pr…`
- `_containerFromCtx(args: { agencyId: AgencyId; storage: PluginStorage; }): EmailSenderContainer | null`
- `EVENT_SUBSCRIPTIONS`

## Depends on (5)

- [`src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](./ports.md)

## Used by (7)

- [`src/built-ins/modules/email-sender/index.ts`](../../index.md)
- [`src/built-ins/modules/email-sender/src/__smoke__/email-sender.test.ts`](../__smoke__/email-sender.test.md)
- [`src/built-ins/modules/email-sender/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/email-sender/src/pages/LogsPage.tsx`](../pages/LogsPage.md)
- [`src/built-ins/modules/email-sender/src/pages/OutboxPage.tsx`](../pages/OutboxPage.md)
- [`src/built-ins/modules/email-sender/src/pages/SettingsPage.tsx`](../pages/SettingsPage.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)

