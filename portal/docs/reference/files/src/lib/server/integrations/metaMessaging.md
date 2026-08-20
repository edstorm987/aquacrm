# `src/lib/server/integrations/metaMessaging.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (16)

- `interface MetaMessagingConfig (7 members)`
- `interface MetaOAuthStateData (6 members)`
- `interface DiscoveredMetaAccount (10 members)`
- `metaInboxReadiness(agencyId: string, origin?: string): MetaInboxReadiness`
- `readMetaMessagingConfig(agencyId: string, origin?: string): MetaMessagingConfig | null`
- `createMetaOAuthState(data: MetaOAuthStateData): string`
- `verifyMetaOAuthState(value: string): { ok: true; data: MetaOAuthStateData } | { ok: false; error: string }`
- `buildMetaAuthorizeUrl(config: MetaMessagingConfig, state: string, mode: InboxAuthMode): string`
- `async exchangeMetaOAuthCode(config: MetaMessagingConfig, code: string, mode: InboxAuthMode, fetchImpl: typeof fetch = fetch): Promise<DiscoveredMetaAccount[]>`
- `async subscribeMetaWebhooks(config: MetaMessagingConfig, account: DiscoveredMetaAccount, fetchImpl: typeof fetch = fetch): Promise<{ subscribed: boolean; message: string }>`
- `async sendMetaTextMessage(config: MetaMessagingConfig, connection: PrivateInboxConnection, recipientId: string, text: string, fetchImpl: typeof fetch = fetch): Promise<{ messageId: string }>`
- `async sendMetaAttachmentMessage(config: MetaMessagingConfig, connection: PrivateInboxConnection, recipientId: string, attachment: { type: "image" | "audio" | "video" | "file"; url: string }, fetchImpl: typeof fetch = fetch): Promise<{ mess…`
- `verifyMetaWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean`
- `constantTimeSecretMatch(supplied: string, candidates: Iterable<string>): boolean`
- `metaWebhookVerifyTokenAccepted(suppliedToken: string): boolean`
- `async verifyMetaWebhookRequest(rawBody: string, signatureHeader: string | null, payload: { entry?: Array<{ id?: unknown }> } | null): Promise<boolean>`

## Depends on (4)

- [`src/lib/inbox/types.ts`](../../inbox/types.md)
- [`src/lib/server/inbox/inboxStore.ts`](../inbox/inboxStore.md)
- [`src/lib/server/inbox/inboxVault.ts`](../inbox/inboxVault.md)
- [`src/lib/server/integrations/integrationConnections.ts`](./integrationConnections.md)

## Used by (7)

- [`src/app/api/portal/inbox/connections/route.ts`](../../../app/api/portal/inbox/connections/route.md)
- [`src/app/api/portal/inbox/meta/callback/route.ts`](../../../app/api/portal/inbox/meta/callback/route.md)
- [`src/app/api/portal/inbox/meta/start/route.ts`](../../../app/api/portal/inbox/meta/start/route.md)
- [`src/app/api/webhooks/meta/route.ts`](../../../app/api/webhooks/meta/route.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../../app/portal/agency/inbox/page.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../../app/portal/agency/marketing/page.md)
- [`src/lib/server/inbox/inboxService.ts`](../inbox/inboxService.md)

