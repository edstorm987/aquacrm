import "server-only";
// Resolve a portal URL to the plugin page that should render it.
//
// Two manifest path conventions are supported, side-by-side:
//
//   1. **Relative path** (T2's fulfillment, ecommerce):
//        `""`, `"clients"`, `":clientId"`, `"orders/:id"`
//      The path is matched against the URL **suffix** after the plugin
//      mount point (`/portal/agency/<pluginId>/...`).
//
//   2. **Fully-qualified URL** (T3's website-editor):
//        `"/portal/clients/[clientId]/editor"`, `"/portal/.../pages/[pageId]"`
//      The path is matched against the **entire** request URL. `[name]`
//      placeholders capture dynamic segments.
//
// Both conventions handle dynamic segments — `:name` (relative) or
// `[name]` (full URL) — and expose captured values via `segments[]`
// (in the order they appear in the path).
//
// URL families:
//
//   /portal/agency/<pluginId>/<sub-path>
//     → resolveAgencyPluginPage
//
//   /portal/clients/<clientId>/<pluginId>/<sub-path>
//     → resolveClientPluginPage (branch 1: explicit plugin prefix)
//
//   /portal/clients/<clientId>/<sub-path>     (no plugin id)
//     → resolveClientPluginPage (branch 2: search all manifests'
//       pages[] for one that owns the URL — works for relative paths
//       contributing top-level client surfaces AND full-URL paths)
//
// Returns null when no plugin owns the URL — caller renders 404.
//
// ─── Surface compatibility (default deny) ─────────────────────────────────
//
// Owning the URL is necessary but not sufficient. Each resolver below ALSO
// refuses any page that does not belong to its own surface, via
// `pageResolvesAt` — see `_pageScope.ts` for why that lives there and not in
// 90 manifests. Concretely: `/portal/clients/<id>/agency-hr/staff` matched
// happily, because `pickInstall` falls back to the AGENCY-scoped install and
// the bare-static branch below reaches agency pages a second way. An
// agency-scoped page under the client host is a category error and is refused
// here, declared roles or not, before the host's role gate is even consulted.

import { listPlugins } from "./_registry";
import { getInstall } from "@/server/pluginInstalls";
import { pageResolvesAt } from "./_pageScope";
import type { AquaPlugin, PluginPage } from "./_types";
import type { PluginInstall } from "@/server/types";

export interface ResolvedPluginPage {
  plugin: AquaPlugin;
  page: PluginPage;
  install: PluginInstall;
  segments: string[];
}

interface MatchInput { agencyId: string; clientId?: string; rest: string[] }

// ─── Path matching ────────────────────────────────────────────────────────

interface PathMatch { ok: true; segments: string[] }

