# `src/lib/server/operationalAlertPreferences.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `listOperationalAlertViews(agencyId: string, userId: string, alerts: OperationalAlert[], now = Date.now()): OperationalAlertView[]`
- `setOperationalAlertPreference({ agencyId, userId, alert, action, parkedUntil, now = Date.now(), }: { agencyId: string; userId: string; alert: OperationalAlert; action: OperationalAlertAction; parkedUntil?: number; now?: number; }): void`

## Depends on (3)

- [`src/lib/operationalAttention.ts`](../operationalAttention.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (6)

- [`src/app/api/portal/notifications/route.ts`](../../app/api/portal/notifications/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../app/portal/agency/inbox/page.md)
- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)

