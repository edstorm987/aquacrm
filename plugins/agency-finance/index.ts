// `@aqua/plugin-agency-finance` — invoices, expenses, revenue
// dashboard. Agency-internal companion to agency-HR.
// `scopePolicy: "agency"`, `core: false`, opt-in.

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
  id: "agency-finance",
  name: "Agency Finance",
  version: "0.1.0",
  status: "alpha",
  category: "core",
  tagline: "Invoices, expenses, and a revenue dashboard for the agency.",
  description:
    "Internal finance for the agency operating the portal. Generate + track " +
    "invoices billed to clients, capture + approve staff expenses against a " +
    "default chart of accounts, and view a trailing-12-month revenue snapshot. " +
    "Manual workflow in v1; Stripe Invoice sync and PDF export are deferred " +
    "to a future round.",

  core: false,
  scopePolicy: "agency",

  navItems: [
    {
      id: "agency-finance.invoices",
      label: "Invoices",
      href: "/portal/agency/agency-finance/invoices",
      panelId: "agency-finance",
      order: 10,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-finance.expenses",
      label: "Expenses",
      href: "/portal/agency/agency-finance/expenses",
      panelId: "agency-finance",
      order: 20,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-finance.reports",
      label: "Revenue",
      href: "/portal/agency/agency-finance/reports",
      panelId: "agency-finance",
      order: 30,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-finance.payments",
      label: "Payments",
      href: "/portal/agency/agency-finance/payments",
      panelId: "agency-finance",
      order: 35,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-finance.plans",
      label: "Plans",
      href: "/portal/agency/agency-finance/plans",
      panelId: "agency-finance",
      order: 40,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-finance.lock-in",
      label: "Lock-in",
      href: "/portal/agency/agency-finance/lock-in",
      panelId: "agency-finance",
      order: 45,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "agency-finance.founder",
      label: "Founder dashboard",
      href: "/portal/agency/agency-finance/founder",
      panelId: "agency-finance",
      order: 50,
      visibleToRoles: [...AGENCY_ADMINS],
    },
    {
      id: "agency-finance.settings",
      label: "Settings",
      href: "/portal/agency/agency-finance/settings",
      panelId: "agency-finance",
      order: 99,
      visibleToRoles: [...AGENCY_ADMINS],
    },
  ],

  pages: [
    { path: "", component: () => import("./src/pages/FounderDashboardPage") },
    { path: "invoices", component: () => import("./src/pages/InvoicesPage") },
    { path: "invoices/:id", component: () => import("./src/pages/InvoiceDetailPage") },
    { path: "expenses", component: () => import("./src/pages/ExpensesPage") },
    { path: "reports", component: () => import("./src/pages/ReportsPage") },
    { path: "payments", component: () => import("./src/pages/PaymentsPage") },
    { path: "plans", component: () => import("./src/pages/PlansPage") },
    { path: "lock-in", component: () => import("./src/pages/LockInPage") },
    { path: "founder", component: () => import("./src/pages/FounderDashboardPage") },
    { path: "settings", component: () => import("./src/pages/SettingsPage") },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultCurrency",
            label: "Default currency",
            type: "select",
            default: "usd",
            options: [
              { value: "usd", label: "USD" },
              { value: "gbp", label: "GBP" },
              { value: "eur", label: "EUR" },
            ],
          },
          {
            id: "defaultPaymentTermsDays",
            label: "Default payment terms (days)",
            type: "number",
            default: 30,
            helpText: "Used as default invoice dueAt = issuedAt + N days. v1 stores; UI uses on create.",
          },
          {
            id: "agencyTaxId",
            label: "Agency tax ID (e.g. VAT/EIN)",
            type: "text",
            placeholder: "GB123456789",
          },
        ],
      },
      {
        id: "approval",
        label: "Approval",
        fields: [
          {
            id: "expenseApprovalThresholdCents",
            label: "Auto-approve expenses below (cents)",
            type: "number",
            default: 0,
            helpText: "Future round — value stored, not yet enforced. v1 keeps approvals manual.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "invoice-html-export", label: "Invoice HTML export", default: true },
    { id: "expense-approvals", label: "Expense approval workflow", default: true },
    { id: "revenue-report", label: "Revenue dashboard", default: true },
  ],

  // Idempotent — seeds the six default expense categories on first
  // install. Foundation must register the agency-finance foundation
  // adapter BEFORE installing this plugin; otherwise seeding silently
  // no-ops (the helper falls back to null).
  onInstall: async (ctx: PluginCtx) => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      storage: ctx.storage,
    });
    if (!c) return;
    await c.categories.seedDefaults(ctx.actor);
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "agency-finance foundation not registered" };
    const [invoices, expenses, categories] = await Promise.all([
      c.invoices.list(),
      c.expenses.list(),
      c.categories.list(),
    ]);
    const sent = invoices.filter(i => i.status === "sent").length;
    const pending = expenses.filter(e => e.status === "pending").length;
    return {
      ok: true,
      message: `${invoices.length} invoices (${sent} outstanding) · ${pending} expenses pending`,
      components: {
        invoices: { ok: true, message: `${invoices.length} rows` },
        expenses: { ok: true, message: `${expenses.length} rows` },
        categories: { ok: categories.length > 0, message: `${categories.length} rows` },
      },
    };
  },
};

export default manifest;
