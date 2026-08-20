# `src/lib/clients/clientRelationshipRecord.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `CLIENT_RECORD_ENTRY_KINDS`
- `type ClientRecordEntryKind`
- `type ClientRecordVisibility`
- `interface ClientRecordEntry (11 members)`
- `cleanClientRecordEntries(value: unknown): ClientRecordEntry[]`
- `safeRecordUrl(value: unknown): string | undefined`
- `cleanRecordText(value: unknown, limit: number): string`
- `cleanRecordTimestamp(value: unknown, fallback = Date.now()): number`

## Used by (9)

- [`scripts/smoke-client-relationship-record.test.ts`](../../../scripts/smoke-client-relationship-record.test.md)
- [`src/app/api/tenants/client-files/route.ts`](../../app/api/tenants/client-files/route.md)
- [`src/app/api/tenants/client-operation-task/route.ts`](../../app/api/tenants/client-operation-task/route.md)
- [`src/app/api/tenants/client-operations/route.ts`](../../app/api/tenants/client-operations/route.md)
- [`src/app/api/tenants/client-product-process/route.ts`](../../app/api/tenants/client-product-process/route.md)
- [`src/app/api/tenants/client-record/route.ts`](../../app/api/tenants/client-record/route.md)
- [`src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx`](../../app/portal/clients/[clientId]/_ClientRecordWorkspace.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)
- [`src/app/portal/customer/_portalData.ts`](../../app/portal/customer/_portalData.md)

