# `src/built-ins/modules/website-editor/src/server/incubatorTemplate.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R010 — Incubator template metadata resolver.  The Aqua Incubator root template (§15e) carries placeholders inside its propertyStrip rows (`{{phase}}` / `{{planTier}}` / `{{onboardingStartedAt}}`). When an operator clicks "+ New client → Use Aqua Incubator template" the foundation/T1 modal calls this helper post-`applyStarterVariant` to substitute live client metadata into the BlockTree before persisting.  Pure function — accepts `Block[]`, returns a deep-cloned `Block[]` with substituted strings. No storage, no foundation imports.

## Exports (3)

- `interface IncubatorClientMetadata (8 members)`
- `applyIncubatorClientMetadata(blocks: Block[], metadata: IncubatorClientMetadata): Block[]`
- `DEFAULT_INCUBATOR_METADATA: IncubatorClientMetadata`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r010-incubator-template-preset.test.ts`](../__smoke__/r010-incubator-template-preset.test.md)

