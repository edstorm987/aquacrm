# `src/lib/server/clientRecordLedger.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (24)

- `type ClientRecordLedgerScope`
- `type ClientRecordLedgerFilter`
- `type ClientRecordLedgerWindow`
- `type ClientRecordLedgerSort`
- `type ClientRecordLedgerEventInput`
- `interface SynchroniseClientRecordLedgerInput (4 members)`
- `interface QueryClientRecordLedgerInput (12 members)`
- `synchroniseClientRecordLedger(input: SynchroniseClientRecordLedgerInput): ClientRecordLedgerEvent[]`
- `removeClientRecordLedgerEvent(agencyId: string, clientId: string, sourceType: ClientRecordLedgerSource, sourceId: string): boolean`
- `upsertClientRecordLedgerEvent(agencyId: string, clientId: string, event: ClientRecordLedgerEventInput): ClientRecordLedgerEvent`
- `upsertClientFileLedgerEvent(agencyId: string, clientId: string, file: { id: string; name: string; url: string; category: string; uploadedBy?: string; uploadedAt: number; recordEntryId?: string; customerVisible?: boolean; }): ClientRecordLe…`
- `clientContractLedgerEvent(clientId: string, contract: LedgerContract): ClientRecordLedgerEventInput`
- `upsertClientContractLedgerEvent(agencyId: string, clientId: string, contract: LedgerContract): ClientRecordLedgerEvent`
- `clientInvoiceLedgerEvent(clientId: string, invoice: LedgerInvoice): ClientRecordLedgerEventInput`
- `upsertClientInvoiceLedgerEvent(agencyId: string, clientId: string, invoice: LedgerInvoice): ClientRecordLedgerEvent`
- `clientPaymentPlanLedgerEvent(clientId: string, plan: LedgerPaymentPlan, now = Date.now()): ClientRecordLedgerEventInput`
- `upsertClientPaymentPlanLedgerEvent(agencyId: string, clientId: string, plan: LedgerPaymentPlan): ClientRecordLedgerEvent`
- `clientMilestoneLedgerEvent(clientId: string, milestone: LedgerMilestone, now = Date.now()): ClientRecordLedgerEventInput`
- `upsertClientMilestoneLedgerEvent(agencyId: string, clientId: string, milestone: LedgerMilestone): ClientRecordLedgerEvent`
- `clientRequestLedgerEvents(clientId: string, request: LedgerClientRequest, customerEmails: ReadonlySet<string> = new Set()): ClientRecordLedgerEventInput[]`
- `synchroniseClientRequestLedgerEvents(agencyId: string, clientId: string, request: LedgerClientRequest, customerEmails?: ReadonlySet<string>): ClientRecordLedgerEvent[]`
- `upsertClientSocialMessageLedgerEvent(agencyId: string, clientId: string, input: { conversationId: string; messageId: string; channel: "instagram" | "facebook" | string; accountName: string; participantName?: string; text?: string; attachme…`
- `appendActivityToClientRecordLedger(entry: ActivityEntry): void`
- `queryClientRecordLedger(input: QueryClientRecordLedgerInput): ClientRecordLedgerPage`

## Depends on (2)

- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (17)

- [`src/app/api/portal/identity-resolution/route.ts`](../../app/api/portal/identity-resolution/route.md)
- [`src/app/api/portal/inbox/conversations/route.ts`](../../app/api/portal/inbox/conversations/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/form-capture/route.ts`](../../app/api/public/form-capture/route.md)
- [`src/app/api/tenants/client-contracts/route.ts`](../../app/api/tenants/client-contracts/route.md)
- [`src/app/api/tenants/client-files/route.ts`](../../app/api/tenants/client-files/route.md)
- [`src/app/api/tenants/client-files/upload/route.ts`](../../app/api/tenants/client-files/upload/route.md)
- [`src/app/api/tenants/client-payment-plans/route.ts`](../../app/api/tenants/client-payment-plans/route.md)
- [`src/app/api/tenants/client-record-ledger/route.ts`](../../app/api/tenants/client-record-ledger/route.md)
- [`src/app/api/tenants/client-record/route.ts`](../../app/api/tenants/client-record/route.md)
- [`src/app/api/tenants/client-requests/route.ts`](../../app/api/tenants/client-requests/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/lib/server/inboxService.ts`](./inboxService.md)
- [`src/lib/server/seedClientFromPerson.ts`](./seedClientFromPerson.md)
- [`src/lib/server/websiteEnquiries.ts`](./websiteEnquiries.md)
- [`src/server/activity.ts`](../../server/activity.md)
- [`src/server/clientMilestones.ts`](../../server/clientMilestones.md)