function isFullUrlPath(path: string): boolean {
  return path.startsWith("/");
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function isParamSegment(seg: string): boolean {
  return seg.startsWith(":") || (seg.startsWith("[") && seg.endsWith("]"));
}

// Match relative manifest path `pp` against URL suffix segments `rest`.
function tryMatchRelative(pp: string, rest: string[]): PathMatch | null {
  if (pp === "") {
    return rest.length === 0 ? { ok: true, segments: [] } : null;
  }
  if (isParamSegment(pp)) {
    return rest.length === 1 ? { ok: true, segments: [rest[0]!] } : null;
  }
  const ppSegs = splitPath(pp);
  if (ppSegs.length !== rest.length) return null;
  const captures: string[] = [];
  for (let i = 0; i < ppSegs.length; i++) {
    const ppSeg = ppSegs[i]!;
    const restSeg = rest[i]!;
    if (isParamSegment(ppSeg)) {
      captures.push(restSeg);
    } else if (ppSeg !== restSeg) {
      return null;
    }
  }
  return { ok: true, segments: captures };
}

// Match full-URL manifest path `pp` against the full URL segments.
function tryMatchFullUrl(pp: string, urlSegs: string[]): PathMatch | null {
  const ppSegs = splitPath(pp);
  if (ppSegs.length !== urlSegs.length) return null;
  const captures: string[] = [];
  for (let i = 0; i < ppSegs.length; i++) {
    const ppSeg = ppSegs[i]!;
    const urlSeg = urlSegs[i]!;
    if (isParamSegment(ppSeg)) {
      captures.push(urlSeg);
    } else if (ppSeg !== urlSeg) {
      return null;
    }
  }
  return { ok: true, segments: captures };
}

// ─── Install picker ───────────────────────────────────────────────────────

function pickInstall(pluginId: string, agencyId: string, clientId?: string): PluginInstall | null {
  if (clientId) {
    const c = getInstall({ agencyId, clientId }, pluginId);
    if (c?.enabled) return c;
  }
  const a = getInstall({ agencyId }, pluginId);
  if (a?.enabled) return a;
  return null;
}

// ─── Public resolver functions ────────────────────────────────────────────

// Agency-scope catch-all: /portal/agency/[...rest]
export function resolveAgencyPluginPage({ agencyId, rest }: { agencyId: string; rest: string[] }): ResolvedPluginPage | null {
  if (rest.length === 0) return null;

  // First try the `/portal/agency/<pluginId>/<sub>` shape.
  const pluginId = rest[0]!;
  const plugin = listPlugins().find(p => p.id === pluginId);
  if (plugin) {
    const install = pickInstall(pluginId, agencyId);
    if (install) {
      const sub = rest.slice(1);
      for (const page of plugin.pages) {
        if (isFullUrlPath(page.path)) continue;
        if (!pageResolvesAt(plugin, page, "agency")) continue;
        const m = tryMatchRelative(page.path, sub);
        if (m) return { plugin, page, install, segments: m.segments };
      }
    }
  }

  // Fall back: scan every plugin for full-URL paths matching this URL.
  const fullUrlSegs = ["portal", "agency", ...rest];
  for (const candidate of listPlugins()) {
    const install = pickInstall(candidate.id, agencyId);
    if (!install) continue;
    for (const page of candidate.pages) {
      if (!isFullUrlPath(page.path)) continue;
      if (!pageResolvesAt(candidate, page, "agency")) continue;
      const m = tryMatchFullUrl(page.path, fullUrlSegs);
      if (m) return { plugin: candidate, page, install, segments: m.segments };
    }
  }
  return null;
}

// Client-scope catch-all: /portal/clients/[clientId]/[...rest]
export function resolveClientPluginPage({ agencyId, clientId, rest }: MatchInput): ResolvedPluginPage | null {
  if (rest.length === 0) return null;

  // Branch 1: explicit plugin id prefix (T2 / ecommerce convention).
  const head = rest[0]!;
  const pluginByPrefix = listPlugins().find(p => p.id === head);
  if (pluginByPrefix) {
    const install = pickInstall(pluginByPrefix.id, agencyId, clientId);
    if (install) {
      const sub = rest.slice(1);
      for (const page of pluginByPrefix.pages) {
        if (isFullUrlPath(page.path)) continue;
        if (!pageResolvesAt(pluginByPrefix, page, "client")) continue;
        const m = tryMatchRelative(page.path, sub);
        if (m) return { plugin: pluginByPrefix, page, install, segments: m.segments };
      }
    }
  }

  // Branch 2: give fully-qualified client URLs first refusal. This keeps
  // broad relative routes such as fulfillment's `:clientId` from claiming
  // `/portal/clients/<id>/pages` before the website editor sees it.
  const fullUrlSegs = clientId
    ? ["portal", "clients", clientId, ...rest]
    : ["portal", "clients", ...rest];
  for (const plugin of listPlugins()) {
    const install = pickInstall(plugin.id, agencyId, clientId);
    if (!install) continue;
    for (const page of plugin.pages) {
      if (!isFullUrlPath(page.path)) continue;
      if (!pageResolvesAt(plugin, page, "client")) continue;
      const m = tryMatchFullUrl(page.path, fullUrlSegs);
      if (m) return { plugin, page, install, segments: m.segments };
    }
  }

  // Static relative paths may contribute a top-level client surface (for
  // example `checklist`). Parameter-only relative routes belong beneath an
  // explicit plugin prefix and are deliberately excluded here.
  //
  // This is the branch that made the hole a second, non-obvious way in: only
  // `settings` exists as a literal child of `/portal/clients/[clientId]/`, so
  // EVERY other bare sub-path falls to the catch-all and lands here — which is
  // how `/portal/clients/<id>/staff` reached agency-hr's staff directory with
  // no plugin prefix in the URL at all. `pageResolvesAt` closes both ways in
  // one place.
  for (const plugin of listPlugins()) {
    const install = pickInstall(plugin.id, agencyId, clientId);
    if (!install) continue;
    for (const page of plugin.pages) {
      if (isFullUrlPath(page.path) || splitPath(page.path).some(isParamSegment)) continue;
      if (!pageResolvesAt(plugin, page, "client")) continue;
      const m = tryMatchRelative(page.path, rest);
      if (m) return { plugin, page, install, segments: m.segments };
    }
  }

  return null;
}

// Customer-scope catch-all: /portal/customer/[...rest]
//
// Mirrors the client branch but anchored at `/portal/customer`. End-
// customer plugins are scoped to the (agencyId, clientId) pair (every
// end-customer belongs to one client of one agency). The session
// payload supplies both IDs via `requireRole("end-customer")`.
//
// A plugin opts into this surface in exactly ONE way: by declaring a page
// with `path: "/portal/customer/<sub>"` — a fully-qualified path naming this
// surface out loud.
//
// It used to accept a second way: an explicit `/portal/customer/<pluginId>/…`
// prefix matched against the plugin's RELATIVE pages. Those are the operator's
// admin pages. That branch handed an end-customer the client's own back office:
//
//   /portal/customer/memberships/subscribers  → the subscriber list
//   /portal/customer/affiliates/payouts       → every affiliate's earnings
//   /portal/customer/client-crm/contacts      → the client's contact database
//   /portal/customer/agency-hr/staff          → the AGENCY's staff directory
//
// — none of which declared roles, so `pluginPageAllowedRoles` returned
// `undefined` and the host's `requireRole("end-customer")` was the only gate,
// which of course the end-customer passes. It also SHADOWED the real thing:
// `/portal/customer/memberships` matched memberships' relative `""` index (the
// operator's dashboard) before the full-URL `/portal/customer/memberships`
// page was ever reached. Removing the branch fixes the leak and the shadow at
// once. Nothing relied on it — every `panelId: "customer"` nav item in the
// registry points at a page that declares its full URL, and
// `smoke-plugin-page-host-gates` pins that.
export function resolveCustomerPluginPage({ agencyId, clientId, rest }: MatchInput): ResolvedPluginPage | null {
  if (rest.length === 0) return null;

  const fullUrlSegs = ["portal", "customer", ...rest];
  for (const plugin of listPlugins()) {
    const install = pickInstall(plugin.id, agencyId, clientId);
    if (!install) continue;
    for (const page of plugin.pages) {
      if (!isFullUrlPath(page.path)) continue;
      if (!pageResolvesAt(plugin, page, "customer")) continue;
      const m = tryMatchFullUrl(page.path, fullUrlSegs);
      if (m) return { plugin, page, install, segments: m.segments };
    }
  }

  return null;
}

// API catch-all: /api/portal/<pluginId>/<sub-path>
export interface ResolvedPluginApiRoute {
  plugin: AquaPlugin;
  route: import("./_types").PluginApiRoute;
  install: PluginInstall;
}

export function resolvePluginApiRoute(
  pluginId: string,
  rest: string[],
  scope: { agencyId: string; clientId?: string },
  method: string,
): ResolvedPluginApiRoute | null {
  const plugin = listPlugins().find(p => p.id === pluginId);
  if (!plugin) return null;
  const install = pickInstall(pluginId, scope.agencyId, scope.clientId);
  if (!install) return null;
  // Normalise both sides — T2/ecommerce author api paths as `"foo/bar"`,
  // T3 authors them as `"/foo/bar"` with a leading slash. The bus is
  // the same; trim leading slash before comparing.
  const path = rest.join("/");
  for (const route of plugin.api) {
    const normalised = route.path.startsWith("/") ? route.path.slice(1) : route.path;
    if (normalised === path && route.methods.includes(method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE")) {
      return { plugin, route, install };
    }
  }
  return null;
}

// ─── Structural nav → page lookup (no install, no session) ────────────────
//
// "Which page does this nav item open?" answered from the manifest alone.
//
// This exists for the role-gate contract test. Nav visibility and page access
// control are declared in two different places on a manifest, and on 22 Aug
// 2026 they disagreed: agency-finance hid Budgets/Operations/Planning/Settings
// from `agency-staff` in `navItems` while `pages[]` declared nothing, so the
// host's `pluginPageAllowedRoles()` returned `undefined` and staff could open
// all four by typing the URL. Pairing the two up needs exactly this mapping,
// and it must use the REAL matcher above rather than a second copy of it that
// could drift.
//
// Returns null when the href points somewhere this plugin has no page for
// (an app route, or another plugin's surface) — that is a legitimate nav
// entry, not a gap.
export function pluginPageForNavHref(plugin: AquaPlugin, href: string): PluginPage | null {
  const hrefSegs = splitPath(href.split("?")[0] ?? href);

  // Fully-qualified page paths are matched against the whole href.
  for (const page of plugin.pages) {
    if (!isFullUrlPath(page.path)) continue;
    if (tryMatchFullUrl(page.path, hrefSegs)) return page;
  }

  // Relative page paths hang off the plugin's mount point, which is the
  // plugin id inside the href: /portal/agency/<id>/… or
  // /portal/clients/<clientId>/<id>/… or /portal/customer/<id>/….
  const mount = hrefSegs.indexOf(plugin.id);
  if (mount === -1) return null;
  const sub = hrefSegs.slice(mount + 1);

  // Static paths first, parameter paths only as a fallback. This deliberately
  // differs from the resolver's plain iteration order, which lets a page like
  // fulfillment's `:clientId` swallow a static sibling declared after it. A
  // nav entry naming a static path is FOR the static page; a parameter route
  // shadowing it is a routing-order bug, and answering "which page does this
  // nav entry gate?" with the shadowing page would only hide the role question
  // behind it.
  const relative = plugin.pages.filter(page => !isFullUrlPath(page.path));
  const isParamPath = (path: string) => splitPath(path).some(isParamSegment);
  for (const page of relative) {
    if (isParamPath(page.path)) continue;
    if (tryMatchRelative(page.path, sub)) return page;
  }
  for (const page of relative) {
    if (!isParamPath(page.path)) continue;
    if (tryMatchRelative(page.path, sub)) return page;
  }
  return null;
}
