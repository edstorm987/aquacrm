# `src/app/portal/clients/[clientId]/_tabs.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Tab metadata — shared between server (page.tsx) and client (_OverviewTabs.tsx). Kept in its own module because Next.js does not allow importing non-component values from a "use client" module into a server component (causes runtime "TABS.map is not a function" when the proxy is destructured at module-load).

## Exports (2)

- `TABS`
- `type TabId`

## Depends on (1)

- [`src/lib/clients/clientWorkspace.ts`](../../../../lib/clients/clientWorkspace.md)

## Used by (3)

- [`src/app/portal/clients/[clientId]/_ClientLensHeader.tsx`](./_ClientLensHeader.md)
- [`src/app/portal/clients/[clientId]/_OverviewTabs.tsx`](./_OverviewTabs.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](./page.md)

