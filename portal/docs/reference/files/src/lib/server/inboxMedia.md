# `src/lib/server/inboxMedia.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `type InboxMediaTargetKind`
- `interface InboxMediaTokenPayload (11 members)`
- `signInboxMediaToken(input: Omit<InboxMediaTokenPayload, "exp">, lifetimeMs = 30 * 24 * 60 * 60_000): string`
- `verifyInboxMediaToken(token: string): InboxMediaTokenPayload | null`
- `async readInboxMedia(payload: InboxMediaTokenPayload): Promise<Blob | Buffer | null>`
- `inboxMediaUrl(origin: string, token: string): string`

## Depends on (2)

- [`src/lib/inbox/media.ts`](../inbox/media.md)
- [`src/lib/server/privateUploadStorage.ts`](./privateUploadStorage.md)

## Used by (5)

- [`src/app/api/portal/inbox/media/content/route.ts`](../../app/api/portal/inbox/media/content/route.md)
- [`src/app/api/portal/inbox/media/route.ts`](../../app/api/portal/inbox/media/route.md)
- [`src/app/api/portal/inbox/messages/route.ts`](../../app/api/portal/inbox/messages/route.md)
- [`src/app/api/portal/website-enquiries/communications/route.ts`](../../app/api/portal/website-enquiries/communications/route.md)
- [`src/app/api/tenants/client-requests/route.ts`](../../app/api/tenants/client-requests/route.md)

