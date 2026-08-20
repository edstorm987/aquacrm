# `src/lib/server/transactionalEmail.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `interface TransactionalEmailResult (4 members)`
- `interface TransactionalEmailReadiness (2 members)`
- `transactionalEmailReadiness(agencyId: string, clientId?: string): TransactionalEmailReadiness`
- `async sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult>`

## Depends on (2)

- [`src/lib/server/integrationConnections.ts`](./integrationConnections.md)
- [`src/lib/server/resendEmail.ts`](./resendEmail.md)

## Used by (9)

- [`src/app/api/auth/password/request-reset/route.ts`](../../app/api/auth/password/request-reset/route.md)
- [`src/app/api/auth/signup/route.ts`](../../app/api/auth/signup/route.md)
- [`src/app/api/portal/connections/request-code/route.ts`](../../app/api/portal/connections/request-code/route.md)
- [`src/app/api/portal/journey/payment-request/route.ts`](../../app/api/portal/journey/payment-request/route.md)
- [`src/app/api/portal/website-enquiries/communications/route.ts`](../../app/api/portal/website-enquiries/communications/route.md)
- [`src/app/api/portal/website-enquiries/reply/route.ts`](../../app/api/portal/website-enquiries/reply/route.md)
- [`src/app/api/tenants/client-contracts/route.ts`](../../app/api/tenants/client-contracts/route.md)
- [`src/lib/server/magicLink.ts`](./magicLink.md)
- [`src/server/automations.ts`](../../server/automations.md)

