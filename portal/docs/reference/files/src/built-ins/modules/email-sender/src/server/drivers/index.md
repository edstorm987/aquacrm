# `src/built-ins/modules/email-sender/src/server/drivers/index.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Driver registry. Maps ProviderKind → driver instance. v1 ships postmark + smtp + noop. SendGrid + Resend are R11+ stubs that throw on send so the agency knows to switch back to a wired provider.

## Exports (2)

- `class StubDriver`
    - `constructor(public readonly kind: ProviderKind, private message: string)`
    - `async send()`
- `defaultDriverRegistry(fetchImpl: typeof fetch = fetch, smtpTransport?: SmtpTransport): Map<ProviderKind, EmailDriver>`

## Depends on (5)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/noop.ts`](./noop.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/postmark.ts`](./postmark.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/smtp.ts`](./smtp.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](../ports.md)

## Used by (2)

- [`src/built-ins/modules/email-sender/src/__smoke__/email-sender.test.ts`](../../__smoke__/email-sender.test.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](../index.md)

