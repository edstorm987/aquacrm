// `@aqua/plugin-agency-finance` — invoices, expenses, revenue
// dashboard. Agency-internal companion to agency-HR.
// `scopePolicy: "agency"`, always available as a Milesymedia built-in.

import type {
  AquaPlugin,
  HealthStatus,
  PluginCtx,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";
import { FINANCE_SECTIONS, financePageRoles } from "./src/lib/sections";

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

  core: true,
  scopePolicy: "agency",
  // Legal hold: invoices/payments survive client erasure — statutory finance
  // retention + the legal-defence record (GDPR Art. 17(3)(e)).
  dataDisposition: "retain",

  // Derived from the one canonical section list (./src/lib/sections.ts) so the
  // sidebar nav and the in-page FinanceNav tabs can never drift apart. NOTE:
  // in the current AquaOasis-Web sidebar these items are filtered by the
  // canonical-id allow-list in sidebarLayout.ts, so the visible sidebar entry
  // is the foundation's single "finance" item — these describe the sections
  // for the in-page nav + future chrome. See docs hazards for the full story.
  navItems: FINANCE_SECTIONS.map(section => ({
    id: `agency-finance.${section.key}`,
    label: section.label,
    href: section.href,
    panelId: "agency-finance",
    order: section.order,
    visibleToRoles: [...section.roles],
  })),

  // `visibleToRoles` here is the REAL gate — the host calls
  // `pluginPageAllowedRoles(page)` and 404s before the component is imported,
  // so Operations never renders (and never SSRs salaries) for staff. Derived
  // from the same section list as `navItems` above via `financePageRoles`, so
  // the tab you cannot see is also the page you cannot open.
  pages: [
    { path: "", component: () => import("./src/pages/FounderDashboardPage"), visibleToRoles: [...financePageRoles("")] },
    { path: "invoices", component: () => import("./src/pages/InvoicesPage"), visibleToRoles: [...financePageRoles("invoices")] },
    { path: "invoices/:id", component: () => import("./src/pages/InvoiceDetailPage"), visibleToRoles: [...financePageRoles("invoices/:id")] },
    { path: "expenses", component: () => import("./src/pages/ExpensesPage"), visibleToRoles: [...financePageRoles("expenses")] },
    { path: "reports", component: () => import("./src/pages/ReportsPage"), visibleToRoles: [...financePageRoles("reports")] },
    { path: "budgets", component: () => import("./src/pages/BudgetsPage"), visibleToRoles: [...financePageRoles("budgets")] },
    { path: "planning", component: () => import("./src/pages/PlanningPage"), visibleToRoles: [...financePageRoles("planning")] },
    { path: "operations", component: () => import("./src/pages/OperationsPage"), visibleToRoles: [...financePageRoles("operations")] },
    { path: "payments", component: () => import("./src/pages/PaymentsPage"), visibleToRoles: [...financePageRoles("payments")] },
    { path: "plans", component: () => import("./src/pages/PlansPage"), visibleToRoles: [...financePageRoles("plans")] },
    { path: "lock-in", component: () => import("./src/pages/LockInPage"), visibleToRoles: [...financePageRoles("lock-in")] },
    { path: "settings", component: () => import("./src/pages/SettingsPage"), visibleToRoles: [...financePageRoles("settings")] },
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
            default: "gbp",
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
          {
            id: "taxReserveRate",
            label: "Indicative tax reserve (%)",
            type: "number",
            default: 20,
            helpText: "Planning reserve only. Your accountant should confirm the appropriate rate.",
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
      {
        id: "online-payments",
        label: "Online payments (Stripe)",
        fields: [
          // Both keys land in the encrypted integrations vault under the
          // `stripe` provider — NEVER on `install.config`, which is handed to
          // page props and therefore to the browser. `secretVault` is what
          // makes that routing happen; the registry validator refuses a
          // password field without it.
          {
            id: "stripeSecretKey",
            label: "Stripe secret key",
            type: "password",
            placeholder: "sk_test_… (start with a TEST key)",
            helpText: "Your own Stripe key — money flows to your Stripe account directly; the app never holds funds. Use a TEST key (sk_test_…) until you have verified the flow end to end.",
            secretVault: { provider: "stripe", field: "secretKey" },
          },
          {
            id: "stripeWebhookSecret",
            label: "Stripe webhook signing secret",
            type: "password",
            placeholder: "whsec_…",
            helpText: "From your Stripe webhook endpoint. Point the endpoint at /api/portal/agency-finance/stripe/webhook?agencyId=<your agency id>. Required to verify incoming events.",
            secretVault: { provider: "stripe", field: "webhookSecret" },
          },
          {
            id: "successUrl",
            label: "Payment success URL (optional)",
            type: "text",
            placeholder: "Defaults to the invoice page",
          },
          {
            id: "cancelUrl",
            label: "Payment cancel URL (optional)",
            type: "text",
            placeholder: "Defaults to the invoice page",
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
