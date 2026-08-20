# `src/built-ins/modules/website-editor/src/api/routes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** `PluginApiRoute[]` exposed by the website-editor plugin manifest.  All routes mount under `/api/portal/website-editor/<path>` (foundation catchall). Tenant comes from the session via `requireRole()`; siteId comes from query/body and is validated against clientId in the handler scope check.

## Exports (1)

- `apiRoutes: PluginApiRoute[]`

## Depends on (22)

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
- [`src/built-ins/modules/website-editor/src/api/handlers/templates.ts`](./handlers/templates.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/themes.ts`](./handlers/themes.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/index.ts`](../../index.md)

