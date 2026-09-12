// `@aqua/plugin-email-sender` — cross-cutting outbound email engine.
// scopePolicy: "agency", core: false. Other plugins fan their notifications
// out via cross-plugin events — foundation R6 router routes them to the
// 4 declared subscribers on this plugin's EmailService.

import type {
  AquaPlugin,
  ErasureSubject,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";
import { buildEmailSenderHealth } from "./src/server/health";

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
    "EmailService subscribes via foundation R6 router. Drivers: Postmark + " +
    "SMTP; provider none keeps messages queued without claiming delivery " +
    "(SendGrid/Resend remain stubs). Idempotency on " +
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
    { path: "", component: () => import("./src/pages/OutboxPage"), visibleToRoles: [...AGENCY_VIEWERS] },
    // ORPHAN: the "Outbox" nav entry names the bare mount, which resolves to
    // "" above, so nothing declared who /email-sender/outbox is for.
    { path: "outbox", component: () => import("./src/pages/OutboxPage"), visibleToRoles: [...AGENCY_VIEWERS] },
    { path: "settings", component: () => import("./src/pages/SettingsPage"), visibleToRoles: [...AGENCY_ADMINS] },
    { path: "logs", component: () => import("./src/pages/LogsPage") },
  ],

  api: ROUTES,

  // No storefront blocks. Email is server-side only.

  // ── What is NOT declared here, and why ──────────────────────────────────
  //
  // `provider` and `webhookSecret` used to be declared as settings fields.
  // The generic Settings-hub panel therefore rendered them and wrote them to
  // `install.config` — and NOTHING in this module reads `install.config` for
  // either one. `DeliveryService` reads the ProviderService row; so does
  // `WebhookService`. The hub form saved without error, showed the value back
  // on reload, and changed nothing about which provider mail left through or
  // which webhook signatures were accepted.
  //
  // That is precisely the trap `lib/chrome/settingsModules.ts` warns about
  // ("write agency-scoped values that the read path never looks at, so the
  // form would save successfully and change nothing"), and it was holding a
  // signature secret. The API key was worse off still: never declared at all,
  // so no surface anywhere could supply it.
  //
  // One store, one editor: the provider kind, its credentials and the webhook
  // secret are set on this module's own Settings page, which PATCHes
  // `/api/portal/email-sender/provider` — the row delivery actually reads.
  // What stays here is the pair `onInstall` genuinely consumes.
  settings: {
    groups: [
      {
        id: "defaults",
        label: "Defaults",
        description:
          "Used once, when the module is installed, to seed the first sender identity. "
          + "The provider, its API key and the webhook secret are set on the module's own "
          + "Settings page, because those are the values the sending path reads.",
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
            helpText: "Used by onInstall to seed the first sender identity. Verify it with your provider before sending.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "drivers", label: "Postmark + SMTP delivery; disabled-provider queueing; SendGrid/Resend stubs", default: true },
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

  // Right-to-be-forgotten. Raw comms → DELETE (the disposition policy's clearest
  // delete category — the same treatment the live `inbox_*` scrub applies).
  //
  // Address-only legacy mail is preserved for ownership review. Exact
  // client/exclusive-Person messages (including their indexes and idempotency
  // pointers) are deleted idempotently.
  onEraseClient: async (ctx: PluginCtx, clientId: string, subject?: ErasureSubject) => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      storage: ctx.storage,
    });
    if (!c) throw new Error("Email-sender erasure foundation is unavailable.");
    const evidence = subject?.identityEvidence;
    const result = await c.emails.eraseForClient({
      clientId,
      personId: subject?.exactOwnership?.personId,
      personShared: subject?.exactOwnership?.personShared ?? true,
      emails: evidence?.emails ?? subject?.emails ?? [],
      sharedEmails: evidence?.sharedEmails ?? [],
    });
    if (result.reviewRequired.legacyUnscoped > 0) {
      subject?.reviewRequired?.push({
        system: "email-sender",
        reason: "legacy-unscoped",
        records: result.reviewRequired.legacyUnscoped,
      });
    }
    if (result.reviewRequired.sharedIdentity > 0) {
      subject?.reviewRequired?.push({
        system: "email-sender",
        reason: "shared-identity",
        records: result.reviewRequired.sharedIdentity,
      });
    }
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
    return buildEmailSenderHealth(provider, identities, messages);
  },
};

export default manifest;
