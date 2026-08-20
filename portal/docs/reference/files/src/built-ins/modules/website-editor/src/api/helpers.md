# `src/built-ins/modules/website-editor/src/api/helpers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Tiny helpers shared across handler modules. Round-1 minimal — Round-2 adds proper error mapping, request logging, and rate-limit shims.

## Exports (6)

- `json(body: unknown, init: ResponseInit = {}): Response`
- `ok<T>(data: T, init: ResponseInit = {}): Response`
- `fail(error: string, status = 400): Response`
- `async readJsonBody<T>(req: Request): Promise<T | null>`
- `readQuery(req: Request): Record<string, string>`
- `requireClientScope(ctx: PluginCtx): { ok: true; agencyId: string; clientId: string } | { ok: false; res: Response }`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)

## Used by (22)

- [`src/built-ins/modules/website-editor/src/api/handlers/assets.ts`](./handlers/assets.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/blog.ts`](./handlers/blog.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/brandKit.ts`](./handlers/brandKit.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/components.ts`](./handlers/components.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/content.ts`](./handlers/content.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/customCode.ts`](./handlers/customCode.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/discoveries.ts`](./handlers/discoveries.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/embedAllow.ts`](./handlers/embedAllow.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/embeds.ts`](./handlers/embeds.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/forcePassword.ts`](./handlers/forcePassword.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/formSubmissionHost.ts`](./handlers/formSubmissionHost.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pagePrivacy.ts`](./handlers/pagePrivacy.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pageVersions.ts`](./handlers/pageVersions.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/pages.ts`](./handlers/pages.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/promote.ts`](./handlers/promote.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/redirects.ts`](./handlers/redirects.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/seoMeta.ts`](./handlers/seoMeta.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sitemapHostRoutes.ts`](./handlers/sitemapHostRoutes.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/sites.ts`](./handlers/sites.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/staticExport.ts`](./handlers/staticExport.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/templates.ts`](./handlers/templates.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/themes.ts`](./handlers/themes.md)

