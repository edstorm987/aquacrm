# `src/built-ins/modules/email-sender/src/server/webhook.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Webhook service. Verifies the provider's signed payload via the active driver, then updates the matching EmailMessage status + emits email.delivered / email.bounced events. Idempotent on provider event id (Postmark sends the same delivery callback up to a few times).  Storage: webhook/seen/<eventId>     → WebhookEventSeen

## Exports (2)

- `interface WebhookHandleResult (5 members)`
- `class WebhookService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private emails: EmailService, private provider: ProviderService, private drivers: Map<string, EmailDrive…`
    - `async handle(args: { rawBody: string; signatureHeader: string }): Promise<WebhookHandleResult>`
    - `async apply(event: PostmarkWebhookEvent): Promise<WebhookHandleResult>`

## Depends on (6)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/email-sender/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/email-sender/src/server/emails.ts`](./emails.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/email-sender/src/server/provider.ts`](./provider.md)

## Used by (1)

- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)

