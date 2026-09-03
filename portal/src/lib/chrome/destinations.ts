// Every place in the portal a person can land.
//
// Ed, 2026-08-29: *"a lot of things are everywhere in different places and it's
// kinda hard, and a lot of things don't have UI or are buried."*
//
// ── The problem this fixes ────────────────────────────────────────────────
//
// Workspace search was built from the SIDEBAR: `panels.flatMap(...)` in
// `Topbar`. The sidebar holds 55 entries; the app has 76 static portal routes
// and 93 plugin pages. So the two systems that should have covered each other's
// gaps had the SAME gap — a page missing from the nav was also missing from
// search, and the only way to reach it was to already know its URL.
//
// This registry is the app's own list of destinations, independent of how the
// nav happens to be arranged. Search reads it; the nav does not have to grow.
//
// ── Why a checked-in list rather than a filesystem walk ───────────────────
//
// Walking `src/app` at request time works locally and is fragile once bundled.
// A list in the repo is boring, fast, and — crucially — reviewable: a person
// adding a page sees the label somebody will search for, and picks a good one.
//
// `smoke-portal-destinations.test.ts` walks the route tree and fails when this
// list drifts, so "boring and checked in" cannot become "quietly out of date".
//
// ── Labels are for SEARCHING, not for breadcrumbs ─────────────────────────
//
// The label is what somebody types when they are looking for the thing. Where
// the derived name is ambiguous on its own — two "Contacts", five "Website" —
// the parent is carried in brackets, because a search result that cannot be
// told apart from another search result is not a result.

import { isStaffWorkspaceSearchPagePath } from "@/lib/staffWorkspacePolicy";

export interface PortalDestination {
  href: string;
  label: string;
  /** The workspace it belongs to, shown beside the label in results. */
  area: string;
}

export const PORTAL_DESTINATIONS: readonly PortalDestination[] = [
  { href: "/portal", label: "Portal", area: "Portal" },
  { href: "/portal/account", label: "Account", area: "Account" },
  { href: "/portal/account/permissions", label: "Permissions", area: "Account" },
  { href: "/portal/account/preferences", label: "Preferences", area: "Account" },
  { href: "/portal/agency", label: "Agency", area: "Agency" },
  { href: "/portal/agency/actions", label: "Actions", area: "Agency" },
  { href: "/portal/agency/activity-inbox", label: "Activity inbox", area: "Agency" },
  { href: "/portal/agency/assistant", label: "Assistant", area: "Agency" },
  { href: "/portal/agency/automations", label: "Automations", area: "Agency" },
  { href: "/portal/agency/calendar", label: "Calendar", area: "Agency" },
  { href: "/portal/agency/command-center", label: "Command center", area: "Agency" },
  { href: "/portal/agency/company", label: "Company", area: "Agency" },
  { href: "/portal/agency/contacts", label: "Contacts", area: "Agency" },
  { href: "/portal/agency/dev-docs", label: "Dev docs", area: "Agency" },
  { href: "/portal/agency/development", label: "Development", area: "Agency" },
  { href: "/portal/agency/development/code", label: "Code (Development)", area: "Agency" },
  { href: "/portal/agency/development/performance", label: "Performance (Development)", area: "Agency" },
  { href: "/portal/agency/development/toolkit", label: "Toolkit (Development)", area: "Agency" },
  { href: "/portal/agency/development/vault", label: "Vault (Development)", area: "Agency" },
  { href: "/portal/agency/development/website", label: "Website (Development)", area: "Agency" },
  { href: "/portal/agency/development/workflow", label: "Workflow (Development)", area: "Agency" },
  { href: "/portal/agency/freelancer-access", label: "Freelancer access", area: "Agency" },
  { href: "/portal/agency/freelancers", label: "Freelancers", area: "Agency" },
  { href: "/portal/agency/fulfilment", label: "Fulfilment", area: "Agency" },
  { href: "/portal/agency/fulfilment/technical/performance", label: "Performance (Fulfilment · Technical)", area: "Agency" },
  { href: "/portal/agency/fulfilment/technical/toolkit", label: "Toolkit (Fulfilment · Technical)", area: "Agency" },
  { href: "/portal/agency/fulfilment/technical/vault", label: "Vault (Fulfilment · Technical)", area: "Agency" },
  { href: "/portal/agency/fulfilment/technical/website", label: "Website (Fulfilment · Technical)", area: "Agency" },
  { href: "/portal/agency/fulfilment/technical/workflow", label: "Workflow (Fulfilment · Technical)", area: "Agency" },
  { href: "/portal/agency/governance", label: "Governance", area: "Agency" },
  { href: "/portal/agency/inbox", label: "Inbox", area: "Agency" },
  { href: "/portal/agency/marketing", label: "Marketing", area: "Agency" },
  { href: "/portal/agency/my-radar", label: "My radar", area: "Agency" },
  { href: "/portal/agency/notepad", label: "Notepad", area: "Agency" },
  { href: "/portal/agency/operations", label: "Operations", area: "Agency" },
  { href: "/portal/agency/people", label: "People", area: "Agency" },
  { href: "/portal/agency/performance", label: "Performance", area: "Agency" },
  { href: "/portal/agency/phases", label: "Phases", area: "Agency" },
  { href: "/portal/agency/portals", label: "Portals", area: "Agency" },
  { href: "/portal/agency/portals/editor", label: "Editor (Portals)", area: "Agency" },
  { href: "/portal/agency/portals/forms", label: "Forms (Portals)", area: "Agency" },
  { href: "/portal/agency/products", label: "Products", area: "Agency" },
  { href: "/portal/agency/radar", label: "Radar", area: "Agency" },
  { href: "/portal/agency/radar/workload", label: "Department workload (Business Radar)", area: "Agency" },
  { href: "/portal/agency/settings", label: "Settings", area: "Agency" },
  { href: "/portal/agency/sop-library", label: "Sop library", area: "Agency" },
  { href: "/portal/agency/sops", label: "Sops", area: "Agency" },
  { href: "/portal/agency/tools", label: "Tools", area: "Agency" },
  { href: "/portal/agency/you-deserve-it", label: "You deserve it", area: "Agency" },
  { href: "/portal/clients", label: "Clients", area: "Clients" },
  { href: "/portal/customer", label: "Customer", area: "Customer" },
  { href: "/portal/customer/account", label: "Account", area: "Customer" },
  { href: "/portal/customer/affiliate", label: "Affiliate", area: "Customer" },
  { href: "/portal/customer/bookings", label: "Bookings", area: "Customer" },
  { href: "/portal/customer/membership", label: "Membership", area: "Customer" },
  { href: "/portal/customer/orders", label: "Orders", area: "Customer" },
  { href: "/portal/dev-team", label: "Dev Team", area: "Dev Team" },
  { href: "/portal/dev-team/api", label: "Api", area: "Dev Team" },
  { href: "/portal/dev-team/auditor", label: "Auditor", area: "Dev Team" },
  { href: "/portal/dev-team/chat", label: "Chat", area: "Dev Team" },
  { href: "/portal/dev-team/docs", label: "Docs", area: "Dev Team" },
  { href: "/portal/dev-team/editor", label: "Editor", area: "Dev Team" },
  { href: "/portal/dev-team/editor/studio", label: "Studio (Editor)", area: "Dev Team" },
  { href: "/portal/dev-team/findings", label: "Findings", area: "Dev Team" },
  { href: "/portal/dev-team/inspector", label: "Inspector", area: "Dev Team" },
  { href: "/portal/dev-team/library", label: "Library", area: "Dev Team" },
  { href: "/portal/dev-team/logs", label: "Logs", area: "Dev Team" },
  { href: "/portal/dev-team/notes", label: "Notes", area: "Dev Team" },
  { href: "/portal/dev-team/plans/new", label: "New (Plans)", area: "Dev Team" },
  { href: "/portal/dev-team/roadmap", label: "Roadmap", area: "Dev Team" },
  { href: "/portal/dev-team/tasks", label: "Tasks", area: "Dev Team" },
  { href: "/portal/dev-team/tools", label: "Tools", area: "Dev Team" },
  { href: "/portal/dev-team/updates", label: "Updates", area: "Dev Team" },
  { href: "/portal/dev-team/working", label: "Working", area: "Dev Team" },
  { href: "/portal/dev-workspace", label: "Dev", area: "Dev" },
  { href: "/portal/freelancer", label: "Freelancer", area: "Freelancer" },
  { href: "/portal/team", label: "Team", area: "Team" },
];

