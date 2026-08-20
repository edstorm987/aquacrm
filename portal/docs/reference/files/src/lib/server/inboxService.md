# `src/lib/server/inbox/inboxService.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `async processInboxWebhookQueue(limit = 20): Promise<{ claimed: number; processed: number; failed: number; messages: number }>`
- `async ingestMetaWebhookPayload(payload: MetaWebhookPayload): Promise<number>`
- `async synchroniseInboxIdentityResolutions(agencyId: string, suppliedSnapshot?: InboxSnapshot): Promise<InboxSnapshot>`
- `async sendInboxReply(input: { agencyId: string; conversationId: string; text: string; actorUserId: string; actorEmail?: string; origin?: string; attachments?: InboxAttachment[]; }): Promise<InboxMessage>`
- `async addInboxNote(input: { agencyId: string; conversationId: string; text: string; actorUserId: string; actorEmail?: string; }): Promise<InboxMessage>`

## Depends on (7)

- [`src/lib/inbox/types.ts`](../inbox/types.md)
- [`src/lib/server/clients/clientRecordLedger.ts`](./clientRecordLedger.md)
- [`src/lib/server/identityResolution.ts`](./identityResolution.md)
- [`src/lib/server/inbox/inboxStore.ts`](./inboxStore.md)
- [`src/lib/server/integrations/metaMessaging.ts`](./metaMessaging.md)
- [`src/server/activity.ts`](../../server/activity.md)
- [`src/server/automations.ts`](../../server/automations.md)

## Used by (7)

- [`src/app/api/cron/inbox/route.ts`](../../app/api/cron/inbox/route.md)
- [`src/app/api/internal/sweep/route.ts`](../../app/api/internal/sweep/route.md)
- [`src/app/api/portal/identity-resolution/route.ts`](../../app/api/portal/identity-resolution/route.md)
- [`src/app/api/portal/inbox/messages/route.ts`](../../app/api/portal/inbox/messages/route.md)
- [`src/app/api/webhooks/meta/route.ts`](../../app/api/webhooks/meta/route.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../app/portal/agency/inbox/page.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)

