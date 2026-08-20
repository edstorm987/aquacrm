# `src/built-ins/modules/website-editor/src/lib/sidebarLayout.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (20)

- `type Resource`
- `MAX_SIDEBAR_DEPTH`
- `type SidebarItemType`
- `interface SidebarLink (6 members)`
- `interface SidebarGroup (4 members)`
- `type SidebarItem`
- `interface SidebarPanel (5 members)`
- `interface SidebarLayout (1 members)`
- `type BadgeKey`
- `DEFAULT_LAYOUT: SidebarLayout`
- `getSidebarLayout(): SidebarLayout`
- `saveSidebarLayout(layout: SidebarLayout)`
- `resetSidebarLayout()`
- `onSidebarLayoutChange(handler: () => void): () => void`
- `walkLinks(items: SidebarItem[]): IterableIterator<SidebarLink>`
- `findPanelForPath(layout: SidebarLayout, pathname: string): string | null`
- `canAddFolderInside(containerDepth: number): boolean`
- `newId(prefix: string): string`
- `interface PluginContributionInput (7 members)`
- `applyPluginContributions(layout: SidebarLayout, contributions: PluginContributionInput[]): SidebarLayout`

## Used by (1)

- [`src/built-ins/modules/website-editor/src/pages/CustomisePage.tsx`](../pages/CustomisePage.md)

