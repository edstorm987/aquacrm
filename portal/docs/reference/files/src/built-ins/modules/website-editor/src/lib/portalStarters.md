# `src/built-ins/modules/website-editor/src/lib/portalStarters.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Portal-variant starter block trees + summary catalogue.  Faithful port of `02/src/lib/admin/portalStarters.ts` — `starterForRole` returns the block tree the editor should seed when an operator clicks "+ New variant" on /admin/portals. Combined with the Round-1 metadata list (STARTERS / listStartersForRole / getStarter) used by the admin's variant catalogue.

## Exports (5)

- `starterForRole(role: PortalRole): Block[]`
- `interface StarterSummary (4 members)`
- `STARTERS: StarterSummary[]`
- `listStartersForRole(role: PortalRole): StarterSummary[]`
- `getStarter(variantId: string): StarterSummary | undefined`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](./portalRole.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/pages/PortalsPage.tsx`](../pages/PortalsPage.md)

