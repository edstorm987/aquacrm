// `@aqua/plugin-email-sender` — cross-cutting outbound email engine.
// scopePolicy: "agency", core: false. Other plugins fan their notifications
// out via cross-plugin events — foundation R6 router routes them to the
// 4 declared subscribers on this plugin's EmailService.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

const manifest: AquaPlugin = {
  id: "email-sender",
  name: "Email sender",
  version: "0.1.0",
  status: "alpha",
  category: "core",
  tagline: "Cross-cutting outbound email — used by every other plugin.",
  description:
    "Single point of egress for all transactional and notification email " +
    "across the agency portal. Plugins enqueue via the cross-plugin event " +
    "bus (forms.notification.requested, membership.subscription_changed, " +
    "affiliate.payout_completed, auth.bootstrap.signup) — this plugin's " +
    "EmailService subscribes via foundation R6 router. Drivers: postmark + " +
    "no-op (sendgrid/resend/smtp stubs flagged R11). Idempotency on " +
    "(triggeredByPlugin, externalRef-or-payloadHash) prevents duplicate " +
    "sends across retries. Webhook ingest from Postmark closes the loop on " +
    "delivered / bounced / spam / opened.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "email-sender.outbox",
      label: "Outbox",
      href: "/portal/agency/email-sender",
      panelId: "operations",
      order: 10,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "email-sender.settings",
      label: "Settings",
      href: "/portal/agency/email-sender/settings",
      panelId: "operations",
      order: 20,
      visibleToRoles: [...AGENCY_ADMINS],
    },
    {
      id: "email-sender.logs",
      label: "Logs",
      href: "/portal/agency/email-sender/logs",
      panelId: "operations",
      order: 30,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/OutboxPage") },
    { path: "outbox", component: () => import("./src/pages/OutboxPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
    { path: "logs", component: () => import("./src/pages/LogsPage") },
  ],

  api: ROUTES,

  // No storefront blocks. Email is server-side only.

  settings: {
    groups: [
      {
        id: "provider",
        label: "Provider",
        fields: [
          {
            id: "provider",
            label: "Provider",
            type: "select",
            default: "none",
            options: [
              { value: "none", label: "(none — disable real send)" },
              { value: "postmark", label: "Postmark" },
              { value: "sendgrid", label: "SendGrid (R11 stub)" },
              { value: "resend", label: "Resend (R11 stub)" },
              { value: "smtp", label: "SMTP (R11 stub)" },
            ],
            helpText: "Defaults to 'none' on install. Switch to postmark + supply API key to enable real send.",
          },
          {
            id: "webhookSecret",
            label: "Webhook secret",
            type: "text",
            default: "",
            helpText: "Required for Postmark webhook signature verification — events without a matching secret are rejected.",
          },
        ],
      },
      {
        id: "defaults",
        label: "Defaults",
        fields: [
          {
            id: "defaultFromName",
            label: "Default From name (used when bootstrapping the first identity)",
            type: "text",
            default: "Aqua portal",
          },
          {
            id: "defaultFromEmail",
            label: "Default From email (bootstrapped first identity address)",
            type: "text",
            default: "no-reply@example.com",
            helpText: "Used by onInstall to seed the first sender identity. Verify via Settings before sending.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "drivers", label: "Postmark + no-op drivers (sendgrid/resend/smtp stubs flagged R11)", default: true },
    { id: "idempotency", label: "Per-(plugin, externalRef) idempotency on enqueue", default: true },
    { id: "cross-plugin-subscribers", label: "Subscriber wiring for forms / membership / affiliate / auth events", default: true },
    { id: "webhook-ingest", label: "Postmark webhook ingest (delivered/bounced/spam/open)", default: true },
  ],

  // Idempotent. Bootstraps the default sender identity from settings,
  // and seeds a 'none' provider config so the agency can flip on a real
  // provider via Settings without an explicit "create provider config"
  // step.
  onInstall: async (ctx: PluginCtx) => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      storage: ctx.storage,
    });
    if (!c) return;
    const existing = await c.identities.list();
    if (existing.length > 0) return;
    const fromName = (ctx.install.config.defaultFromName as string | undefined) ?? "Aqua portal";
    const fromEmail = (ctx.install.config.defaultFromEmail as string | undefined) ?? "no-reply@example.com";
    await c.identities.create(
      { name: fromName, email: fromEmail, isDefault: true },
      ctx.actor,
    );
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "email-sender foundation not registered" };
    const [provider, identities, messages] = await Promise.all([
      c.provider.get(),
      c.identities.list(),
      c.emails.list({}),
    ]);
    const queued = messages.filter(m => m.status === "queued").length;
    const failed = messages.filter(m => m.status === "failed" || m.status === "bounced").length;
    const ok = provider.status !== "error";
    return {
      ok,
      message: `provider=${provider.provider} (${provider.status}) · ${identities.length} identities · ${queued} queued · ${failed} failed`,
      components: {
        provider: { ok: provider.status !== "error", message: `${provider.provider}/${provider.status}` },
        identities: { ok: identities.length > 0, message: `${identities.length} identities` },
        outbox: { ok: failed === 0, message: `${queued} queued · ${failed} failed` },
      },
    };
  },
};

export default manifest;
