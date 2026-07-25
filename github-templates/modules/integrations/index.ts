// `@aqua/plugin-integrations` — per-client + per-agency integrations registry.
//
// Records connection intent + config-shape for the supported kinds
// (Stripe / Mailchimp / Google / Meta / Slack / Zapier / custom-webhook).
// Credentials are referenced via @aqua/plugin-credentials-vault — this
// plugin stores a `credentialsRef` and never sees plaintext. Real OAuth
// flows + outbound-fetch wiring are a T6 prod gate; v1 is a manual
// verify (operator stamps ok/fail) + a placeholder webhook log.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "integrations",
  name: "Integrations",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Integrations registry — Stripe / Mailchimp / Google / Meta / Slack / Zapier / custom-webhook.",
  description:
    "Records connection intent + operator-paste config-shape per kind. " +
    "Credentials referenced via @aqua/plugin-credentials-vault — this " +
    "plugin does NOT decrypt. State machine: intended → configured → " +
    "verified or failed. Auto-promotes intended→configured when " +
    "credentialsRef is set; auto-demotes back when cleared. Verified/" +
    "failed are stamped only by an explicit verify call. v1 manual " +
    "verify only — real OAuth + outbound HTTP land in T6. Bounded " +
    "ring-buffer webhook log (200 entries per scope) so a chatty " +
    "integration can't blow storage. scopePolicy:'either' — agency-" +
    "scope and client-scope installs are isolated even within the " +
    "same agency.",

  core: false,
  scopePolicy: "either",
  requires: ["credentials-vault"],

  navItems: [
    {
      id: "integrations.connections", label: "Connections",
      href: "/portal/integrations",
      panelId: "agency-tools", order: 60, visibleToRoles: [...VIEWERS],
    },
    {
      id: "integrations.browse", label: "Browse",
      href: "/portal/integrations/browse",
      panelId: "agency-tools", order: 61, visibleToRoles: [...ADMINS],
    },
    {
      id: "integrations.webhooks", label: "Incoming webhooks",
      href: "/portal/integrations/webhooks",
      panelId: "agency-tools", order: 62, visibleToRoles: [...VIEWERS],
    },
    {
      id: "integrations.outgoing", label: "Outgoing log",
      href: "/portal/integrations/outgoing",
      panelId: "agency-tools", order: 63, visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "",          component: () => import("./src/pages/ConnectionsPage") },
    { path: "browse",    component: () => import("./src/pages/BrowsePage") },
    { path: "configure", component: () => import("./src/pages/ConfigurePage") },
    { path: "verify",    component: () => import("./src/pages/VerifyPage") },
    { path: "webhooks",  component: () => import("./src/pages/WebhooksPage") },
    { path: "outgoing",  component: () => import("./src/pages/OutgoingPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultRetention",
            label: "Webhook log retention (entries per scope)",
            type: "number",
            default: 200,
            helpText: "Bounded ring-buffer; oldest entries drop on append.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "webhook-log", label: "Webhook log", default: true },
    { id: "manual-verify", label: "Manual verify", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage });
    if (!c) return { ok: false, message: "integrations foundation not registered" };
    const list = await c.integrations.list();
    const verified = list.filter(i => i.status === "verified").length;
    const failed = list.filter(i => i.status === "failed").length;
    return {
      ok: true,
      message: `${list.length} integration${list.length === 1 ? "" : "s"} · ${verified} verified · ${failed} failed`,
      components: {
        integrations: { ok: true, message: `${list.length} rows` },
      },
    };
  },
};

export default manifest;
