// WHICH HOST MAY RENDER THIS PAGE, AND WHO MAY SEE IT THERE.
//
// The question this file exists to answer is not "what roles did the manifest
// declare?" — it is "which HOSTS can reach this page, and what is each host's
// own gate?". Those are different questions, and on 22 August 2026 only the
// first one was being asked. The result:
//
//   end-customer  /portal/clients/<id>/agency-hr/staff        → RENDERED
//   end-customer  /portal/clients/<id>/agency-marketing/leads → RENDERED
//   end-customer  /portal/customer/memberships/subscribers    → RENDERED
//
// Three hosts resolve plugin pages, and each one has a DIFFERENT gate:
//
//   /portal/agency/[...rest]            requireRole(AGENCY_ROLES)
//   /portal/clients/[clientId]/[...rest] requireRoleForClient(ALL_ROLES, id)
//   /portal/customer/[...rest]          requireRole("end-customer")
//
// The client host's gate is every role in the product. The pages it could
// reach included every agency-scoped plugin page, because `pickInstall` falls
// back to the agency-scoped install and `pluginPageAllowedRoles` was
// `undefined` for 69 of 90 registered pages. A page that declares nothing was
// treated as "everyone this host admits" — and this host admits everyone.
//
// So the gate cannot be built out of manifest declarations. 90 manifests being
// right is not a mechanism; it is a hope, and it rots the moment someone adds
// the 91st page. Two structural rules do the work instead, and a manifest can
// only ever NARROW what they allow:
//
//   1. SURFACE COMPATIBILITY. A page belongs to one or more surfaces, derived
//      from the manifest's SHAPE (its path convention and the plugin's install
//      scope policy) rather than from an access-control field an author has to
//      remember. A host only resolves pages that belong to its own surface.
//      An agency-scoped page under the client host is a category error, and it
//      is refused whether or not roles were declared.
//
//   2. A SURFACE ROLE CEILING. Each surface has a maximum audience that no
//      manifest can widen. `/portal/clients/…` is the client WORKSPACE — the
//      agency's people plus the client's own team. End-customers have their
//      own host at `/portal/customer`; leads have neither. So the ceiling
//      there is AGENCY_ROLES ∪ CLIENT_ROLES, and an undeclared page inherits
//      the ceiling instead of inheriting the host's much wider door.
//
// Declared roles are still honoured — they narrow the ceiling further, which
// is how the agency host tells `agency-staff` apart from `agency-owner`. They
// are the second layer, not the only one.

import { AGENCY_ROLES, ALL_ROLES, CLIENT_ROLES, type Role } from "@/server/types";
import {
  pluginApiRouteAllowedRoles,
  pluginPageAllowedRoles,
  type AquaPlugin,
  type PluginApiRoute,
  type PluginPage,
} from "./_types";

// ─── Surfaces ─────────────────────────────────────────────────────────────

/** The three host route families that resolve plugin pages. */
export type HostSurface = "agency" | "client" | "customer";

export const HOST_SURFACES: readonly HostSurface[] = ["agency", "client", "customer"] as const;

/** The URL prefix each host is mounted at — used by tests and by the
 *  reachability report to name a surface without hard-coding strings twice. */
export const SURFACE_URL_PREFIX: Record<HostSurface, string> = {
  agency: "/portal/agency",
  client: "/portal/clients/[clientId]",
  customer: "/portal/customer",
};

/**
 * The widest audience a surface may EVER expose. A manifest can narrow this;
 * nothing can widen it.
 *
 * `client` deliberately stops at the client workspace's own people. The host
 * route's gate is `requireRoleForClient([...ALL_ROLES], clientId)`, which also
 * admits `end-customer` (scoped to that client) and `lead`. That gate is about
 * TENANCY — "are you attached to this client?" — and was never an answer to
 * "does this surface belong to you". An end-customer is a shopper of the
 * client's storefront: `/portal/customer` is their surface, and no plugin page
 * on the client workspace declares them.
 */
export const SURFACE_ROLE_CEILING: Record<HostSurface, readonly Role[]> = {
  agency: AGENCY_ROLES,
  client: [...AGENCY_ROLES, ...CLIENT_ROLES],
  customer: ["end-customer"],
};

// ─── Which surface(s) does a page belong to? ──────────────────────────────

function isFullUrlPath(path: string): boolean {
  return path.startsWith("/");
}

