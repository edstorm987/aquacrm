# `src/built-ins/modules/website-editor/src/api/handlers/brandKit.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R011 — Brand-kit settings handlers (per-install extended fields).  Foundation owns the agency's source-of-truth `BrandKit` (primary / secondary / accent / fonts / radius / customCSS). This endpoint surfaces the website-editor's extended fields so an operator can tune bg / bgElevated / text / textMuted / border / radius scale / darkMode without touching the foundation tenant record.  Storage: `t/<agencyId>/<clientId>/website-editor/brand-kit-extended`. Cross-pollinates with the Sidebar/Editor preview via the `extendedBrandToCss` helper.

## Exports (2)

- `async handleGetBrandKitExtended(_req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleSaveBrandKitExtended(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../../lib/tenancy.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r011-brand-kit-css-vars.test.ts`](../../__smoke__/r011-brand-kit-css-vars.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

