# `src/lib/elements/index.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** The element vocabulary — one shape, three surfaces.  Website pages, client portal pages and product lifecycle stages are all trees of the same thing. This directory is where that thing is declared. Before P1 it lived inside the website-editor plugin, which meant the portal and the stage builder each grew their own near-copy: two block registries with 14 of 16 types duplicated, three `BlockStyles`→CSS mappers, two prop-schema vocabularies. Lifting the vocabulary out is what lets the next phases delete those copies instead of adding a fourth.  Naming: `Element*` is the forward-looking spelling and `Block*` is the same type under its shipped name. They are aliases, never two shapes.  ─── Layering rules, which matter more than they look ────────────────────  1. NOTHING here may `import "server-only"`. These modules are imported by client components and by the smoke suite under `--conditions react-server`. 2. NOTHING here may import a plugin. The 70 website element definitions stay in `.../website-editor/src/components/blockRegistry.ts` and push themselves into `./registry` on import; this side never reaches back. 3. `lazyBlock` deliberately did NOT move. It is a hand-rolled `React.lazy` because `next/dynamic` reaches `React.createContext`, which the react-server build of React does not export — a single top-level `import dynamic from "next/dynamic"` would throw before a test could run. It lives next to the registry that uses it and stays there.

_No exported symbols (side-effect / internal module)._

## Depends on (8)

- [`src/lib/elements/block.ts`](./block.md)
- [`src/lib/elements/blockSchemaMigrations.ts`](./blockSchemaMigrations.md)
- [`src/lib/elements/blockStyles.ts`](./blockStyles.md)
- [`src/lib/elements/blockTreeOps.ts`](./blockTreeOps.md)
- [`src/lib/elements/definition.ts`](./definition.md)
- [`src/lib/elements/ids.ts`](./ids.md)
- [`src/lib/elements/registry.ts`](./registry.md)
- [`src/lib/elements/schema.ts`](./schema.md)

## Used by (1)

- [`scripts/smoke-element-engine.test.ts`](../../../scripts/smoke-element-engine.test.md)

