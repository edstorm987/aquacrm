# `src/lib/server/inbox/inboxStore.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (24)

- `interface PrivateInboxConnection (1 members)`
- `interface InboxWebhookEvent (12 members)`
- `async listInboxConnections(agencyId: string): Promise<InboxChannelConnection[]>`
- `async getPrivateInboxConnection(agencyId: string, connectionId: string): Promise<PrivateInboxConnection | null>`
- `async findPrivateConnectionByExternalAccount(externalAccountId: string): Promise<PrivateInboxConnection | null>`
- `async saveInboxConnection(input: Omit<PrivateInboxConnection, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<InboxChannelConnection>`
- `async updateInboxConnection(agencyId: string, connectionId: string, patch: Partial<Pick<PrivateInboxConnection, "companyId" | "marketingAssetId" | "status" | "webhookStatus" | "lastWebhookAt" | "lastSyncAt" | "lastError" | "encryptedAccess…`
- `async disconnectInboxConnection(agencyId: string, connectionId: string): Promise<void>`
- `async listInboxSnapshot(agencyId: string): Promise<InboxSnapshot>`
- `async saveInboxIdentity(input: Omit<InboxIdentity, "id" | "createdAt" | "updatedAt">): Promise<InboxIdentity>`
- `async updateInboxIdentityLinks(agencyId: string, identityId: string, patch: Pick<InboxIdentity, "leadId" | "contactId" | "clientId">): Promise<InboxIdentity>`
- `async saveInboxConversation(input: Omit<InboxConversation, "id" | "createdAt" | "updatedAt">): Promise<InboxConversation>`
- `async getInboxConversation(agencyId: string, conversationId: string): Promise<InboxConversationThread | null>`
- `async updateInboxConversation(agencyId: string, conversationId: string, patch: Partial<Pick<InboxConversation, "status" | "assignedTo" | "tags" | "unreadCount" | "snoozedUntil" | "closedAt">>): Promise<InboxConversation>`
- `async saveInboxMessage(input: Omit<InboxMessage, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<InboxMessage>`
- `async updateInboxMessage(agencyId: string, messageId: string, patch: Partial<Pick<InboxMessage, "externalMessageId" | "status" | "error" | "metadata">>): Promise<InboxMessage>`
- `async markExternalMessageDeleted(connectionId: string, externalMessageId: string): Promise<void>`
- `async enqueueInboxWebhookEvent(input: { eventKey: string; objectType?: string; payload: Record<string, unknown>; }): Promise<{ event: InboxWebhookEvent; duplicate: boolean }>`
- `async claimInboxWebhookEvents(limit = 20): Promise<InboxWebhookEvent[]>`
- `async completeInboxWebhookEvent(eventId: string): Promise<void>`
- `async failInboxWebhookEvent(event: InboxWebhookEvent, cause: unknown): Promise<void>`
- `async pruneProcessedInboxWebhookEvents(retentionDays = 30): Promise<number>`
- `inboxStorageDescription(): string`
- `createInboxId(prefix: "cnv" | "msg" | "idy" | "chn"): string`

## Depends on (2)

- [`src/lib/inbox/types.ts`](../../inbox/types.md)
- [`src/lib/shared/formatDateTime.ts`](../../shared/formatDateTime.md)

## Used by (17)

- [`src/app/api/cron/inbox/route.ts`](../../../app/api/cron/inbox/route.md)
- [`src/app/api/portal/identity-resolution/route.ts`](../../../app/api/portal/identity-resolution/route.md)
- [`src/app/api/portal/inbox/connections/route.ts`](../../../app/api/portal/inbox/connections/route.md)
- [`src/app/api/portal/inbox/conversations/route.ts`](../../../app/api/portal/inbox/conversations/route.md)
- [`src/app/api/portal/inbox/media/route.ts`](../../../app/api/portal/inbox/media/route.md)
- [`src/app/api/portal/inbox/meta/callback/route.ts`](../../../app/api/portal/inbox/meta/callback/route.md)
- [`src/app/api/portal/search/route.ts`](../../../app/api/portal/search/route.md)
- [`src/app/api/webhooks/meta/route.ts`](../../../app/api/webhooks/meta/route.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../../app/portal/agency/inbox/page.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../../app/portal/agency/marketing/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/clients/page.tsx`](../../../app/portal/clients/page.md)
- [`src/app/portal/customer/_portalData.ts`](../../../app/portal/customer/_portalData.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../../../engines/data/server/radar/businessIssueRadar.md)
- [`src/engines/data/server/radar/radarSourceInspection.ts`](../../../engines/data/server/radar/radarSourceInspection.md)
- [`src/lib/server/inbox/inboxService.ts`](./inboxService.md)
- [`src/lib/server/integrations/metaMessaging.ts`](../integrations/metaMessaging.md)