/**
 * The surface a fully-qualified manifest path names, read off the URL itself.
 * `/portal/clients/[clientId]/editor` → "client". Anything that isn't one of
 * the three host families → null (unreachable through these hosts at all).
 */
export function surfaceOfFullUrlPath(path: string): HostSurface | null {
  const segs = path.split("/").filter(Boolean);
  if (segs[0] !== "portal") return null;
  if (segs[1] === "agency") return "agency";
  if (segs[1] === "clients") return "client";
  if (segs[1] === "customer") return "customer";
  return null;
}

/**
 * Every surface this page may render on, from the manifest's shape alone.
 *
 * A fully-qualified path names its surface outright. A RELATIVE path hangs off
 * the plugin's mount point, so the plugin's install scope policy settles it:
 * an `"agency"`-scoped plugin's pages are agency-workspace pages, a
 * `"client"`-scoped plugin's pages are client-workspace pages, and `"either"`
 * genuinely means both.
 *
 * A relative path is NEVER a customer-surface page. The end-customer surface
 * is an entirely different audience from the workspace that administers it —
 * `memberships`' relative `subscribers` page is the operator's subscriber
 * LIST, not a shopper's membership card — so opting into `/portal/customer`
 * has to be an explicit, fully-qualified declaration. It cannot be something a
 * plugin backs into by having an install scope.
 */
export function pageSurfaces(plugin: AquaPlugin, page: PluginPage): HostSurface[] {
  if (isFullUrlPath(page.path)) {
    const surface = surfaceOfFullUrlPath(page.path);
    return surface ? [surface] : [];
  }
  return scopePolicySurfaces(plugin);
}

/**
 * The surfaces a plugin's INSTALL SCOPE puts it on.
 *
 * The switch is exhaustive on purpose, and the unrecognised case denies rather
 * than allowing. It used to end in `default: return ["agency", "client"]`,
 * which meant a `scopePolicy` this file does not understand — a typo, or a
 * member added to `PluginScopePolicy` without updating this switch (the
 * public-funnel manifest already anticipates a `"global"`) — silently resolved
 * to the WIDEST surface set. That is the one default-allow in a file whose
 * whole argument is default-deny. `_validate.ts` rejects an unknown policy at
 * boot so a registered plugin can never reach the last branch; the `never`
 * assertion makes tsc, not a shopper's browser, the thing that notices when
 * the union grows.
 *
 * An ABSENT policy still means "either", because `_runtime.ts` reads the same
 * absence as "installable at either scope" — if the two disagreed a plugin
 * would install somewhere its pages then refuse to render. That default is
 * safe on its own terms: the SURFACE ROLE CEILING below still caps who may see
 * the page at each surface.
 */
export function scopePolicySurfaces(plugin: AquaPlugin): HostSurface[] {
  const policy = plugin.scopePolicy;
  switch (policy) {
    case "agency": return ["agency"];
    case "client": return ["client"];
    case "either": return ["agency", "client"];
    case undefined: return ["agency", "client"];
    default: {
      const unreachable: never = policy;
      void unreachable;
      return [];
    }
  }
}

/** Rule 1: may this host resolve this page at all? */
export function pageResolvesAt(plugin: AquaPlugin, page: PluginPage, host: HostSurface): boolean {
  return pageSurfaces(plugin, page).includes(host);
}

// ─── The effective gate ───────────────────────────────────────────────────

/**
 * Exactly who can render this page at this host. `[]` means unreachable —
 * either the host is the wrong surface for it, or every role the manifest
 * named is above the ceiling.
 *
 * This is the whole gate. Host routes call `pageAllowsRoleAt` rather than
 * re-deriving it, so there is one answer and one place to change it.
 */
export function effectivePageRoles(plugin: AquaPlugin, page: PluginPage, host: HostSurface): Role[] {
  if (!pageResolvesAt(plugin, page, host)) return [];
  const ceiling = SURFACE_ROLE_CEILING[host];
  const declared = pluginPageAllowedRoles(page);
  // Intersect, never union: a manifest naming a role the surface does not
  // serve does not thereby serve it.
  return declared ? ceiling.filter(role => declared.includes(role)) : [...ceiling];
}

/** The single call a host route makes after resolving a URL to a page. */
export function pageAllowsRoleAt(
  plugin: AquaPlugin,
  page: PluginPage,
  host: HostSurface,
  role: Role,
): boolean {
  return effectivePageRoles(plugin, page, host).includes(role);
}

