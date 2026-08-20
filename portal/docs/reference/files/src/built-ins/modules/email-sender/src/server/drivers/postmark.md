# `src/built-ins/modules/email-sender/src/server/drivers/postmark.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Postmark driver. POSTs to Postmark's `/email` endpoint with the X-Postmark-Server-Token header. Webhook verification lives here too.  Real production wiring is the user's job (set Postmark API key in install.config + verify domain in ProviderConfig). The driver itself is small + has no @postmark/* dependency — uses fetch.

## Exports (1)

- `class PostmarkDriver`
    - `constructor(private fetchImpl: typeof fetch = fetch)`
    - `async send({ ctx, message }: { ctx: DriverContext; message: EmailMessage }): Promise<SendResult | SendFailure>`
    - `async verifyWebhook({ ctx, rawBody, signatureHeader }: { ctx: DriverContext; rawBody: string; signatureHeader: string; }): Promise<PostmarkWebhookEvent | null>`

## Depends on (2)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](../ports.md)

## Used by (1)

- [`src/built-ins/modules/email-sender/src/server/drivers/index.ts`](./index.md)

