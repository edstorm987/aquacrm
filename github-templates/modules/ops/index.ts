// Manifest export — `@aqua/plugin-ops`.
//
// Production health dashboard. scopePolicy: "agency" — operators
// install at the agency level so the dashboard surfaces every
// per-Live-client deployment in one view. core: false (opt-in).

import type { AquaPlugin, PluginCtx, HealthStatus } from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { MonitoringService } from "./src/server/monitoringService";

const VIEWER_ROLES = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "ops",
  name: "Production health",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Uptime, errors, slow routes, and cost — at a glance.",
  description:
    "Server-rendered dashboard that surfaces per-deployment uptime (hourly /healthz pings), Sentry error rate + top issues, slow routes (Vercel Analytics or local middleware), and a month-to-date cost snapshot (Stripe + Postmark + Vercel + Sentry). v1 ships with fixture data — provider integrations are stubbed and gated on per-install creds, wired one-by-one as keys land in R4.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "ops.monitoring",
      label: "Production health",
      href: "/portal/agency/ops",
      panelId: "ops",
      order: 90,
      visibleToRoles: [...VIEWER_ROLES],
    },
  ],

  pages: [{ path: "", component: () => import("./src/pages/MonitoringPage") }],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "providers",
        label: "Providers",
        description:
          "Per-install creds. Sentry org/project + Vercel token are read from env (operator-level secrets); Stripe + Postmark are per-install because each agency may run its own payments stack.",
        fields: [
          {
            id: "stripeSecretKey",
            label: "Stripe secret key (optional)",
            type: "password",
            placeholder: "sk_live_...",
            helpText: "Used only to fetch month-to-date platform fees. Leave blank to keep using the fixture row.",
          },
          {
            id: "postmarkServerToken",
            label: "Postmark server token (optional)",
            type: "password",
            placeholder: "POSTMARK_TOKEN",
            helpText: "Used only to fetch month-to-date outbound email counts. Leave blank to keep using the fixture row.",
          },
        ],
      },
    ],
  },

  features: [
    {
      id: "live-providers",
      label: "Live provider integrations",
      description: "When disabled, the dashboard shows fixture rows even if creds are configured.",
      default: true,
    },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const installConfig: { stripeSecretKey?: string; postmarkServerToken?: string } = {};
    const cfg = (ctx.install?.config ?? {}) as Record<string, unknown>;
    if (typeof cfg["stripeSecretKey"] === "string") installConfig.stripeSecretKey = cfg["stripeSecretKey"];
    if (typeof cfg["postmarkServerToken"] === "string") installConfig.postmarkServerToken = cfg["postmarkServerToken"];
    const service = new MonitoringService({ storage: ctx.storage, installConfig });
    const snap = await service.snapshot();
    const fixtureCosts = snap.costs.filter((c) => !c.live).length;
    const errored = snap.uptime.filter((r) => r.lastSample && !r.lastSample.ok).length;
    return {
      ok: errored === 0,
      message: `${snap.uptime.length} target(s); ${errored} down; ${fixtureCosts} fixture cost row(s)`,
      components: {
        uptime: { ok: errored === 0, message: `${errored} down` },
        costs: { ok: true, message: fixtureCosts === 0 ? "all live" : `${fixtureCosts} fixture` },
      },
    };
  },
};

export default manifest;