// ══════════════════════════════════════════════════════════════════════════
// THE SAME QUESTION FOR THE API THAT BACKS THOSE PAGES
// ══════════════════════════════════════════════════════════════════════════
//
// Everything above closes the READ door. On 22 August 2026 the door behind it
// was still open: `/api/portal/[module]/[...rest]` had no surface rule at all.
// Its only gate was `route.visibleToRoles ?? route.roles` plus a client-id
// tenancy check — and `undefined` there meant "anyone with a session", exactly
// the fallback the page layer had just stopped trusting. **133 of the 312
// registered plugin API routes declared no roles.** A closed page whose API
// still answers is not closed, so the same two rules apply here, adapted to
// the one structural difference: pages are mounted at a host that names their
// surface, and API routes are all mounted at one URL family that names none.
//
//   1. SURFACE. A route's surfaces are its PLUGIN's surfaces —
//      `scopePolicy` (where the plugin can be installed) widened by any
//      fully-qualified page path (which is the only way a plugin reaches
//      `/portal/customer` at all). memberships therefore serves the client
//      workspace AND the shopper, so its `me/*` routes keep the shopper; but
//      agency-hr serves only the agency, so nothing it exposes can answer a
//      client role, declared or not.
//
//   2. THE PAGE IT BACKS IS ITS CEILING. Where a route's path hangs off a
//      page's path (`expenses/approve` under `expenses`, `/pages/versions`
//      under `/portal/clients/[clientId]/pages`), that page's effective gate
//      IS the route's ceiling on the surfaces the page serves. This is the
//      rule "a route must never be wider than the page it backs", enforced by
//      construction over all 312 routes rather than asserted for five named
//      ones. Where no page backs the route, the surface ceiling applies —
//      the same fallback the page layer uses.
//
// Undeclared inherits that ceiling. Declared INTERSECTS it. A manifest can
// still only narrow.

/**
 * Every surface this plugin's API could serve — the widest set any of its
 * routes may draw from.
 *
 * The install scope is the floor; a fully-qualified page path can add a
 * surface the scope policy does not imply. That second half is load-bearing:
 * memberships / affiliates / client-crm are `scopePolicy: "client"` but each
 * declares a `/portal/customer/…` page, and that page is the only reason the
 * shopper can be served at all. A plugin with no such page has no shopper
 * surface, and no declaration on a route can invent one.
 */
export function pluginApiSurfaces(plugin: AquaPlugin): HostSurface[] {
  const reached = new Set<HostSurface>(scopePolicySurfaces(plugin));
  for (const page of plugin.pages) {
    if (!isFullUrlPath(page.path)) continue;
    const surface = surfaceOfFullUrlPath(page.path);
    if (surface) reached.add(surface);
  }
  return HOST_SURFACES.filter(surface => reached.has(surface));
}

/**
 * The surfaces THIS route serves.
 *
 * The workspace surfaces come free with the install scope. The shopper surface
 * does not: a route only reaches `/portal/customer`'s audience if the plugin
 * owns a shopper page AND the route NAMES `end-customer`.
 *
 * That second condition is the API's version of the page rule "a relative path
 * is never a customer-surface page — opting into `/portal/customer` has to be
 * an explicit declaration, not something a plugin backs into by having an
 * install scope". A page path can say which surface it is for; a route path
 * cannot, so the declaration is the only place it can be said. Without this,
 * `memberships`' next undeclared route — added by an author who never thought
 * about shoppers — would be shopper-readable purely because a sibling page
 * exists at `/portal/customer/memberships`. The synthetic manifest in
 * `smoke-plugin-api-host-gates` is exactly that route, and it caught this.
 */
