# `src/built-ins/modules/fulfillment/src/lib/ids.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Lightweight id generator. Avoids a runtime dep on `nanoid` so the plugin keeps its `dependencies` empty.

## Exports (2)

- `makeId(prefix: string, length = 12): string`
- `slugify(s: string): string`

## Used by (2)

- [`src/built-ins/modules/fulfillment/src/server/phases.ts`](../server/phases.md)
- [`src/built-ins/modules/fulfillment/src/server/presets.ts`](../server/presets.md)

