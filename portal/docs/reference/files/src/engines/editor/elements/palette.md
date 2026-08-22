# `src/engines/editor/elements/palette.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** What can be placed here — one palette, filtered by surface.  ─── The question this module answers, and the one it does not ────────────  There are two separate questions about a target, and collapsing them is what hid the whole website block library from the Dev Editor:  1. WHICH VOCABULARY does this target speak?  ← this module Every target has one. A client portal speaks the portal's 16 names; a site, a repository or a game build speaks the website's 70 elements. "No vocabulary" is not one of the answers.  2. IS THERE AN AQUA-HOSTED PORTAL DOCUMENT behind it?  ← `portalTarget` That owns portal pages, the lifecycle stage, the draft/publish pair and the portal-only inspectors. It is NOT the same question as (1), and it must never be used to decide (1) again: `portalTarget` is false for every project Ed creates, so gating the palette on it meant those projects were offered nothing at all.  A third question — "can a live page be clicked?" — belongs to the Aqua Tag alone (`tagMapped`). See `editing/modes.ts`.  ─── Layering ─────────────────────────────────────────────────────────────  Same rules as the rest of `src/engines/editor/elements`: no `server-only`, no plugin import, nothing that breaks under `--conditions react-server`. The website definitions are read through the shared registry, which the plugin fills on import — see `./websiteElements.ts` for how the editor makes that import happen without paying for it up front.

## Exports (8)

- `elementSurfaceFor(target: { portalTarget: boolean }): ElementSurface`
- `interface ElementPaletteItem (6 members)`
- `WEBSITE_CATEGORY_ORDER: readonly ElementCategory[]`
- `WEBSITE_CATEGORY_LABELS: Record<ElementCategory, string>`
- `PORTAL_CATEGORY_LABELS: Record<string, string>`
- `elementPalette(surface: ElementSurface): ElementPaletteItem[]`
- `elementPaletteGroups(surface: ElementSurface): Array<{ group: string; items: ElementPaletteItem[] }>`
- `elementLibrarySentence(input: { surface: ElementSurface; /** A portal design document is open, so blocks have a page to land on. */ hasPortalDocument: boolean; /** An Aqua Tag answers on this project's page. */ tagMapped: boolean; /** Defi…`

## Depends on (3)

- [`src/engines/editor/elements/definition.ts`](./definition.md)
- [`src/engines/editor/elements/portalElements.ts`](./portalElements.md)
- [`src/engines/editor/elements/registry.ts`](./registry.md)

## Used by (3)

- [`scripts/smoke-editor-element-palette.test.ts`](../../../../scripts/smoke-editor-element-palette.test.md)
- [`src/engines/editor/DevEditor.tsx`](../DevEditor.md)
- [`src/engines/editor/elements/index.ts`](./index.md)

