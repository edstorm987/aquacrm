# `src/built-ins/modules/email-sender/src/server/emails.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** EmailService — public entry point + idempotent enqueue + state machine + cross-plugin event subscribers.  Storage: email/by-id/<id>            → EmailMessage email/idem/<key>            → IdempotencyEntry  (collapse re-enqueue) email/by-status/<status>    → string[] of message ids per status email/index                 → string[] of all message ids

## Exports (1)

- `class EmailService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort, private identities: IdentityService, private marketingTemplates?: MarketingTemplatePort)`
    - `async list(filter?: MessageFilter): Promise<EmailMessage[]>`
    - `async get(id: string): Promise<EmailMessage | null>`
    - `async getByExternalRef(externalRef: string): Promise<EmailMessage | null>`
    - `async enqueue(input: EnqueueInput, actor: UserId = "system"): Promise<EmailMessage>`
    - `async markSending(id: string): Promise<EmailMessage | null>`
    - `async markSent(id: string, externalRef: string): Promise<EmailMessage | null>`
    - `async markFailed(id: string, reason: string): Promise<EmailMessage | null>`
    - `async markBounced(id: string, reason?: string): Promise<EmailMessage | null>`
    - `async resetForRetry(id: string): Promise<EmailMessage | null>`
    - `async onFormsNotificationRequested(payload: { submissionId: string; formId: string; formName: string; notifyEmails?: string[]; payload: Record<string, unknown>; }): Promise<EmailMessage | null>`
    - `async onMembershipSubscriptionChanged(payload: { subscriptionId: string; userId: string; userEmail?: string; oldStatus: string; newStatus: string; planName?: string; }): Promise<EmailMessage | null>`
    - `async onAffiliatePayoutCompleted(payload: { payoutId: string; affiliateUserId: string; affiliateEmail?: string; amountCents: number; externalRef?: string; }): Promise<EmailMessage | null>`
    - `async onAuthBootstrapSignup(payload: { userId: string; email: string; name?: string; agencyName?: string; }): Promise<EmailMessage | null>`
    - `async eraseForAddresses(addresses: readonly string[], clientId?: string): Promise<number>`

## Depends on (6)

- [`src/built-ins/modules/email-sender/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/email-sender/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/email-sender/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/email-sender/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/email-sender/src/server/identities.ts`](./identities.md)
- [`src/built-ins/modules/email-sender/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/email-sender/src/server/delivery.ts`](./delivery.md)
- [`src/built-ins/modules/email-sender/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/email-sender/src/server/webhook.ts`](./webhook.md)

