# `src/built-ins/modules/website-editor/src/types/site.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Site — a tenant's website. In 02 keyed by `siteId` only; in 04 every Site row carries `agencyId + clientId` so queries scope through the foundation's `requireRole()` session.  Field set mirrors 02's `src/lib/admin/sites.ts` Site interface so the lifted editor admin pages compile without bespoke patches.

## Exports (4)

- `interface SiteSocialHandles (3 members)`
- `interface Site (27 members)`
- `interface CreateSiteInput (7 members)`
- `interface UpdateSitePatch (21 members)`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (7)

- [`src/built-ins/modules/website-editor/src/__smoke__/r045-jsonld-injection.test.ts`](../__smoke__/r045-jsonld-injection.test.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteHead.tsx`](../components/storefront/SiteHead.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteResolver.tsx`](../components/storefront/SiteResolver.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteUX.tsx`](../components/storefront/SiteUX.md)
- [`src/built-ins/modules/website-editor/src/lib/jsonLdInjection.ts`](../lib/jsonLdInjection.md)
- [`src/built-ins/modules/website-editor/src/lib/sites.ts`](../lib/sites.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../server/sites.md)

