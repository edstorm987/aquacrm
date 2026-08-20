# `src/app/portal/agency/[...rest]/_retiredStaffRoute.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** P5 (2026-08-20) — retirement map for the duplicate agency staff directory.  The agency-hr plugin used to ship its own "Staff" surface at `/portal/agency/agency-hr` (and `/portal/agency/agency-hr/staff`) alongside the core one at `/portal/agency/people`. Two directories, both live, both writable: an operator could add someone in one and not find them in the other. Finance had already picked a winner — `financeWorkforce.ts` reads `people.ts` first and demotes agency-hr rows to `legacyStaff` — so the plugin copy was destined to be the stale one. It is retired; these two paths now redirect to the canonical directory.  This lives in its own module (rather than inline in `page.tsx`) so the decision is a pure, importable function: the catch-all page itself drags in `next/link` and client components and cannot be loaded in a plain test process, but this can, so the segment predicate and the query-string preservation are proven by execution rather than by grep.  Deliberately imports nothing — no `next/navigation`, no storage. It decides *whether* and *where* to redirect; `page.tsx` performs the redirect. The one canonical staff directory.

## Exports (3)

- `CANONICAL_STAFF_HREF`
- `withQuery(path: string, searchParams?: Record<string, string | string[] | undefined>): string`
- `retiredStaffRedirect(rest: readonly string[], searchParams?: Record<string, string | string[] | undefined>): string | null`

## Used by (2)

- [`scripts/smoke-nav-audit.test.ts`](../../../../../scripts/smoke-nav-audit.test.md)
- [`src/app/portal/agency/[...rest]/page.tsx`](./page.md)

