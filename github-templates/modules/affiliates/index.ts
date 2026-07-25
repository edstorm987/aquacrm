// `@aqua/plugin-affiliates` — referral codes, attributions, manual
// payouts, per-end-customer affiliate dashboard. `scopePolicy: "client"`,
// `requires: ["ecommerce"]`, opt-in.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;
const END_CUSTOMER = ["end-customer"] as const;

const manifest: AquaPlugin = {
  id: "affiliates",
  name: "Affiliates",
  version: "0.1.0",
  status: "alpha",
  category: "growth",
  tagline: "Referral codes, attributions, payouts.",
  description:
    "Run an affiliate programme on top of your ecommerce store. End-customers " +
    "enrol via a self-serve form, generate referral codes, and earn commission " +
    "on referred orders. Agency owners approve attributions + schedule manual " +
    "payouts (PayPal / external bank transfer). Stripe Connect-driven automated " +
    "payouts ship in a future round.",

  core: false,
  scopePolicy: "client",
  requires: ["ecommerce"],

  navItems: [
    {
      id: "affiliates.affiliates",
      label: "Affiliates",
      href: "/portal/clients/:clientId/affiliates",
      panelId: "growth",
      order: 10,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "affiliates.codes",
      label: "Codes",
      href: "/portal/clients/:clientId/affiliates/codes",
      panelId: "growth",
      order: 20,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "affiliates.attributions",
      label: "Attributions",
      href: "/portal/clients/:clientId/affiliates/attributions",
      panelId: "growth",
      order: 30,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "affiliates.payouts",
      label: "Payouts",
      href: "/portal/clients/:clientId/affiliates/payouts",
      panelId: "growth",
      order: 40,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "affiliates.settings",
      label: "Settings",
      href: "/portal/clients/:clientId/affiliates/settings",
      panelId: "growth",
      order: 99,
      visibleToRoles: [...ADMIN_ROLES],
    },
    // Customer-facing
    {
      id: "affiliates.my",
      label: "Refer & earn",
      href: "/portal/customer/affiliates",
      panelId: "customer",
      order: 20,
      visibleToRoles: [...END_CUSTOMER],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/AffiliatesPage") },
    { path: "affiliates", component: () => import("./src/pages/AffiliatesPage") },
    { path: "codes", component: () => import("./src/pages/CodesPage") },
    { path: "attributions", component: () => import("./src/pages/AttributionsPage") },
    { path: "payouts", component: () => import("./src/pages/PayoutsPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
    // Customer page (full URL — T3-style convention)
    { path: "/portal/customer/affiliates", component: () => import("./src/pages/MyAffiliatePage") },
  ],

  api: ROUTES,

  storefront: {
    blocks: [
      {
        id: "affiliate-signup",
        label: "Affiliate signup",
        description: "Self-serve enrolment form. Posts to `/me/enroll`. Renderer ships in T3.",
        category: "affiliate",
        defaultProps: { ctaText: "Earn 10% on every referral" },
      },
      {
        id: "affiliate-payout-meter",
        label: "Affiliate payout meter",
        description: "Visual gauge of earnings + next payout date. Renderer ships in T3.",
        category: "affiliate",
        defaultProps: {},
      },
      {
        id: "affiliate-leaderboard",
        label: "Affiliate leaderboard",
        description: "Top earners table. Optional `limit` prop. Renderer ships in T3.",
        category: "affiliate",
        defaultProps: { limit: 10 },
      },
    ],
  },

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultCommissionPercent",
            label: "Default commission %",
            type: "number",
            default: 10,
            helpText: "Applied when neither the affiliate nor the code overrides.",
          },
          {
            id: "defaultPayoutMethod",
            label: "Default payout method",
            type: "select",
            default: "manual",
            options: [
              { value: "manual", label: "Manual (mark paid externally)" },
              { value: "paypal", label: "PayPal (manual entry — automation later)" },
              { value: "stripe-connect", label: "Stripe Connect (deferred — placeholder)" },
            ],
          },
          {
            id: "payoutCadence",
            label: "Payout cadence",
            type: "select",
            default: "monthly",
            options: [
              { value: "weekly", label: "Weekly" },
              { value: "biweekly", label: "Bi-weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "quarterly", label: "Quarterly" },
            ],
          },
        ],
      },
      {
        id: "approval",
        label: "Approval",
        fields: [
          {
            id: "autoApproveAfterDays",
            label: "Auto-approve attributions after N days (0 = manual only)",
            type: "number",
            default: 0,
            helpText: "Future round — value stored but not yet enforced. Approvals stay manual in v1.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "self-enroll", label: "Self-serve enrolment", default: true },
    { id: "manual-payouts", label: "Manual mark-paid workflow", default: true },
    { id: "leaderboard", label: "Affiliate leaderboard block", default: true },
  ],

  // Idempotent. Lands install settings (defaults) + ensures the
  // index keys exist so list reads don't 500 on a fresh install.
  // Doesn't seed any affiliates / codes — those are user-driven.
  onInstall: async (ctx: PluginCtx) => {
    if (!ctx.clientId) return;
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return;
    // Touch each list so the underlying `*/index` keys exist.
    await c.affiliates.list();
    await c.codes.list();
    await c.attributions.list();
    await c.payouts.list();
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    if (!ctx.clientId) return { ok: false, message: "missing clientId" };
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "affiliates foundation not registered" };
    const [affiliates, attributions, payouts] = await Promise.all([
      c.affiliates.list(),
      c.attributions.list(),
      c.payouts.list(),
    ]);
    const active = affiliates.filter(a => a.status === "active").length;
    return {
      ok: true,
      message: `${active}/${affiliates.length} active affiliates · ${attributions.length} attributions · ${payouts.length} payouts`,
      components: {
        affiliates: { ok: true, message: `${affiliates.length} rows` },
        attributions: { ok: true, message: `${attributions.length} rows` },
        payouts: { ok: true, message: `${payouts.length} rows` },
      },
    };
  },
};

export default manifest;
