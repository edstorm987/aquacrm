# `src/built-ins/modules/website-editor/src/lib/sitesAdmin.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (24)

- `interface SiteAdmin (22 members)`
- `DEFAULT_PRIMARY_SITE: SiteAdmin`
- `interface ActivityEntry (4 members)`
- `setActivityLogger(fn: (e: ActivityEntry) => void): void`
- `listSites(): SiteAdmin[]`
- `getSite(id: string): SiteAdmin | undefined`
- `getPrimarySite(): SiteAdmin`
- `getActiveSiteId(adminEmail?: string): string`
- `getActiveSite(adminEmail?: string): SiteAdmin`
- `setActiveSiteId(siteId: string, adminEmail?: string): void`
- `createSite(input: { name: string; slug?: string; domains?: string[]; tagline?: string }): SiteAdmin`
- `updateSite(id: string, patch: Partial<Omit<SiteAdmin, "id" | "createdAt">>): void`
- `deleteSite(id: string): void`
- `setPrimarySite(id: string): void`
- `duplicateSite(id: string): SiteAdmin | null`
- `normaliseDomain(host: string): string`
- `addDomain(siteId: string, domain: string): void`
- `removeDomain(siteId: string, domain: string): void`
- `setPrimaryDomain(siteId: string, domain: string): void`
- `resolveSiteByHost(host: string | undefined | null): SiteAdmin`
- `onSitesChange(handler: () => void): () => void`
- `listSitesForOrg(orgId: string): SiteAdmin[]`
- `createSiteForOrg(orgId: string, input: { name: string; slug?: string; domains?: string[]; tagline?: string }): SiteAdmin`
- `type Site`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/pages/GitStatusPage.tsx`](../pages/GitStatusPage.md)
- [`src/built-ins/modules/website-editor/src/pages/SitesPage.tsx`](../pages/SitesPage.md)

