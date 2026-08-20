# `src/built-ins/modules/website-editor/src/api/handlers/customCode.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R029 — Custom code (CSS + head fragment) per variant.  Mounts on the existing page record (variants are pages with `portalRole`). The page schema already carries `customCss` and `customHead` fields from earlier rounds; this round adds: - server-side validation against size + script gates - one POST endpoint that operates on both at once - a getter that surfaces current values for editor preload

## Exports (2)

- `async handleGetCustomCode(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleSetCustomCode(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (4)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/customCode.ts`](../../lib/customCode.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../../server/pages.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r029-custom-css.test.ts`](../../__smoke__/r029-custom-css.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

