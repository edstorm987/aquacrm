# `src/components/chrome/Sidebar.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** Sidebar — server-rendered navigation. Reads NavPanel[] from buildSidebar(); each panel groups NavItems.  Standard panels render inside native <details>. Client workspaces keep stable parent destinations visible while contextual detail stays in-page.  Collapsed-mode (data-collapsed="true") hides labels and the summary text, leaving just the leading icon for each item. Native title="" gives a tooltip on hover.

## Exports (2)

- `type SidebarVariant`
- `Sidebar({ panels, tenantLabel, currentPath, mobile = false, extra, navAlignment = "center", variant = "standard" }: Props)`

## Depends on (6)

- [`src/components/chrome/CompanySwitcher.tsx`](./CompanySwitcher.md)
- [`src/components/chrome/PinnedTabs.tsx`](./PinnedTabs.md)
- [`src/components/chrome/SidebarFooter.tsx`](./SidebarFooter.md)
- [`src/components/chrome/SidebarNavLink.tsx`](./SidebarNavLink.md)
- [`src/lib/chrome/sidebarLayout.ts`](../../lib/chrome/sidebarLayout.md)
- [`src/lib/chrome/workspaces.ts`](../../lib/chrome/workspaces.md)

## Used by (7)

- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/app/portal/dev-team/layout.tsx`](../../app/portal/dev-team/layout.md)
- [`src/app/portal/team/layout.tsx`](../../app/portal/team/layout.md)
- [`src/components/chrome/MobileNav.tsx`](./MobileNav.md)
- [`src/components/chrome/Topbar.tsx`](./Topbar.md)

