# `src/built-ins/modules/agency-hr/src/pages/StaffPage.tsx`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Retired surface. This page used to render a second agency staff directory at `/portal/agency/agency-hr` and `/portal/agency/agency-hr/staff`, duplicating the core one at `/portal/agency/people`. Finance already treats `people.ts` as canonical (agency-hr rows arrive as `legacyStaff`, merged and deduped by email), so the plugin copy could only ever drift stale — an operator adding someone in one directory could not find them in the other.  P5 (2026-08-20) retires it. The manifest still maps both paths here so old bookmarks resolve rather than 404, and this component sends them on to the canonical directory. The agency-hr catch-all redirects first in practice; this is the second layer, and it is what keeps the behaviour true even if the route wiring changes. `ErrorBoundary` deliberately re-throws NEXT_REDIRECT, so the redirect is not swallowed by the plugin page wrapper.  Departments / Leave / Employees / Roles / Settings are untouched — they have no core equivalent and remain the plugin's reason to exist.

## Exports (4)

- `API_BASE`
- `CANONICAL_STAFF_HREF`
- `canonicalStaffHref(searchParams?: Record<string, string | string[] | undefined>): string`
- `default async StaffPage(props: PluginPageProps)`

## Depends on (1)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

