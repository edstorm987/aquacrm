// `@aqua/plugin-agency-payroll` — internal-team payroll surface.
//
// Soft-pairs `@aqua/plugin-agency-hr` (Staff source-of-truth — Contractor
// rows can optionally link via `staffId`) and `@aqua/plugin-agency-finance`
// (consumes `payroll.payslip.paid` event for invoice reconciliation hint).
// `requires` is declared per the prompt; engine will currently no-op
// gracefully if the deps are absent (matches established soft-pair pattern
// in R013/R014 — strict-require enforcement is a foundation concern).

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
  id: "agency-payroll",
  name: "Payroll",
  version: "0.1.0",
  status: "alpha",
  category: "ops",
  tagline: "Internal-team payroll — periods, payslips, contractors, monthly totals.",
  description:
    "Tracks agency↔staff/contractor pay. Monthly PayPeriod (open/close, " +
    "idempotent open per year-month). Payslip rows (gross/net/currency, " +
    "operator-paste amounts; no real bank/Stripe wiring — production " +
    "wiring is a T6 gate). Idempotent markPaid emits `payroll.payslip.paid` " +
    "ONCE so agency-finance can show a reconciliation hint without " +
    "double-firing on operator double-click. Honesty contract on Reports: " +
    "totalsForPeriod returns hasData = paidCount>0 — empty-state renders " +
    "when no paid payslips. Soft-pairs agency-hr (optional staffId on " +
    "Contractor) and agency-finance (cross-plugin event consumer).",

  core: false,
  scopePolicy: "agency",
  requires: ["agency-hr", "agency-finance"],

  navItems: [
    {
      id: "agency-payroll.periods", label: "Pay periods",
      href: "/portal/agency/agency-payroll",
      panelId: "agency-tools", order: 80, visibleToRoles: [...VIEWERS],
    },
    {
      id: "agency-payroll.payslips", label: "Payslips",
      href: "/portal/agency/agency-payroll/payslips",
      panelId: "agency-tools", order: 81, visibleToRoles: [...VIEWERS],
    },
    {
      id: "agency-payroll.contractors", label: "Contractors",
      href: "/portal/agency/agency-payroll/contractors",
      panelId: "agency-tools", order: 82, visibleToRoles: [...VIEWERS],
    },
    {
      id: "agency-payroll.reports", label: "Reports",
      href: "/portal/agency/agency-payroll/reports",
      panelId: "agency-tools", order: 83, visibleToRoles: [...ADMINS],
    },
  ],

  pages: [
    { path: "",            component: () => import("./src/pages/PeriodsPage") },
    { path: "payslips",    component: () => import("./src/pages/PayslipsPage") },
    { path: "contractors", component: () => import("./src/pages/ContractorsPage") },
    { path: "reports",     component: () => import("./src/pages/ReportsPage") },
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
            default: "GBP",
            options: [
              { value: "GBP", label: "GBP" },
              { value: "USD", label: "USD" },
              { value: "EUR", label: "EUR" },
            ],
          },
        ],
      },
    ],
  },

  features: [
    { id: "contractors", label: "Contractor list", default: true },
    { id: "reports",     label: "Monthly totals reports", default: true },
    { id: "finance-hint", label: "Emit payroll.payslip.paid for agency-finance reconciliation", default: true },
  ],

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({ agencyId: ctx.agencyId, storage: ctx.storage });
    if (!c) return { ok: false, message: "agency-payroll foundation not registered" };
    const periods = await c.periods.list();
    const open = periods.filter(p => p.status === "open").length;
    const slips = await c.payslips.list();
    const unpaid = slips.filter(s => s.paidAt === undefined).length;
    return {
      ok: true,
      message: `${periods.length} period${periods.length === 1 ? "" : "s"} (${open} open) · ${slips.length} payslip${slips.length === 1 ? "" : "s"} (${unpaid} unpaid)`,
      components: {
        periods:  { ok: true, message: `${periods.length} rows` },
        payslips: { ok: true, message: `${slips.length} rows · ${unpaid} unpaid` },
      },
    };
  },
};

export default manifest;
