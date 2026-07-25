// `@aqua/plugin-notifications` — channel routing on top of foundation
// activity events. Lifts "notification channels" from chapter #58
// Tier 4 lift inventory; pairs with `@aqua/plugin-activity-inbox`
// (R003) and `@aqua/plugin-email-sender` (R10) when present.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "notifications",
  name: "Notification Channels",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Route activity events to email, Slack, WhatsApp, and webhooks per user.",
  description:
    "Per-user `NotificationRule` records (event categories × channel " +
    "set × cooldown × optional client-scope filter) drive a fan-out " +
    "engine over foundation activity events. Channel drivers are " +
    "pluggable ports — bundled email/slack/whatsapp-stub/webhook " +
    "drivers ship in v1; foundations can override any of them via " +
    "`registerNotificationsFoundation({ drivers })`. Graceful when " +
    "the email-sender plugin or activity-inbox plugin aren't installed.",

  core: false,
  scopePolicy: "agency",
  // Soft requires — engine no-ops gracefully when these aren't present.
  // Listed for the marketplace UI to render an "install together" hint.
  // Hard requires would block install when the dep is missing — we
  // explicitly don't want that.

  navItems: [
    {
      id: "notifications.rules",
      label: "Notifications",
      href: "/portal/agency/notifications",
      panelId: "ops",
      order: 80,
      visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/NotificationRulesPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "channels",
        label: "Channel configuration",
        fields: [
          { id: "slackWebhookUrl", label: "Slack webhook URL", type: "url" },
          { id: "webhookUrl",      label: "Generic webhook URL", type: "url" },
          { id: "webhookSecret",   label: "Webhook shared secret", type: "password" },
          { id: "whatsappProvider", label: "WhatsApp provider", type: "select",
            options: [
              { value: "", label: "(disabled)" },
              { value: "twilio", label: "Twilio" },
              { value: "meta-cloud", label: "Meta Cloud API" },
            ] },
        ],
      },
    ],
  },

  features: [
    { id: "cooldown", label: "Per-(user, event) cooldown dedup", default: true },
    { id: "graceful-fallback", label: "No-op when paired plugins absent", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "notifications foundation not registered" };
    const rules = await c.notifications.listRules();
    const enabled = rules.filter(r => r.enabled).length;
    return {
      ok: true,
      message: `${enabled}/${rules.length} rules enabled`,
      components: {
        rules: { ok: true, message: `${rules.length} rules` },
      },
    };
  },
};

export default manifest;
