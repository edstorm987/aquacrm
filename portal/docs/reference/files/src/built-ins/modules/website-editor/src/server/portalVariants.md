# `src/built-ins/modules/website-editor/src/server/portalVariants.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Portal-variant operations.  `applyStarterVariant` is the public contract T2's fulfillment plugin calls during phase transitions. It loads a JSON starter tree from `src/starters/<variantId>.json`, creates a new EditorPage scoped to (agencyId, clientId, siteId, role), flags it as the active variant for that role, and returns the new ID triple.  The function is fail-safe: catches and returns `{ ok: false, error }` rather than throwing, so a failed variant apply doesn't break a phase transition.

## Exports (5)

- `interface ApplyStarterVariantInput (5 members)`
- `type ApplyStarterVariantResult`
- `async applyStarterVariant(input: ApplyStarterVariantInput, storage: PluginStorage): Promise<ApplyStarterVariantResult>`
- `interface PortalVariantSummary (8 members)`
- `async listAllPortalVariants(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, siteId: string): Promise<PortalVariantSummary[]>`

## Depends on (9)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](../lib/portalRole.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](./pages.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](./sites.md)
- [`src/built-ins/modules/website-editor/src/server/starterLoader.ts`](./starterLoader.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (4)

- [`src/built-ins/modules/website-editor/src/__smoke__/blocks.test.ts`](../__smoke__/blocks.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r012-portal-variant-editor.test.ts`](../__smoke__/r012-portal-variant-editor.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pages.ts`](../api/handlers/pages.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)

