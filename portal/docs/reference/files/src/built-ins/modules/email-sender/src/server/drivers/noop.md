# `src/built-ins/modules/email-sender/src/server/drivers/noop.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** No-op driver. Doesn't talk to any real provider — just logs to activity (foundation's ActivityLogPort) and returns a synthetic externalRef. Used when ProviderConfig.provider === "none" (the default until an agency configures a real provider) and as the smoke-test default.

## Exports (1)

- `class NoopDriver`
    - `async send(_args: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure>`

## Depends on (3)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/ids.ts`](../../lib/ids.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](../ports.md)

## Used by (1)

- [`src/built-ins/modules/email-sender/src/server/drivers/index.ts`](./index.md)

