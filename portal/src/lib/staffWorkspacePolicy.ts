import type { Role } from "@/server/types";

// The one edge-safe statement of what an agency-staff identity may be offered.
// A capability owns both sides: page routes and the API rules they call.
// Tenant, resource and element checks remain authoritative at each leaf;
// matching this policy is necessary for staff, never sufficient.

export const STAFF_WORKSPACE_ROLE = "agency-staff" as const satisfies Role;

export type StaffWorkspaceCapabilityId =
  | "entry"
  | "team"
  | "people"
  | "fulfilment"
  | "portal-studio"
  | "development-projects"
  | "shared-chrome"
  | "account"
  | "access-requests";

export type StaffWorkspacePathMatch = {
  path: string;
  /** Exact avoids silently granting future children with different authority. */
  match: "exact" | "prefix";
};

export interface StaffWorkspaceNavigationItem {
  id: "team" | "people" | "fulfilment" | "account";
  label: string;
  href: string;
  panelId: "main" | "settings";
  order: number;
}

export interface StaffWorkspaceCapabilityPolicy {
  id: StaffWorkspaceCapabilityId;
  pages: readonly StaffWorkspacePathMatch[];
  apiPrefixes: readonly string[];
  /** Exact leaves that must not silently grant future sibling/child APIs. */
  apiExactPaths?: readonly string[];
  /** Registry-search surfaces safe to advertise without resolving an actor. */
  searchablePages?: readonly StaffWorkspacePathMatch[];
  navigation?: StaffWorkspaceNavigationItem;
}

export const STAFF_WORKSPACE_CAPABILITIES: readonly StaffWorkspaceCapabilityPolicy[] = [
  {
    id: "entry",
    pages: [{ path: "/portal", match: "exact" }],
    apiPrefixes: [],
    searchablePages: [{ path: "/portal", match: "exact" }],
  },
  {
    id: "team",
    pages: [{ path: "/portal/team", match: "prefix" }],
    apiPrefixes: [
      "/api/portal/dashboard-planning",
      "/api/portal/tasks",
      "/api/portal/calendar",
      "/api/portal/people",
      "/api/portal/notepad",
      "/api/portal/team-chat",
    ],
    searchablePages: [{ path: "/portal/team", match: "prefix" }],
    navigation: { id: "team", label: "My workspace", href: "/portal/team", panelId: "main", order: 0 },
  },
  {
    id: "people",
    pages: [{ path: "/portal/agency/people", match: "prefix" }],
    apiPrefixes: ["/api/portal/people", "/api/portal/tasks"],
    navigation: { id: "people", label: "Staff", href: "/portal/agency/people", panelId: "main", order: 10 },
  },
  {
    id: "fulfilment",
    pages: [{ path: "/portal/agency/fulfilment", match: "prefix" }],
    apiPrefixes: [
      "/api/portal/pipelines/move-client",
      "/api/portal/products",
      "/api/portal/aqua-tags/detect",
      "/api/portal/website-sources",
      "/api/portal/website-injections",
    ],
    // These three leaves are the Technical toolkit's complete REST surface.
    // Keep them exact: `/api/portal/development/*` must not become a staff
    // grant merely because a future owner-only route is nested there.
    apiExactPaths: [
      "/api/portal/development",
      "/api/portal/development/upload",
      "/api/portal/development/content",
    ],
    navigation: { id: "fulfilment", label: "Fulfilment", href: "/portal/agency/fulfilment", panelId: "main", order: 20 },
  },
  {
    id: "portal-studio",
    // Data Forms crosses into finance/settings authority, so nesting alone
    // does not grant it. The library and studio keep fulfilment.portals gates.
    pages: [
      { path: "/portal/agency/portals", match: "exact" },
      { path: "/portal/agency/portals/editor", match: "exact" },
    ],
    apiPrefixes: ["/api/portal/client-portal-design"],
  },
  {
    id: "development-projects",
    pages: [{ path: "/portal/dev-workspace", match: "prefix" }],
    apiPrefixes: ["/api/portal/dev", "/api/portal/site-editor/files"],
  },
  {
    id: "shared-chrome",
    pages: [],
    apiPrefixes: [
      "/api/portal/chrome",
      "/api/portal/intelligence/my-radar",
      "/api/portal/search",
    ],
  },
  {
    id: "account",
    pages: [{ path: "/portal/account", match: "prefix" }],
    apiPrefixes: ["/api/portal/mfa"],
    searchablePages: [{ path: "/portal/account", match: "prefix" }],
    navigation: { id: "account", label: "My profile", href: "/portal/account", panelId: "settings", order: 0 },
  },
  {
    id: "access-requests",
    pages: [],
    apiPrefixes: ["/api/portal/access"],
  },
] as const;

