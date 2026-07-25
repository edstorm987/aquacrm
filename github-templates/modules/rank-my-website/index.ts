// `@aqua/plugin-rank-my-website` — first Resources tool. Public-
// facing diagnostic over a URL: title / meta / H1 / image alts / OG /
// canonical / robots.txt / sitemap.xml / HTTPS / HSTS. A-F bands per
// check, NO numeric percentage out of 100 (chapter #68 honesty —
// false precision). Email capture hands off to
// `@aqua/plugin-public-funnel` so the lead lives in ONE store.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const manifest: AquaPlugin = {
  id: "rank-my-website",
  name: "Rank my website",
  version: "0.1.0",
  status: "alpha",
  category: "growth",
  tagline: "Honest A-F website diagnostic — drops the visitor into BOS as a lead.",
  description:
    "Public-facing diagnostic. Lightweight checks (title length, meta " +
    "description, H1 count, image alt coverage, Open Graph tags, " +
    "canonical, robots.txt + sitemap.xml reachability, HTTPS, HSTS). " +
    "Reports A-F bands per check + the actual finding ('3 of 12 " +
    "images missing alt') — no fabricated numeric score. Email " +
    "capture hands off to @aqua/plugin-public-funnel's tool-complete " +
    "path; absent funnel → soft-fails with a guidance string.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "rank-my-website.public",
      label: "Rank my website",
      href: "/resources/rank-my-website",
      panelId: "resources",
      order: 10,
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/RmwToolPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "fetch",
        label: "Fetch",
        fields: [
          {
            id: "timeoutMs",
            label: "Per-fetch timeout (ms)",
            type: "number",
            default: 5000,
            helpText: "Wall-clock budget for fetching the page or related URLs (robots.txt, sitemap.xml). 5000ms recommended.",
          },
          {
            id: "maxBodyBytes",
            label: "Max response body (bytes)",
            type: "number",
            default: 3145728,
            helpText: "Cap on the response body size. Larger pages are truncated. Default 3MB.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "public-tool",     label: "Expose /resources/rank-my-website",  default: true },
    { id: "funnel-handoff",  label: "Hand-off captures to public-funnel", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId });
    if (!c) return { ok: false, message: "rank-my-website foundation not registered" };
    return {
      ok: true,
      message: "tool ready",
      components: { analyzer: { ok: true, message: "10 checks available" } },
    };
  },
};

export default manifest;
