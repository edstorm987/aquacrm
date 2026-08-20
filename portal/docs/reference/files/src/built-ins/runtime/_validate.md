# `src/built-ins/runtime/_validate.ts`

← [File index](../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Plugin manifest validator. Lifted from `02/.../_validate.ts` with three adaptations: 1. New `category` value `"fulfillment"` accepted (T2's plugin). 2. Optional `scopePolicy` field validated when present (defaults to "either"). 3. Round 2: `panelId` is `string` (not enum) — wider set, validator just warns.  Runs at registration (registerPlugin) and once over the in-tree PLUGINS array on import. Rejects manifests malformed enough that the runtime, marketplace or sidebar would render in an undefined state.

## Exports (3)

- `interface PluginValidationResult (3 members)`
- `validatePlugin(plugin: AquaPlugin): PluginValidationResult`
- `validateRegistry(plugins: AquaPlugin[]): PluginValidationResult`

## Depends on (1)

- [`src/built-ins/runtime/_types.ts`](./_types.md)

## Used by (1)

- [`src/built-ins/runtime/_registry.ts`](./_registry.md)

