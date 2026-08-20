# `src/built-ins/modules/email-sender/src/server/provider.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Provider config service. One ProviderConfig per agency. The full API key lives in the plugin install's `config` (so it's masked from API responses); this row carries the masked tail + status.

## Exports (1)

- `class ProviderService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async get(): Promise<ProviderConfig>`
    - `async _readApiKey(): Promise<string | undefined>`
    - `async update(input: UpdateProviderInput, actor: UserId): Promise<ProviderConfig>`
    - `async markError(reason: string): Promise<void>`
    - `async markActive(): Promise<void>`
    - `currentProvider(): ProviderKind`

## Depends on (4)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/email-sender/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/email-sender/src/server/delivery.ts`](./delivery.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/email-sender/src/server/webhook.ts`](./webhook.md)

