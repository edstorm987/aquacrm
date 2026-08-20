# `src/built-ins/modules/website-editor/src/lib/tabSets.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Tab strips for the plugin admin pages.  The plugin-namespaced routes live under /portal/clients/[clientId]/... rather than /admin/... — but the lifted pages still pass these strips directly so operators can flip between sibling admin surfaces without leaving the editor context. The href values use the plugin-namespaced paths since that's where the foundation mounts the PluginPage handlers.

## Exports (3)

- `SETTINGS_TABS: AdminTab[]`
- `CONTENT_TABS: AdminTab[]`
- `PORTAL_TABS: AdminTab[]`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/components/AdminTabs.tsx`](../components/AdminTabs.md)

## Used by (9)

- [`src/built-ins/modules/website-editor/src/pages/AssetsPage.tsx`](../pages/AssetsPage.md)
- [`src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx`](../pages/CustomisePage.md)
- [`src/built-ins/modules/website-editor/src/pages/PageDetailPage.tsx`](../pages/PageDetailPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PagesPage.tsx`](../pages/PagesPage.md)
- [`src/built-ins/modules/website-editor/src/pages/PopupsPage.tsx`](../pages/PopupsPage.md)
- [`src/built-ins/modules/website-editor/src/pages/SectionsPage.tsx`](../pages/SectionsPage.md)
- [`src/built-ins/modules/website-editor/src/pages/SitesPage.tsx`](../pages/SitesPage.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemeDetailPage.tsx`](../pages/ThemeDetailPage.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemesPage.tsx`](../pages/ThemesPage.md)

