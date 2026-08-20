# `src/server/portalEditor.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (3)

- `getPortalEditorState(agencyId: string): PortalFormEditorState`
- `savePortalEditorField(agencyId: string, entity: PortalFormEntity, value: Partial<PortalFormFieldDefinition>, actorUserId: string): PortalFormEditorState`
- `deletePortalEditorField(agencyId: string, entity: PortalFormEntity, fieldId: string, actorUserId: string): PortalFormEditorState`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (2)

- [`src/app/api/portal/settings/portal-editor/route.ts`](../app/api/portal/settings/portal-editor/route.md)
- [`src/lib/server/editing/adapters.ts`](../lib/server/editing/adapters.md)

