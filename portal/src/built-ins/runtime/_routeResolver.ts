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

import { listPlugins } from "./_registry";
import { getInstall } from "@/server/pluginInstalls";
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
        const m = tryMatchRelative(page.path, sub);
        if (m) return { plugin: pluginByPrefix, page, install, segments: m.segments };
      }
    }
  }

  // Branch 2: search every plugin's pages for a path that owns this URL.
  // Two cases per plugin:
  //   • full-URL path  → match against ["portal","clients",<clientId>,...rest]
  //   • relative path  → match against rest (top-level client surface)
  const fullUrlSegs = clientId
    ? ["portal", "clients", clientId, ...rest]
    : ["portal", "clients", ...rest];
  for (const plugin of listPlugins()) {
    const install = pickInstall(plugin.id, agencyId, clientId);
    if (!install) continue;
    for (const page of plugin.pages) {
      if (isFullUrlPath(page.path)) {
        const m = tryMatchFullUrl(page.path, fullUrlSegs);
        if (m) return { plugin, page, install, segments: m.segments };
      } else {
        const m = tryMatchRelative(page.path, rest);
        if (m) return { plugin, page, install, segments: m.segments };
      }
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
// A plugin opts into this surface by either:
//   • declaring a page with `path: "/portal/customer/<sub>"` (full URL), OR
//   • declaring a relative-path page AND a NavItem with
//     `panelId: "customer"` (the chrome routes the URL prefix through
//     this resolver under `/portal/customer/<pluginId>/<sub>`).
export function resolveCustomerPluginPage({ agencyId, clientId, rest }: MatchInput): ResolvedPluginPage | null {
  if (rest.length === 0) return null;

  // Branch 1: explicit plugin id prefix — `/portal/customer/<pluginId>/<sub>`.
  const head = rest[0]!;
  const pluginByPrefix = listPlugins().find(p => p.id === head);
  if (pluginByPrefix) {
    const install = pickInstall(pluginByPrefix.id, agencyId, clientId);
    if (install) {
      const sub = rest.slice(1);
      for (const page of pluginByPrefix.pages) {
        if (isFullUrlPath(page.path)) continue;
        const m = tryMatchRelative(page.path, sub);
        if (m) return { plugin: pluginByPrefix, page, install, segments: m.segments };
      }
    }
  }

  // Branch 2: scan every plugin's pages for full-URL paths anchored at
  // `/portal/customer/...`. Relative paths under customer scope only
  // resolve via the explicit-prefix branch above (ambiguity guard —
  // we don't know which plugin a bare `/portal/customer/orders` belongs
  // to without the prefix).
  const fullUrlSegs = ["portal", "customer", ...rest];
  for (const plugin of listPlugins()) {
    const install = pickInstall(plugin.id, agencyId, clientId);
    if (!install) continue;
    for (const page of plugin.pages) {
      if (!isFullUrlPath(page.path)) continue;
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
