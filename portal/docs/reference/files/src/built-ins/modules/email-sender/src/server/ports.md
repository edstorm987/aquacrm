# `src/built-ins/modules/email-sender/src/server/ports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Foundation port contracts for the email-sender plugin.  Five standard ports + one OPTIONAL MarketingTemplatePort. Send happens via a swappable Driver interface (postmark / no-op / future sendgrid / future resend) — declared here so foundation or smoke can substitute.

## Exports (12)

- `interface StoragePort (4 members)`
- `interface TenantPort (1 members)`
- `interface LogActivityInput (8 members)`
- `interface ListActivityFilter (3 members)`
- `interface ActivityLogPort (2 members)`
- `type EmailEventName`
- `interface EventBusPort (1 members)`
- `interface PluginInstallStorePort (1 members)`
- `interface MarketingTemplate (6 members)`
- `interface MarketingTemplatePort (2 members)`
- `interface DriverContext (4 members)`
- `interface EmailDriver (3 members)`

## Depends on (2)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (14)

- [`src/built-ins/modules/email-sender/src/__smoke__/email-sender.test.ts`](../__smoke__/email-sender.test.md)
- [`src/built-ins/modules/email-sender/src/__smoke__/smtp-driver.test.ts`](../__smoke__/smtp-driver.test.md)
- [`src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/email-sender/src/server/delivery.ts`](./delivery.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/index.ts`](./drivers/index.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/noop.ts`](./drivers/noop.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/postmark.ts`](./drivers/postmark.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/smtp.ts`](./drivers/smtp.md)
- [`src/built-ins/modules/email-sender/src/server/emails.ts`](./emails.md)
- [`src/built-ins/modules/email-sender/src/server/foundationAdapter.ts`](./foundationAdapter.md)
- [`src/built-ins/modules/email-sender/src/server/identities.ts`](./identities.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/email-sender/src/server/provider.ts`](./provider.md)
- [`src/built-ins/modules/email-sender/src/server/webhook.ts`](./webhook.md)

