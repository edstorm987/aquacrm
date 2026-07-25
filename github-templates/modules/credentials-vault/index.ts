// `@aqua/plugin-credentials-vault` — per-client (or agency-wide)
// credential vault. AES-256-GCM at rest; reveal-password is
// rate-limited and activity-logged. Closes the chapter §2 "Passwords
// & Access" sidebar slot.

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
  id: "credentials-vault",
  name: "Passwords & Access",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Per-client login info, API keys, 2FA recovery codes, and access notes.",
  description:
    "Closes the chapter §2 Passwords & Access sidebar slot. Per-client " +
    "(or agency-wide) credential vault with AES-256-GCM encryption at " +
    "rest. Reveal-password is rate-limited (10/min/actor) and emits a " +
    "`credential.viewed` activity event so the inbox shows a full audit " +
    "trail. Per-credential `sharedWith` ACL gates non-admin reads.",

  core: false,
  scopePolicy: "either",

  navItems: [
    {
      id: "credentials-vault.shelf",
      label: "Passwords",
      href: "/portal/agency/credentials-vault",
      panelId: "ops",
      order: 70,
      visibleToRoles: [...VIEWERS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/CredentialListPage") },
    { path: "new", component: () => import("./src/pages/CredentialDetailPage") },
    { path: "edit/:id", component: () => import("./src/pages/CredentialDetailPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "rotateAfterDays",
            label: "Recommend rotation after (days)",
            type: "number",
            default: 90,
            helpText: "Surfaces a yellow chip in the list view past this age. Doesn't expire credentials.",
          },
          {
            id: "rateLimitPerMinute",
            label: "Reveal rate limit (per actor / minute)",
            type: "number",
            default: 10,
          },
        ],
      },
    ],
  },

  features: [
    { id: "share-with", label: "Per-credential sharedWith ACL", default: true },
    { id: "rotation-warning", label: "Surface stale-rotation chips", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "credentials-vault foundation not registered" };
    const list = await c.vault.list(ctx.actor, { includeArchived: true });
    const live = list.filter(x => !x.archived).length;
    return {
      ok: true,
      message: `${live} live · ${list.length - live} archived`,
      components: {
        vault: { ok: true, message: `${list.length} rows in scope` },
      },
    };
  },
};

export default manifest;
