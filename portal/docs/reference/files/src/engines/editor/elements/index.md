# `src/engines/editor/elements/index.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** The element vocabulary — one shape, three surfaces.  Website pages, client portal pages and product lifecycle stages are all trees of the same thing. This directory is where that thing is declared. Before P1 it lived inside the website-editor plugin, which meant the portal and the stage builder each grew their own near-copy: two block registries with 14 of 16 types duplicated, three `BlockStyles`→CSS mappers, two prop-schema vocabularies. Lifting the vocabulary out is what lets the next phases delete those copies instead of adding a fourth.  Naming: `Element*` is the forward-looking spelling and `Block*` is the same type under its shipped name. They are aliases, never two shapes.  ─── Layering rules, which matter more than they look ────────────────────  1. NOTHING here may `import "server-only"`. These modules are imported by client components and by the smoke suite under `--conditions react-server`. 2. NOTHING here may import a plugin. The 70 website element definitions stay in `.../website-editor/src/components/blockRegistry.ts` and push themselves into `./registry` on import; this side never reaches back. 3. `lazyBlock` deliberately did NOT move. It is a hand-rolled `React.lazy` because `next/dynamic` reaches `React.createContext`, which the react-server build of React does not export — a single top-level `import dynamic from "next/dynamic"` would throw before a test could run. It lives next to the registry that uses it and stays there.

_No exported symbols (side-effect / internal module)._

## Depends on (10)

- [`src/engines/editor/elements/block.ts`](./block.md)
- [`src/engines/editor/elements/blockSchemaMigrations.ts`](./blockSchemaMigrations.md)
- [`src/engines/editor/elements/blockStyles.ts`](./blockStyles.md)
- [`src/engines/editor/elements/blockTreeOps.ts`](./blockTreeOps.md)
- [`src/engines/editor/elements/definition.ts`](./definition.md)
- [`src/engines/editor/elements/ids.ts`](./ids.md)
- [`src/engines/editor/elements/palette.ts`](./palette.md)
- [`src/engines/editor/elements/registry.ts`](./registry.md)
- [`src/engines/editor/elements/schema.ts`](./schema.md)
- [`src/engines/editor/elements/websiteElements.ts`](./websiteElements.md)

## Used by (7)

- [`scripts/smoke-element-engine.test.ts`](../../../../scripts/smoke-element-engine.test.md)
- [`scripts/smoke-sop-composer.test.ts`](../../../../scripts/smoke-sop-composer.test.md)
- [`scripts/smoke-sop-interactive.test.ts`](../../../../scripts/smoke-sop-interactive.test.md)
- [`src/app/api/portal/sops/route.ts`](../../../app/api/portal/sops/route.md)
- [`src/app/portal/agency/sop-library/_SopLibrary.tsx`](../../../app/portal/agency/sop-library/_SopLibrary.md)
- [`src/app/portal/agency/sop-library/composerBlocks.ts`](../../../app/portal/agency/sop-library/composerBlocks.md)
- [`src/engines/sop/server/sops.ts`](../../sop/server/sops.md)

