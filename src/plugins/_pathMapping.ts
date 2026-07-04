// Resolve which plugin owns a `/portal/*` path. Used by the chrome to
// highlight the active nav item, and by route shells to find the right
// install record before mounting a plugin's page component.
//
// 04's path shape (vs 02's `/admin/*`):
//   /portal/agency/<plugin-id>/...                  agency-scoped install
//   /portal/clients/<clientId>/<plugin-id>/...      client-scoped install
//
// Match rule: longest-prefix wins on the plugin's contributed nav hrefs.

import { listPlugins } from "./_registry";

export interface PathMatch {
  pluginId: string;
  scope: "agency" | "client";
  clientId?: string;
}

export function pluginIdForPath(pathname: string): PathMatch | null {
  if (!pathname.startsWith("/portal/")) return null;

  let scope: PathMatch["scope"];
  let clientId: string | undefined;
  let rest: string;

  if (pathname.startsWith("/portal/agency/")) {
    scope = "agency";
    rest = pathname.slice("/portal/agency".length); // e.g. "/fulfillment/briefs"
  } else if (pathname.startsWith("/portal/clients/")) {
    const m = /^\/portal\/clients\/([^/]+)(\/.*)?$/.exec(pathname);
    if (!m) return null;
    scope = "client";
    clientId = m[1];
    rest = m[2] ?? "";
  } else {
    return null;
  }

  let bestPluginId: string | null = null;
  let bestLen = 0;
  for (const plugin of listPlugins()) {
    for (const item of plugin.navItems) {
      // Match against the path under the scope root. Plugins author
      // hrefs as fully-qualified paths, e.g.
      // `/portal/agency/fulfillment/briefs`. Strip the scope prefix to
      // compare against `rest`.
      const expected = scope === "agency"
        ? item.href.replace(/^\/portal\/agency/, "")
        : item.href.replace(/^\/portal\/clients\/[^/]+/, "");
      if (!expected.startsWith("/")) continue;
      const exact = rest === expected;
      const descendant = rest.startsWith(expected + "/");
      if (!exact && !descendant) continue;
      if (expected.length > bestLen) {
        bestPluginId = plugin.id;
        bestLen = expected.length;
      }
    }
  }
  if (!bestPluginId) return null;
  return { pluginId: bestPluginId, scope, clientId };
}
