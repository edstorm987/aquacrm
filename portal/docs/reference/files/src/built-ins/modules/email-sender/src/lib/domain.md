# `src/built-ins/modules/email-sender/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Email-sender domain. Per-install plugin storage. `scopePolicy: "agency"` — install carries the agency's outbound infrastructure config (provider, API key, sender identities, default from). Per-client overrides land on individual messages via `clientId`.

## Exports (25)

- `type ProviderKind`
- `type ProviderStatus`
- `interface ProviderConfig (10 members)`
- `interface UpdateProviderInput (5 members)`
- `interface SmtpConfig (4 members)`
- `type SenderIdentityStatus`
- `interface SenderIdentity (10 members)`
- `interface CreateIdentityInput (4 members)`
- `interface UpdateIdentityPatch (4 members)`
- `type EmailStatus`
- `interface EmailAttachment (3 members)`
- `interface EmailFrom (2 members)`
- `interface EmailMessage (23 members)`
- `interface EnqueueInput (15 members)`
- `interface MessageFilter (4 members)`
- `type WebhookEventKind`
- `interface WebhookEventSeen (3 members)`
- `interface PostmarkWebhookEvent (8 members)`
- `interface SendResult (2 members)`
- `interface SendFailure (2 members)`
- `interface EmailDeliveredEvent (4 members)`
- `interface EmailBouncedEvent (6 members)`
- `type SubscribedEventName`
- `interface EventSubscription (3 members)`
- `interface IdempotencyEntry (4 members)`

## Depends on (1)

- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](./tenancy.md)

## Used by (15)

- [`src/built-ins/modules/email-sender/src/__smoke__/email-sender.test.ts`](../__smoke__/email-sender.test.md)
- [`src/built-ins/modules/email-sender/src/__smoke__/smtp-driver.test.ts`](../__smoke__/smtp-driver.test.md)
- [`src/built-ins/modules/email-sender/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/email-sender/src/server/delivery.ts`](../server/delivery.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/index.ts`](../server/drivers/index.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/noop.ts`](../server/drivers/noop.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/postmark.ts`](../server/drivers/postmark.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/smtp.ts`](../server/drivers/smtp.md)
- [`src/built-ins/modules/email-sender/src/server/emails.ts`](../server/emails.md)
- [`src/built-ins/modules/email-sender/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/email-sender/src/server/identities.ts`](../server/identities.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](../server/ports.md)
- [`src/built-ins/modules/email-sender/src/server/provider.ts`](../server/provider.md)
- [`src/built-ins/modules/email-sender/src/server/webhook.ts`](../server/webhook.md)

