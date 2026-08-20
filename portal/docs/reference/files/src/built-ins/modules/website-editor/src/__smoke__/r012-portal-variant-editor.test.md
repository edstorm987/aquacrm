# `src/built-ins/modules/website-editor/src/__smoke__/r012-portal-variant-editor.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Smoke — R012 Portal-variant editor.  Asserts: - listAllPortalVariants returns variants across all 4 PortalRoles - sort: roles ordered by PORTAL_ROLES, active-first within role, then updatedAt desc - status string mirrors isActive - HTTP handler shapes (200 with siteId, 400 missing siteId) - setActivePortalVariant flips status across roles correctly

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/built-ins/modules/website-editor/src/api/handlers/pages.ts`](../api/handlers/pages.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/server/pages.ts`](../server/pages.md)
- [`src/built-ins/modules/website-editor/src/server/portalVariants.ts`](../server/portalVariants.md)
- [`src/built-ins/modules/website-editor/src/server/sites.ts`](../server/sites.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

