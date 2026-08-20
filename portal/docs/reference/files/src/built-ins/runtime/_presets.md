# `src/built-ins/runtime/_presets.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Phase / onboarding presets — one-click bundles of plugins applied when a phase becomes active or when an agency picks a starter pack at client creation time. Empty in foundation; T2 owns the phase preset definitions and round 2 ports the verticals (e-commerce, blog, …) from `02/.../_presets.ts`.

## Exports (2)

- `listPresets(): AquaPreset[]`
- `getPreset(id: string): AquaPreset | undefined`

## Depends on (1)

- [`src/built-ins/runtime/_types.ts`](./_types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

