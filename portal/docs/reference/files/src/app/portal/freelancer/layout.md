# `src/app/portal/freelancer/layout.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Freelancer workspace layout — a self-contained, deliberately-narrow shell (like the customer portal has its own), NOT the agency Topbar/Sidebar. A freelancer only ever sees their own assigned jobs. Colours use the theme tokens (--mm-*) so it adapts to light + dark without a Tailwind darkMode.

## Exports (1)

- `default async FreelancerLayout({ children }: { children: ReactNode })`

## Depends on (8)

- [`src/app/portal/freelancer/_ExitPreview.tsx`](./_ExitPreview.md)
- [`src/components/chrome/PortalRouteCanvas.tsx`](../../../components/chrome/PortalRouteCanvas.md)
- [`src/components/chrome/ThemeInjector.tsx`](../../../components/chrome/ThemeInjector.md)
- [`src/components/ui/ErrorBoundary.tsx`](../../../components/ui/ErrorBoundary.md)
- [`src/lib/server/auth/auth.ts`](../../../lib/server/auth/auth.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/users.ts`](../../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

