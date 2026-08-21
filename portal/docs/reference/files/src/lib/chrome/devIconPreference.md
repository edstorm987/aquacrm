# `src/lib/chrome/devIconPreference.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Dev tools icon visibility — a server-readable preference driving whether the topbar Dev Console icon (`DevConsoleButton`) is shown.  The profile-menu "Dev Mode" toggle used to NAVIGATE straight to the dev workspace (a bug: a menu toggle should toggle, not teleport). It now flips this cookie and reloads; the topbar reads it server-side and shows/hides the icon. Entering the workspace happens from INSIDE the icon's popover.  Default: SHOWN. Founders see the icon today, so an absent cookie must keep it visible — turning the toggle OFF is the only thing that hides it. The server-side founder + Dev-Mode gate still applies on top of this preference; this cookie can only ever HIDE an icon the founder is already entitled to. Cookie name. Read on the server by `devIconPreference()`.

## Exports (3)

- `DEV_ICON_COOKIE`
- `devIconCookieEnabled(): boolean`
- `setDevIconCookie(shown: boolean): void`

## Used by (3)

- [`scripts/smoke-profile-toggles.test.ts`](../../../scripts/smoke-profile-toggles.test.md)
- [`src/components/chrome/ProfileMenu.tsx`](../../components/chrome/ProfileMenu.md)
- [`src/lib/server/devIconPreference.ts`](../server/devIconPreference.md)

