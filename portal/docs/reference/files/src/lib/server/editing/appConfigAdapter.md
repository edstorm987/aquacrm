# `src/lib/server/editing/appConfigAdapter.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (9)

- `type AppConfigControl`
- `type AppConfigGroup`
- `APP_CONFIG_GROUPS: AppConfigGroup[]`
- `interface AppConfigFieldView (9 members)`
- `appConfigFieldViews(document: EditDocument): AppConfigFieldView[]`
- `interface AppConfigInvalidValue (3 members)`
- `interface AppConfigSkippedValue (2 members)`
- `prepareAppConfigIntents(raw: Array<{ targetId: string; expectedFingerprint: string; value: string }>, current?: EditDocument): { intents: EditIntent[]; invalid: AppConfigInvalidValue[]; skipped: AppConfigSkippedValue[] }`
- `appConfigEditAdapter(input: { /** Always the session's agency. Never a value taken from a request body. */ agencyId: string; actorUserId: string; }): EditAdapter`

## Depends on (7)

- [`src/lib/editing/engine.ts`](../../editing/engine.md)
- [`src/lib/elements/definition.ts`](../../elements/definition.md)
- [`src/lib/server/editing/adapters.ts`](./adapters.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/agencySettings.ts`](../../../server/agencySettings.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (5)

- [`scripts/smoke-dev-team-editor.test.ts`](../../../../scripts/smoke-dev-team-editor.test.md)
- [`scripts/smoke-element-engine.test.ts`](../../../../scripts/smoke-element-engine.test.md)
- [`src/app/api/portal/dev-team/editor/route.ts`](../../../app/api/portal/dev-team/editor/route.md)
- [`src/app/portal/dev-team/editor/_AppConfigEditor.tsx`](../../../app/portal/dev-team/editor/_AppConfigEditor.md)
- [`src/app/portal/dev-team/editor/_Section.tsx`](../../../app/portal/dev-team/editor/_Section.md)