/** Destinations this person could plausibly reach, as search rows. */
/**
 * The destinations THIS role may be told exist.
 *
 * Ed's finding (2026-08-30): *"global search indexes every portal destination
 * without role/capability"* — the Topbar merged this whole registry into quick
 * search for every viewer, so a delegated staff member or freelancer was shown
 * owner surfaces and Dev Team pages. Clicking them 403s, but half the results
 * being doors that refuse you is both a leak (the map of what exists) and the
 * worst kind of search.
 *
 * Deny-by-default: an area not named here is not offered. The sidebar half of
 * search is already role-filtered upstream; this brings the registry half to
 * the same standard.
 */
export function destinationSearchItemsFor(
  role: string,
  devTeamVisible: boolean,
): { label: string; href: string }[] {
  if (role === "agency-staff") {
    return PORTAL_DESTINATIONS
      .filter(destination => isStaffWorkspaceSearchPagePath(destination.href))
      .map(destination => ({
        label: `${destination.label} · ${destination.area}`,
        href: destination.href,
      }));
  }
  const areas = new Set<string>(["Portal", "Account"]);
  if (role === "agency-owner" || role === "agency-manager") {
    areas.add("Agency"); areas.add("Clients"); areas.add("Team");
    if (devTeamVisible) { areas.add("Dev Team"); areas.add("Dev"); }
  } else if (role === "freelancer") {
    areas.add("Freelancer");
  }
  // "Customer" is deliberately in nobody's set here: those are the client's
  // customers' surfaces, reached through the customer portal's own chrome.
  return PORTAL_DESTINATIONS
    .filter(destination => areas.has(destination.area))
    .map(destination => ({
      label: `${destination.label} · ${destination.area}`,
      href: destination.href,
    }));
}

export function destinationSearchItems(): { label: string; href: string }[] {
  return PORTAL_DESTINATIONS.map(destination => ({
    // The area travels with the label so two same-named pages are tellable
    // apart in a flat result list.
    label: `${destination.label} · ${destination.area}`,
    href: destination.href,
  }));
}
