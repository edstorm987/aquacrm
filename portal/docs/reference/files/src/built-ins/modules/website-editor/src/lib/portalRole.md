# `src/built-ins/modules/website-editor/src/lib/portalRole.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `PortalRole` is the *variant* role — which client-portal surface a page belongs to. Distinct from user `Role` ("agency-owner" / "client-owner" / ...). T3 owns this type; T2's fulfillment plugin imports it via `@aqua/plugin-website-editor/types` (post-integration).  Each `(siteId, role)` may have many EditorPage variants but exactly zero or one with `isActivePortal=true` — the customer-facing route renders that one.

## Exports (4)

- `type PortalRole`
- `PORTAL_ROLES: readonly PortalRole[]`
- `isPortalRole(value: unknown): value is PortalRole`
- `portalRoleLabel(role: PortalRole): string`

## Used by (10)

- [`src/built-ins/modules/website-editor/src/api/handlers/pages.ts`](../api/handlers/pages.md)
- [`src/built-ins/modules/website-editor/src/lib/editorPages.ts`](./editorPages.md)
- [`src/built-ins/modules/website-editor/src/lib/portalStarters.ts`](./portalStarters.md)
- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](./savePipeline.md)
- [`src/built-ins/modules/website-editor/src/pages/PortalsPage.tsx`](../pages/PortalsPage.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../server/portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/starterLoader.ts`](../server/starterLoader.md)
- [`src/built-ins/modules/website-editor/src/server/storage-keys.ts`](../server/storage-keys.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

