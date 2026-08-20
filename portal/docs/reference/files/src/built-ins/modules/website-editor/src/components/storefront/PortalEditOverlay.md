# `src/built-ins/modules/website-editor/src/components/storefront/PortalEditOverlay.tsx`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** In-place editor overlay. Faithful structural port from `02/src/components/PortalEditOverlay.tsx` (841 lines). Round-1 keeps the overlay shell; the click-target wiring + properties drawer is stubbed and lifted in Round 2.  Only mounted when `editMode=true` (set by foundation when an authenticated agency operator visits a portal route).

## Exports (2)

- `interface PortalEditOverlayProps (5 members)`
- `PortalEditOverlay({ pageId, clientId, agencyId, enabled, children }: PortalEditOverlayProps)`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/components/index.ts`](../index.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteUX.tsx`](./SiteUX.md)

