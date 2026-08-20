# `src/lib/server/email/transactionalEmail.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `interface TransactionalEmailResult (4 members)`
- `interface TransactionalEmailReadiness (2 members)`
- `transactionalEmailReadiness(agencyId: string, clientId?: string): TransactionalEmailReadiness`
- `async sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult>`

## Depends on (3)

- [`src/lib/server/auth/founderAgency.ts`](../auth/founderAgency.md)
- [`src/lib/server/email/resendEmail.ts`](./resendEmail.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../integrations/integrationConnections.md)

## Used by (9)

- [`src/app/api/auth/password/request-reset/route.ts`](../../../app/api/auth/password/request-reset/route.md)
- [`src/app/api/auth/signup/route.ts`](../../../app/api/auth/signup/route.md)
- [`src/app/api/portal/connections/request-code/route.ts`](../../../app/api/portal/connections/request-code/route.md)
- [`src/app/api/portal/journey/payment-request/route.ts`](../../../app/api/portal/journey/payment-request/route.md)
- [`src/app/api/portal/website-enquiries/communications/route.ts`](../../../app/api/portal/website-enquiries/communications/route.md)
- [`src/app/api/portal/website-enquiries/reply/route.ts`](../../../app/api/portal/website-enquiries/reply/route.md)
- [`src/app/api/tenants/client-contracts/route.ts`](../../../app/api/tenants/client-contracts/route.md)
- [`src/lib/server/auth/magicLink.ts`](../auth/magicLink.md)
- [`src/server/automations.ts`](../../../server/automations.md)

