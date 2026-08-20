# `src/components/chrome/ThemeInjector.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** ThemeInjector — emits a <style>:root{--brand-…}</style> at the top of the per-tenant layout. Server component (no client JS shipped).  Also runs a dev-time WCAG contrast check on the tenant's brand kit. When a pair fails AA we log a warning to the server console — visible to the operator running `npm run dev` and to Vercel build/runtime logs in production. Does not block render — bad contrast is a quality issue, not a hard error.

## Exports (1)

- `ThemeInjector({ brand, scope }: Props)`

## Depends on (3)

- [`src/lib/a11y/contrastValidator.ts`](../../lib/a11y/contrastValidator.md)
- [`src/lib/chrome/brandKit.ts`](../../lib/chrome/brandKit.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (8)

- [`src/app/client-preview/[clientId]/page.tsx`](../../app/client-preview/[clientId]/page.md)
- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/app/portal/customer/layout.tsx`](../../app/portal/customer/layout.md)
- [`src/app/portal/dev-team/layout.tsx`](../../app/portal/dev-team/layout.md)
- [`src/app/portal/freelancer/layout.tsx`](../../app/portal/freelancer/layout.md)
- [`src/app/portal/team/layout.tsx`](../../app/portal/team/layout.md)

