# `src/built-ins/modules/website-editor/src/components/storefront/PortalPageRenderer.tsx`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Renders a published `EditorPage` for the storefront route. Wraps the block tree in the page's theme + custom CSS + head injections.  Faithful copy from `02/src/components/PortalPageRenderer.tsx`, re-scoped to take props directly (no lookup-by-host) — the foundation resolves the page server-side and passes it in.

## Exports (2)

- `interface PortalPageRendererProps (3 members)`
- `PortalPageRenderer({ page, theme, preview }: PortalPageRendererProps)`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/components/BlockRenderer.tsx`](../BlockRenderer.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/EditorThemeInjector.tsx`](./EditorThemeInjector.md)
- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../../types/editorPage.md)
- [`src/built-ins/modules/website-editor/src/types/theme.ts`](../../types/theme.md)

## Used by (3)

- [`src/app/client-website-preview/[clientId]/[siteId]/[pageId]/page.tsx`](../../../../../../app/client-website-preview/[clientId]/[siteId]/[pageId]/page.md)
- [`src/built-ins/modules/website-editor/src/components/index.ts`](../index.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteUX.tsx`](./SiteUX.md)

