# `src/components/chrome/Topbar.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** Topbar — tenant title, role badge, sign-out. Server-rendered.  Phone layouts: a menu button sits before the title and toggles the MobileNav drawer; on `md+` the persistent sidebar takes over and the drawer trigger hides. The role/email cluster collapses to two rows on `<sm` so nothing overflows.

## Exports (1)

- `Topbar({ title, subtitle, role, email, name, avatarUrl, panels, tenantLabel, currentPath, sidebarVariant = "standard", isDemo, homeHref, homeLabel, showcaseMode, publicShowcase, canUseDevMode, devModeActive, devConsole, previewActive, noti…`

## Depends on (13)

- [`src/components/chrome/ColorModeToggle.tsx`](./ColorModeToggle.md)
- [`src/components/chrome/DevConsoleControl.tsx`](./DevConsoleControl.md)
- [`src/components/chrome/MobileNav.tsx`](./MobileNav.md)
- [`src/components/chrome/PinnedTabs.tsx`](./PinnedTabs.md)
- [`src/components/chrome/PortalSearch.tsx`](./PortalSearch.md)
- [`src/components/chrome/PrivacyModeControl.tsx`](./PrivacyModeControl.md)
- [`src/components/chrome/ProfileMenu.tsx`](./ProfileMenu.md)
- [`src/components/chrome/PublicShowcaseControl.tsx`](./PublicShowcaseControl.md)
- [`src/components/chrome/ShowcaseModeControl.tsx`](./ShowcaseModeControl.md)
- [`src/components/chrome/Sidebar.tsx`](./Sidebar.md)
- [`src/components/chrome/TopbarBackButton.tsx`](./TopbarBackButton.md)
- [`src/lib/chrome/sidebarLayout.ts`](../../lib/chrome/sidebarLayout.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (5)

- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/app/portal/dev-team/layout.tsx`](../../app/portal/dev-team/layout.md)
- [`src/app/portal/team/layout.tsx`](../../app/portal/team/layout.md)

