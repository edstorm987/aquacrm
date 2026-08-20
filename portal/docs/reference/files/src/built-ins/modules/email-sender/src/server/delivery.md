# `src/built-ins/modules/email-sender/src/server/delivery.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** DeliveryService — runs the actual provider call. Picks the driver for the agency's configured provider, calls send(), updates the message status accordingly. Idempotent on (messageId, externalRef) because EmailService transitions guard against double-sending.

## Exports (1)

- `class DeliveryService`
    - `constructor(private agencyId: AgencyId, private emails: EmailService, private provider: ProviderService, private drivers: Map<ProviderKind, EmailDriver>)`
    - `async deliver(messageId: string): Promise<{ ok: boolean; externalRef?: string; reason?: string }>`
    - `async retry(messageId: string): Promise<{ ok: boolean; externalRef?: string; reason?: string }>`

## Depends on (5)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/email-sender/src/server/emails.ts`](./emails.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/email-sender/src/server/provider.ts`](./provider.md)

## Used by (1)

- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)