export function apiRouteSurfaces(plugin: AquaPlugin, route: PluginApiRoute): HostSurface[] {
  const declared = pluginApiRouteAllowedRoles(route);
  const namesShopper = declared?.includes("end-customer") === true;
  return pluginApiSurfaces(plugin).filter(surface => surface !== "customer" || namesShopper);
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function isParamSegment(segment: string): boolean {
  return segment.startsWith(":") || (segment.startsWith("[") && segment.endsWith("]"));
}

/**
 * A page's path expressed the way a route path is written — the segments
 * BELOW the plugin's mount point, so the two can be compared.
 *
 * A relative page path already is that. A fully-qualified one has its host
 * prefix stripped (`/portal/clients/[clientId]/pages` → `["pages"]`), which is
 * what pairs website-editor's `/pages/versions` route with the Pages page.
 */
function pageMountPath(page: PluginPage): string[] | null {
  if (!isFullUrlPath(page.path)) return splitPath(page.path);
  const segs = splitPath(page.path);
  if (segs[0] !== "portal") return null;
  if (segs[1] === "clients") return segs.slice(3);
  if (segs[1] === "agency" || segs[1] === "customer") return segs.slice(2);
  return null;
}

/**
 * The page a route backs, or null.
 *
 * The longest page path that is a literal segment-prefix of the route path
 * wins. Two deliberate exclusions:
 *
 *   • A page path containing a parameter segment is never a backing page.
 *     `orders/:id` would otherwise "match" `orders/status` by treating a
 *     status word as an id, pairing a route with a page that has nothing to
 *     do with it. A wrong pairing is worse than none: it would let an
 *     unrelated page's gate stand in for a real one.
 *   • The plugin's index page (`""`) is a prefix of every route. It is the
 *     plugin's front door, not "the page this route backs", and letting it
 *     pair with everything would make one manifest line the gate for an
 *     entire API surface.
 *
 * Both exclusions fall back to the surface ceiling, which is the safe answer.
 */
export function apiRouteBackingPage(plugin: AquaPlugin, route: PluginApiRoute): PluginPage | null {
  const routeSegs = splitPath(route.path);
  let best: PluginPage | null = null;
  let bestLength = 0;
  for (const page of plugin.pages) {
    const mount = pageMountPath(page);
    if (!mount || mount.length === 0 || mount.some(isParamSegment)) continue;
    if (mount.length > routeSegs.length) continue;
    if (mount.some((segment, i) => segment !== routeSegs[i])) continue;
    if (mount.length > bestLength) {
      best = page;
      bestLength = mount.length;
    }
  }
  return best;
}

/**
 * The widest audience this route may ever answer, before its own declaration
 * narrows it. Per surface: the backing page's gate where that page lives on
 * the surface, the surface's own ceiling otherwise.
 *
 * Splitting it per surface is what stops the "never wider than its page" rule
 * from eating legitimate access. memberships' `plans` GET backs the operator's
 * Plans page (client workspace) AND serves the shopper. Comparing the route
 * against the page as a single blob would strip `end-customer`, because the
 * operator's page has no business admitting one. Asked surface by surface, the
 * client surface answers with the Plans page's gate and the customer surface —
 * where that page does not live — answers with its own ceiling, so the shopper
 * survives and the operator's page still caps the workspace side.
 */
export function apiRoleCeiling(plugin: AquaPlugin, route: PluginApiRoute): Role[] {
  const backing = apiRouteBackingPage(plugin, route);
  const allowed = new Set<Role>();
  for (const surface of apiRouteSurfaces(plugin, route)) {
    const roles = backing && pageResolvesAt(plugin, backing, surface)
      ? effectivePageRoles(plugin, backing, surface)
      : SURFACE_ROLE_CEILING[surface];
    for (const role of roles) allowed.add(role);
  }
  return ALL_ROLES.filter(role => allowed.has(role));
}

/**
 * Exactly who this route may answer. `[]` means nobody with a session.
 *
 * `public: true` routes are outside the role system entirely — they are the
 * ones that land as an anonymous visitor (Stripe webhooks, the HC submit) and
 * carry their own auth (HMAC, capture handoff) inside the handler. The
 * dispatcher never had a session to gate them with; saying so here keeps the
 * whole answer in one function instead of splitting it across two files.
 */
export function effectiveApiRoles(plugin: AquaPlugin, route: PluginApiRoute): Role[] {
  if (route.public === true) return [...ALL_ROLES];
  const ceiling = apiRoleCeiling(plugin, route);
  const declared = pluginApiRouteAllowedRoles(route);
  return declared ? ceiling.filter(role => declared.includes(role)) : ceiling;
}

/** The single call the API dispatcher makes after resolving a URL to a route. */
export function apiRouteAllowsRole(plugin: AquaPlugin, route: PluginApiRoute, role: Role): boolean {
  return effectiveApiRoles(plugin, route).includes(role);
}
