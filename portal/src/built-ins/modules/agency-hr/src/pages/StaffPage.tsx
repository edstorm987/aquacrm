// Retired surface. This page used to render a second agency staff directory at
// `/portal/agency/agency-hr` and `/portal/agency/agency-hr/staff`, duplicating
// the core one at `/portal/agency/people`. Finance already treats `people.ts`
// as canonical (agency-hr rows arrive as `legacyStaff`, merged and deduped by
// email), so the plugin copy could only ever drift stale — an operator adding
// someone in one directory could not find them in the other.
//
// P5 (2026-08-20) retires it. The manifest still maps both paths here so old
// bookmarks resolve rather than 404, and this component sends them on to the
// canonical directory. The agency-hr catch-all redirects first in practice;
// this is the second layer, and it is what keeps the behaviour true even if the
// route wiring changes. `ErrorBoundary` deliberately re-throws NEXT_REDIRECT,
// so the redirect is not swallowed by the plugin page wrapper.
//
// Departments / Leave / Employees / Roles / Settings are untouched — they have
// no core equivalent and remain the plugin's reason to exist.

import { redirect } from "next/navigation";
import type { PluginPageProps } from "../lib/aquaPluginTypes";

export const API_BASE = "/api/portal/agency-hr";

// The one canonical staff directory.
export const CANONICAL_STAFF_HREF = "/portal/agency/people";

// Preserve the query string across the redirect — dropping `?dept=…&status=…`
// would silently discard whatever the operator was filtering by.
export function canonicalStaffHref(
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const entry of value) query.append(key, entry);
    else query.append(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${CANONICAL_STAFF_HREF}?${suffix}` : CANONICAL_STAFF_HREF;
}

// `redirect()` returns `never`; returning it keeps this a valid plugin page
// component (a component may not resolve to `void`).
export default async function StaffPage(props: PluginPageProps) {
  return redirect(canonicalStaffHref(props.searchParams));
}
