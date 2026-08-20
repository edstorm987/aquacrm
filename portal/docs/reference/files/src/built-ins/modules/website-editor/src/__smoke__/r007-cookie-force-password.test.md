# `src/built-ins/modules/website-editor/src/__smoke__/r007-cookie-force-password.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R007 cookie-consent block + force-password-change registry.  Block test is structural (no DOM): we assert blockRegistry surfaces the new entry with the right shape + defaults so applyStarterVariant + the editor's field-form + the renderer all see a consistent contract.  Force-password-change tests round-trip the registry + handler.

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/handlers/forcePassword.ts`](../api/handlers/forcePassword.md)
- [`src/built-ins/modules/website-editor/src/components/blockRegistry.ts`](../components/blockRegistry.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/forcePasswordChange.ts`](../server/forcePasswordChange.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

