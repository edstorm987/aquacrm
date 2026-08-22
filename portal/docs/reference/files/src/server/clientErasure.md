# `src/server/clientErasure.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (6)

- `type ErasureDisposition`
- `interface LiveScrubClient (1 members)`
- `interface LiveErasureStub (8 members)`
- `interface ClientErasureResult (4 members)`
- `async eraseClientCompletely(input: { agencyId: string; clientId: string; actorUserId: string; actorEmail?: string; /** Live Supabase client for the `inbox_*` / `brand_enquiries` scrub. When * omitted (e.g. memory tests), only in-memory sta…`
- `async previewClientErasure(agencyId: string, clientId: string): Promise<number | null>`

## Depends on (4)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/types.ts`](./types.md)

## Used by (3)

- [`src/app/api/portal/clients/[clientId]/erase/route.ts`](../app/api/portal/clients/[clientId]/erase/route.md)
- [`src/app/api/portal/governance/erasure/preview/route.ts`](../app/api/portal/governance/erasure/preview/route.md)
- [`src/app/portal/clients/[clientId]/settings/page.tsx`](../app/portal/clients/[clientId]/settings/page.md)

