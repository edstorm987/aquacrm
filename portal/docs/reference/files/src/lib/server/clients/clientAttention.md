# `src/lib/server/clients/clientAttention.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `interface ClientAttentionItem (6 members)`
- `async listClientsNeedingAttention(agencyId: string, now = Date.now()): Promise<ClientAttentionItem[]>`

## Depends on (2)

- [`src/engines/data/server/radar/clientRadarService.ts`](../../../engines/data/server/radar/clientRadarService.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)

## Used by (3)

- [`src/app/portal/agency/_ClientsNeedingAttention.tsx`](../../../app/portal/agency/_ClientsNeedingAttention.md)
- [`src/app/portal/agency/_DashboardCommandCenter.tsx`](../../../app/portal/agency/_DashboardCommandCenter.md)
- [`src/app/portal/agency/page.tsx`](../../../app/portal/agency/page.md)

