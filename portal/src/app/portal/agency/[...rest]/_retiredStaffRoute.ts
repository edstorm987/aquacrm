// P5 (2026-08-20) — retirement map for the duplicate agency staff directory.
//
// The agency-hr plugin used to ship its own "Staff" surface at
// `/portal/agency/agency-hr` (and `/portal/agency/agency-hr/staff`) alongside
// the core one at `/portal/agency/people`. Two directories, both live, both
// writable: an operator could add someone in one and not find them in the
// other. Finance had already picked a winner — `financeWorkforce.ts` reads
// `people.ts` first and demotes agency-hr rows to `legacyStaff` — so the plugin
// copy was destined to be the stale one. It is retired; these two paths now
// redirect to the canonical directory.
//
// This lives in its own module (rather than inline in `page.tsx`) so the
// decision is a pure, importable function: the catch-all page itself drags in
// `next/link` and client components and cannot be loaded in a plain test
// process, but this can, so the segment predicate and the query-string
// preservation are proven by execution rather than by grep.
//
// Deliberately imports nothing — no `next/navigation`, no storage. It decides
// *whether* and *where* to redirect; `page.tsx` performs the redirect.

// The one canonical staff directory.
export const CANONICAL_STAFF_HREF = "/portal/agency/people";

// Re-attach an incoming query string to a redirect destination. A redirect that
// drops `?dept=…&status=…` silently throws away whatever the operator was
// filtering by, so every retirement redirect goes through here. Repeated keys
// (`?status=a&status=b`) arrive as arrays and are re-emitted as repeats.
export function withQuery(
  path: string,
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const entry of value) query.append(key, entry);
    else query.append(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

// Given the catch-all's `rest` segments, return the destination the request
// should be redirected to, or `null` to let normal plugin resolution proceed.
//
// Only the two retired paths match. Departments / Leave / Employees / Roles /
// Settings — the pages that have no core equivalent and are the plugin's reason
// to exist — fall through untouched, as does every other plugin.
export function retiredStaffRedirect(
  rest: readonly string[],
  searchParams?: Record<string, string | string[] | undefined>,
): string | null {
  if (rest[0] !== "agency-hr") return null;
  const isRetired = rest.length === 1 || (rest.length === 2 && rest[1] === "staff");
  if (!isRetired) return null;
  return withQuery(CANONICAL_STAFF_HREF, searchParams);
}
