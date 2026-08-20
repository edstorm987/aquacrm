# `src/server/websiteInjections.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (8)

- `INJECTION_PROVIDERS: readonly InjectionProvider[]`
- `injectionProvider(kind: string): InjectionProvider | undefined`
- `getSiteConfig(agencyId: string, websiteSourceId: string): WebsiteSiteConfig | null`
- `listInjections(agencyId: string, websiteSourceId: string): AquaInjection[]`
- `addInjection(input: { agencyId: string; websiteSourceId: string; kind: string; value: string; consentCategory?: string; label?: string; }): AquaInjection`
- `updateInjection(input: { agencyId: string; websiteSourceId: string; injectionId: string; enabled?: boolean; consentCategory?: string; value?: string; label?: string; }): AquaInjection | null`
- `removeInjection(agencyId: string, websiteSourceId: string, injectionId: string): boolean`
- `listEnabledInjectionsForHost(agencyId: string, host: string | undefined): AquaInjection[]`

## Depends on (3)

- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)
- [`src/server/websiteSources.ts`](./websiteSources.md)

## Used by (5)

- [`scripts/verify-marketing-runtime.ts`](../../scripts/verify-marketing-runtime.md)
- [`src/app/api/portal/website-injections/route.ts`](../app/api/portal/website-injections/route.md)
- [`src/app/api/public/aqua-tag-config/route.ts`](../app/api/public/aqua-tag-config/route.md)
- [`src/app/portal/dev-team/api/page.tsx`](../app/portal/dev-team/api/page.md)
- [`src/lib/server/marketingIntelligence.ts`](../lib/server/marketingIntelligence.md)

