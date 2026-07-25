// `@aqua/plugin-memberships` — recurring-subscription tiers + benefits
// + per-end-customer subscription state. Billed via injected StripePort
// (foundation reads per-install Stripe keys from the ecommerce install
// in the same scope, since we declare `requires: ["ecommerce"]`).
//
// Mirrors the fulfillment + ecommerce + agency-hr shape: vendored
// AquaPlugin types, ports for foundation, container builder, foundation
// adapter the foundation side-effect-imports at boot.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";
import type { Currency } from "./src/lib/domain";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;
const END_CUSTOMER = ["end-customer"] as const;

const manifest: AquaPlugin = {
  id: "memberships",
  name: "Memberships",
  version: "0.1.0",
  status: "alpha",
  category: "growth",
  tagline: "Recurring subscription tiers, benefits, and a member portal.",
  description:
    "Sell recurring subscriptions to your client's end-customers. Tier plans " +
    "(Bronze/Silver/Gold seeded by default), associate benefits (discounts, " +
    "exclusive content, perks), and let members self-serve via Stripe Customer " +
    "Portal. Billing rides the per-install Stripe keys configured for the " +
    "ecommerce plugin in the same scope.",

  core: false,
  scopePolicy: "client",
  requires: ["ecommerce"],

  navItems: [
    {
      id: "memberships.plans",
      label: "Plans",
      href: "/portal/clients/:clientId/memberships",
      panelId: "growth",
      order: 10,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "memberships.subscribers",
      label: "Subscribers",
      href: "/portal/clients/:clientId/memberships/subscribers",
      panelId: "growth",
      order: 20,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "memberships.benefits",
      label: "Benefits",
      href: "/portal/clients/:clientId/memberships/benefits",
      panelId: "growth",
      order: 30,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "memberships.reports",
      label: "Reports",
      href: "/portal/clients/:clientId/memberships/reports",
      panelId: "growth",
      order: 40,
      visibleToRoles: [...ADMIN_VIEWERS],
    },
    {
      id: "memberships.settings",
      label: "Settings",
      href: "/portal/clients/:clientId/memberships/settings",
      panelId: "growth",
      order: 99,
      visibleToRoles: [...ADMIN_ROLES],
    },
    // Customer panel
    {
      id: "memberships.my",
      label: "My membership",
      href: "/portal/customer/memberships",
      panelId: "customer",
      order: 10,
      visibleToRoles: [...END_CUSTOMER],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/PlansPage") },
    { path: "plans", component: () => import("./src/pages/PlansPage") },
    { path: "subscribers", component: () => import("./src/pages/SubscribersPage") },
    { path: "subscribers/:userId", component: () => import("./src/pages/SubscriberDetailPage") },
    { path: "benefits", component: () => import("./src/pages/BenefitsPage") },
    { path: "reports", component: () => import("./src/pages/ReportsPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
    // Customer-side
    { path: "/portal/customer/memberships", component: () => import("./src/pages/MyMembershipPage") },
  ],

  api: ROUTES,

  storefront: {
    blocks: [
      {
        id: "membership-paywall",
        label: "Membership paywall",
        description: "Gates rendered children unless the visitor has an active subscription on a plan in `requirePlanIds`. Renderer ships in T3's website-editor.",
        category: "membership",
        defaultProps: { requirePlanIds: [] as string[] },
      },
      {
        id: "membership-signup",
        label: "Membership signup",
        description: "Pricing-tier picker. Lists active plans, posts to `/me/subscribe`. Renderer ships in T3.",
        category: "membership",
        defaultProps: { layout: "horizontal" as "horizontal" | "vertical", showAnnual: true },
      },
      {
        id: "membership-tier-grid",
        label: "Membership tier grid",
        description: "Visual grid of all active plans with feature bullets and CTAs. Renderer ships in T3.",
        category: "membership",
        defaultProps: { columns: 3, highlightPlanId: undefined as string | undefined },
      },
    ],
  },

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          { id: "defaultCurrency", label: "Default currency for new plans", type: "select", default: "usd",
            options: [
              { value: "usd", label: "USD" },
              { value: "gbp", label: "GBP" },
              { value: "eur", label: "EUR" },
            ] },
          { id: "defaultTrialDays", label: "Default trial length (days)", type: "number", default: 0 },
          { id: "billingPortalReturnUrl", label: "Billing portal return URL", type: "url", placeholder: "/portal/customer/memberships",
            helpText: "Override the default return URL for the Stripe Customer Portal." },
        ],
      },
      {
        id: "branding",
        label: "Member portal branding",
        fields: [
          { id: "memberPortalHeading", label: "Heading on My Membership page", type: "text", default: "Your membership" },
          { id: "showAnnualToggle", label: "Show monthly/annual toggle on signup", type: "boolean", default: true },
        ],
      },
    ],
  },

  features: [
    { id: "free-tier", label: "Free tier (Bronze)", default: true,
      description: "Allow $0 plans that don't require a Stripe round-trip." },
    { id: "annual-billing", label: "Annual billing", default: true,
      description: "Allow plans to expose annual prices alongside monthly." },
    { id: "trial", label: "Free trials", default: true,
      description: "Allow plans to define trial lengths in days." },
    { id: "discount-benefits", label: "Discount benefits", default: true,
      description: "Allow benefits with `category: discount` to feed an integer % off into ecommerce orders. Ecommerce reads via a future cross-plugin port (T2 follow-up)." },
  ],

  // Idempotent. Seeds the three default plans (Bronze / Silver / Gold)
  // for the new client install. Bronze is $0 (no Stripe roundtrip);
  // Silver + Gold create Stripe Prices via the StripePort. Foundation
  // wires Stripe keys in by reading the ecommerce install's config in
  // the same (agencyId, clientId) scope — see chapter "Foundation
  // pending" §1.
  onInstall: async (ctx: PluginCtx, setupAnswers: Record<string, string>) => {
    if (!ctx.clientId) return;
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return;
    const currency = (setupAnswers.currency as Currency | undefined)
      ?? (ctx.install.config.defaultCurrency as Currency | undefined)
      ?? "usd";
    await c.plans.seedDefaults(ctx.actor, currency);
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    if (!ctx.clientId) return { ok: false, message: "missing clientId" };
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "memberships foundation not registered" };
    const [plans, subscribers] = await Promise.all([c.plans.list(), c.subscriptions.list()]);
    const active = subscribers.filter(s => s.status === "active" || s.status === "trialing").length;
    return {
      ok: true,
      message: `${plans.length} plans, ${active} active subscribers`,
      components: {
        plans: { ok: plans.length > 0, message: `${plans.length} rows` },
        subscribers: { ok: true, message: `${subscribers.length} total · ${active} active` },
      },
    };
  },
};

export default manifest;
