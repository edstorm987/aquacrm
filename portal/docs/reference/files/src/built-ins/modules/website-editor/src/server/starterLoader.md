# `src/built-ins/modules/website-editor/src/server/starterLoader.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Loads starter trees from `src/starters/<variantId>.json` at runtime.  In a Next.js context this resolves via dynamic import; in a Node smoke test it resolves via fs. Both paths share the same shape.

## Exports (3)

- `interface StarterTreeFile (5 members)`
- `async loadStarterTree(variantId: string): Promise<StarterTreeFile | null>`
- `listStarterIds(): string[]`

## Depends on (9)

- [`src/built-ins/modules/website-editor/src/components/pageTemplates.ts`](../components/pageTemplates.md)
- [`src/built-ins/modules/website-editor/src/lib/portalRole.ts`](../lib/portalRole.md)
- [`src/built-ins/modules/website-editor/src/starters/account-default.json`](../starters/account-default.json)
- [`src/built-ins/modules/website-editor/src/starters/affiliates-default.json`](../starters/affiliates-default.json)
- [`src/built-ins/modules/website-editor/src/starters/login-default.json`](../starters/login-default.json)
- [`src/built-ins/modules/website-editor/src/starters/login-design.json`](../starters/login-design.json)
- [`src/built-ins/modules/website-editor/src/starters/login-onboarding.json`](../starters/login-onboarding.json)
- [`src/built-ins/modules/website-editor/src/starters/orders-default.json`](../starters/orders-default.json)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (5)

- [`src/built-ins/modules/website-editor/src/__smoke__/blocks.test.ts`](../__smoke__/blocks.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/brand-page-templates.test.ts`](../__smoke__/brand-page-templates.test.md)
- [`src/built-ins/modules/website-editor/src/__smoke__/r010-incubator-template-preset.test.ts`](../__smoke__/r010-incubator-template-preset.test.md)
- [`src/built-ins/modules/website-editor/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](./portalVariants.md)

