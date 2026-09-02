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
import { _containerFromCtx, isStripeAvailable } from "./src/server/foundationAdapter";
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
  // Legal hold: subscriptions are payment records, retained as the de-identified
  // legal-defence record. No bespoke `onEraseClient` is needed — a Subscription
  // embeds no name/email (only the member's pseudonymous user token, plan id,
  // billing amounts, and Stripe refs). The member's identity (name/email) lives
  // in the top-level `endCustomers` collection and is deleted by the erasure
  // sweep, so what remains here is already de-identified.
  dataDisposition: "retain",
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
    // Operator pages, all of them. `plans` and `subscribers/:userId` are
    // ORPHANS — no nav entry resolves to either — so until now nothing in the
    // manifest said who a subscriber's detail record is for.
    { path: "", component: () => import("./src/pages/PlansPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "plans", component: () => import("./src/pages/PlansPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "subscribers", component: () => import("./src/pages/SubscribersPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "subscribers/:userId", component: () => import("./src/pages/SubscriberDetailPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "benefits", component: () => import("./src/pages/BenefitsPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    { path: "reports", component: () => import("./src/pages/ReportsPage"), visibleToRoles: [...ADMIN_VIEWERS] },
    // Admin-only in the nav, so admin-only at the door too: the host gates on
    // this, and without it the page was reachable by URL to any role the scope
    // check let in (the agency-finance class bug, 22 Aug 2026).
    { path: "settings", component: () => import("./src/pages/SettingsPage"), visibleToRoles: [...ADMIN_ROLES] },
    // Customer-side. The full URL is the ONLY way onto that surface — see
    // `resolveCustomerPluginPage`. Until 22 Aug 2026 the relative pages above
    // also answered under /portal/customer/memberships/..., which handed a
    // shopper the operator's subscriber list, and the bare
    // /portal/customer/memberships matched the "" index BEFORE this page.
    { path: "/portal/customer/memberships", component: () => import("./src/pages/MyMembershipPage"), visibleToRoles: [...END_CUSTOMER] },
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
          { id: "defaultTrialDays", label: "Default trial length (days)", type: "number", default: 0,
            min: 0, max: 365, step: 1, helpText: "A whole number from 0 to 365. Use 0 for no trial." },
          { id: "billingPortalReturnUrl", label: "Billing portal return path", type: "url", placeholder: "/portal/customer/memberships",
            urlPolicy: "same-origin-path",
            helpText: "A path on this Aqua workspace beginning with / — for example /portal/customer/memberships. External URLs are refused." },
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
    const result = await c.plans.seedDefaults(ctx.actor, currency);
    if (result.failed.length > 0) {
      // Do NOT let a half-seeded install look like a clean one. `seedDefaults`
      // persisted the report the healthcheck reads; say it out loud here too,
      // naming the plans and the reason.
      console.warn(
        `[memberships] onInstall seeded ${result.seeded} of ` +
          `${result.seeded + result.failed.length} default plans for client ${ctx.clientId}. ` +
          `Not created: ${result.failed.map(f => `${f.name} (${f.reason})`).join("; ")}`,
      );
    }
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    if (!ctx.clientId) return { ok: false, message: "missing clientId" };
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      clientId: ctx.clientId,
      storage: ctx.storage,
    });
    if (!c) return { ok: false, message: "memberships foundation not registered" };
    const [plans, subscribers, seedReport] = await Promise.all([
      c.plans.list(),
      c.subscriptions.list(),
      c.plans.getSeedReport(),
    ]);
    const active = subscribers.filter(s => s.status === "active" || s.status === "trialing").length;

    // Row counts alone are not health. Memberships bills through Stripe, so the
    // Stripe port is a component of this plugin's health — an unconfigured one
    // is a visible blind spot, never a silent green.
    const stripeReady = isStripeAvailable({ agencyId: ctx.agencyId, clientId: ctx.clientId });
    const paidPlans = plans.filter(p => p.priceMonthly > 0 || p.priceAnnual > 0).length;

    // A recorded seed failure is only news while that plan is STILL missing.
    // Nothing ever rewrites the report — `seedDefaults` early-returns once any
    // plan exists, and a healthcheck runs against read-only storage — so an
    // operator who wires Stripe and creates Silver + Gold by hand would
    // otherwise be told forever that "2 default plan(s) not created: Silver
    // (Stripe not configured…)". Both halves of that would be false. Reporting
    // a fixed install as broken is the same honesty defect as swallowing the
    // failure was, pointed the other way, so the report is reconciled against
    // the plans that actually exist now.
    const existingPlanNames = new Set(plans.map(p => p.name));
    const seedFailures = (seedReport?.failed ?? []).filter(f => !existingPlanNames.has(f.name));

    const components: NonNullable<HealthStatus["components"]> = {
      plans: { ok: plans.length > 0, message: `${plans.length} rows` },
      subscribers: { ok: true, message: `${subscribers.length} total · ${active} active` },
      stripe: stripeReady
        ? { ok: true, message: "configured via the ecommerce install" }
        : {
            ok: false,
            message:
              "not configured — paid plans, checkout, the billing portal and webhooks are unavailable. " +
              "Add the Stripe secret key in the ecommerce plugin's settings.",
          },
    };
    if (seedFailures.length > 0) {
      components.seed = {
        ok: false,
        message: `${seedFailures.length} default plan(s) not created: ` +
          seedFailures.map(f => `${f.name} (${f.reason})`).join("; "),
      };
    }

    // Unhealthy when something is actually broken: a recorded partial seed, or
    // paid plans that exist with no Stripe to bill them. A deliberately
    // free-only install with no paid plans stays ok, with the Stripe component
    // still stating plainly that it is unconfigured.
    const brokenPaid = !stripeReady && paidPlans > 0;
    const ok = seedFailures.length === 0 && !brokenPaid;
    const notes = [`${plans.length} plans, ${active} active subscribers`];
    if (seedFailures.length > 0) {
      notes.push(`${seedFailures.length} default plan(s) failed to seed`);
    }
    if (brokenPaid) notes.push(`${paidPlans} paid plan(s) but Stripe is not configured`);
    else if (!stripeReady) notes.push("Stripe not configured (free tiers only)");

    return { ok, message: notes.join(" · "), components };
  },
};

export default manifest;
