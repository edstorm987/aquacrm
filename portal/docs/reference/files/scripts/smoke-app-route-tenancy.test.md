# `scripts/smoke-app-route-tenancy.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** THE ROUTES NO SURFACE RULE REACHES.  Two guards now cover the plugin system: `_pageScope` gates plugin PAGES and plugin API ROUTES by surface, and `apiTenantScope` decides whose tenant a plugin API call lands in. Neither touches:  • the 133 concrete route handlers under `src/app/api/portal/` that are NOT the plugin dispatcher. They have no manifest, no surface, no class-level rule — each one is on its own; • the app-route PAGES under `src/app/portal/` that render plugin content server-side, where the app route's gate and the plugin manifest's gate are two separate declarations that can disagree. On 22 Aug 2026 one did: `/portal/agency/marketing` gated on `requireRole([...AGENCY_ROLES])` and rendered leads-pipeline's `CampaignsWorkspace`, while the plugin page `campaigns` declares owner/manager-only — so `agency-staff` read every campaign by URL through a surface the plugin had closed, and could not read the same data through the API that backs it.  ARM 1  The enumeration. Every non-plugin portal route, what it reads its tenant from, and which ones have no Aqua session at all. ARM 2  `phases/apply` — the one cross-tenant WRITE this sweep found, driven. ARM 3  Marketing vs the campaigns manifest, driven for every agency role.

_No exported symbols (side-effect / internal module)._

## Depends on (10)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/built-ins/runtime/_pageScope.ts`](../src/built-ins/runtime/_pageScope.md)
- [`src/built-ins/runtime/_registry.ts`](../src/built-ins/runtime/_registry.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/phaseApplier.ts`](../src/server/phaseApplier.md)
- [`src/server/phases.ts`](../src/server/phases.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

