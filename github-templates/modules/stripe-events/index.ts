// `@aqua/plugin-stripe-events` — webhook ingestion + idempotent
// event log + subscription state mirror. NO charges / money flow
// in v1. Per-install creds; webhook signing secret resolved via
// the credentials-vault VaultPort.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "stripe-events",
  name: "Stripe events",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Stripe webhook ingestion + subscription mirror. No charges.",
  description:
    "Verifies the Stripe-Signature HMAC over `<timestamp>.<rawBody>`, " +
    "rejects timestamps outside the configurable tolerance window " +
    "(default 5 minutes), dedupes on event.id (Stripe is the source-" +
    "of-truth id), stores raw + summary, and projects " +
    "`customer.subscription.{created,updated,deleted}` events into a " +
    "per-tenant subscription mirror. Read-only — we don't push back " +
    "to Stripe. Activity-inbox sees `stripe.event.<type>` entries on " +
    "every accepted event.",

  core: false,
  scopePolicy: "agency",
  requires: ["credentials-vault"],

  navItems: [
    {
      id: "stripe-events.settings",
      label: "Stripe events",
      href: "/portal/agency/stripe-events",
      panelId: "agency-tools",
      order: 60,
      visibleToRoles: [...ADMINS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/StripeSettingsPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "webhookSecret",
            label: "Webhook signing secret (whsec_…)",
            type: "password",
            helpText: "Found in your Stripe dashboard → Developers → Webhooks → your endpoint. The plugin verifies HMAC against this before accepting any event.",
          },
          {
            id: "toleranceS",
            label: "Timestamp tolerance (seconds)",
            type: "number",
            default: 300,
            helpText: "Maximum |now − event.t| accepted. Stripe recommends 300s.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "subscription-mirror", label: "Project subscription events into mirror", default: true },
    { id: "activity-inbox-emit", label: "Emit stripe.event.<type> to activity-inbox", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "stripe-events foundation not registered" };
    const events = await c.stripe.listEvents({ limit: 1 });
    const subs = await c.stripe.listSubscriptions();
    return {
      ok: true,
      message: `${events.length > 0 ? "events seen" : "no events yet"} · ${subs.length} subscriptions mirrored`,
      components: {
        events: { ok: true, message: `${events.length} (showing latest 1)` },
        subs: { ok: true, message: `${subs.length}` },
      },
    };
  },
};

export default manifest;
