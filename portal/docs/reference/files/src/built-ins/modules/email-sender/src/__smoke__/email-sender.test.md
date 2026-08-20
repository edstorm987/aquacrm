# `src/built-ins/modules/email-sender/src/__smoke__/email-sender.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Email-sender plugin smoke. node:test via tsx --test. Covers the seven cases enumerated in R10: 1. enqueue happy path with template substitution 2. idempotent on (triggeredByPlugin, externalRef) 3. Postmark driver mock: returns externalRef, message marked sent 4. No-op driver: marks sent without external call 5. Webhook signed-payload happy path: delivered updates timeline + emits event 6. MarketingTemplatePort absent: enqueue without templateId still works 7. Cross-plugin event subscriber wiring (mock router)

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/built-ins/modules/email-sender/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/email-sender/src/server/drivers/index.ts`](../server/drivers/index.md)
- [`src/built-ins/modules/email-sender/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](../server/ports.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

