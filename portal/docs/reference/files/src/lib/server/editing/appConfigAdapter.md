# `src/lib/server/editing/appConfigAdapter.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `type AppConfigControl`
- `type AppConfigGroup`
- `APP_CONFIG_GROUPS: AppConfigGroup[]`
- `interface AppConfigFieldView (9 members)`
- `appConfigFieldViews(document: EditDocument): AppConfigFieldView[]`
- `interface AppConfigInvalidValue (3 members)`
- `prepareAppConfigIntents(raw: Array<{ targetId: string; expectedFingerprint: string; value: string }>): { intents: EditIntent[]; invalid: AppConfigInvalidValue[] }`
- `appConfigEditAdapter(input: { /** Always the session's agency. Never a value taken from a request body. */ agencyId: string; actorUserId: string; }): EditAdapter`

## Depends on (6)

- [`src/lib/editing/engine.ts`](../../editing/engine.md)
- [`src/lib/server/editing/adapters.ts`](./adapters.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/agencySettings.ts`](../../../server/agencySettings.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (3)

- [`src/app/api/portal/dev-team/editor/route.ts`](../../../app/api/portal/dev-team/editor/route.md)
- [`src/app/portal/dev-team/editor/_AppConfigEditor.tsx`](../../../app/portal/dev-team/editor/_AppConfigEditor.md)
- [`src/app/portal/dev-team/editor/page.tsx`](../../../app/portal/dev-team/editor/page.md)