function matchesPath(path: string, rule: StaffWorkspacePathMatch): boolean {
  return path === rule.path || (rule.match === "prefix" && path.startsWith(`${rule.path}/`));
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export const STAFF_WORKSPACE_PAGE_ROOTS = unique(
  STAFF_WORKSPACE_CAPABILITIES.flatMap(capability => capability.pages.map(rule => rule.path)),
);

/** Compatibility export for the agency proxy/tests; matching semantics live above. */
export const STAFF_DELEGATED_AGENCY_PAGE_ROOTS = STAFF_WORKSPACE_PAGE_ROOTS
  .filter(path => path.startsWith("/portal/agency/"));

export const STAFF_WORKSPACE_API_ROOTS = unique(
  STAFF_WORKSPACE_CAPABILITIES.flatMap(capability => [
    ...capability.apiPrefixes,
    ...(capability.apiExactPaths ?? []),
  ]),
);

export const STAFF_WORKSPACE_NAVIGATION = STAFF_WORKSPACE_CAPABILITIES
  .flatMap(capability => capability.navigation ? [capability.navigation] : []);

export const STAFF_WORKSPACE_API_REFUSAL = "This API is not available in the employee workspace.";

export function staffWorkspaceCapabilitiesForPagePath(path: string): StaffWorkspaceCapabilityId[] {
  return STAFF_WORKSPACE_CAPABILITIES
    .filter(capability => capability.pages.some(rule => matchesPath(path, rule)))
    .map(capability => capability.id);
}

export function staffWorkspaceCapabilitiesForApiPath(path: string): StaffWorkspaceCapabilityId[] {
  return STAFF_WORKSPACE_CAPABILITIES
    .filter(capability =>
      capability.apiPrefixes.some(prefix => matchesPrefix(path, prefix))
      || capability.apiExactPaths?.includes(path),
    )
    .map(capability => capability.id);
}

export function isStaffWorkspacePagePath(path: string): boolean {
  return staffWorkspaceCapabilitiesForPagePath(path).length > 0;
}

export function isStaffDelegatedAgencyPagePath(path: string): boolean {
  return path.startsWith("/portal/agency/") && isStaffWorkspacePagePath(path);
}

export function isStaffWorkspaceApiPath(path: string): boolean {
  return staffWorkspaceCapabilitiesForApiPath(path).length > 0;
}

export function isStaffWorkspaceSearchPagePath(path: string): boolean {
  return STAFF_WORKSPACE_CAPABILITIES.some(capability =>
    capability.searchablePages?.some(rule => matchesPath(path, rule)),
  );
}

/** Leaf API guards use this so staff inclusion follows the proxy policy. */
export function agencyRolesForStaffWorkspaceApiPath(path: string): readonly Role[] {
  return isStaffWorkspaceApiPath(path)
    ? ["agency-owner", "agency-manager", STAFF_WORKSPACE_ROLE]
    : ["agency-owner", "agency-manager"];
}

/** Agency page/layout guards use this so proxy bypass cannot widen pages. */
export function agencyRolesForStaffWorkspacePagePath(path: string): readonly Role[] {
  return isStaffWorkspacePagePath(path)
    ? ["agency-owner", "agency-manager", STAFF_WORKSPACE_ROLE]
    : ["agency-owner", "agency-manager"];
}

export function staffOnlyRolesForWorkspacePagePath(path: string): readonly Role[] {
  return isStaffWorkspacePagePath(path) ? [STAFF_WORKSPACE_ROLE] : [];
}

export function roleMayUseStaffWorkspaceApiPath(role: string, path: string): boolean {
  return role !== STAFF_WORKSPACE_ROLE || isStaffWorkspaceApiPath(path);
}
