// The one canonical list of Finance sections.
//
// Before this existed, the finance sub-navigation was defined twice — once in
// the plugin manifest's `navItems` (index.ts) and once in the in-page tab bar
// (FinanceNav.tsx) — and the two had drifted: different labels ("Reports" vs
// "Revenue", "Operations" vs "Finance operations", "Overview" vs "Finance
// overview") and different ordering. Both now derive from this single list, so
// they can never drift apart again.
//
// This module is PURE DATA (no runtime imports) so it is safe to import from
// both the server-side manifest and the nav component. Icons live with the
// renderer (FinanceNav) to keep this dependency-free. Hrefs are full literals
// (not templated) so they stay greppable for the nav-audit contract tests.

export type FinanceSectionKey =
  | "overview"
  | "income"
  | "expenses"
  | "invoices"
  | "reports"
  | "budgets"
  | "operations"
  | "planning"
  | "plans"
  | "deposits"
  | "settings";

// Role sets, matching the plugin's agency scope policy. Kept as literal unions
// so `[...roles]` assigns cleanly to a nav item's `visibleToRoles`.
export const FINANCE_VIEWER_ROLES = ["agency-owner", "agency-manager", "agency-staff"] as const;
export const FINANCE_ADMIN_ROLES = ["agency-owner", "agency-manager"] as const;

export interface FinanceSection {
  key: FinanceSectionKey;
  label: string;
  href: string;
  order: number;
  roles: readonly ("agency-owner" | "agency-manager" | "agency-staff")[];
}

export const FINANCE_SECTIONS: readonly FinanceSection[] = [
  { key: "overview",   label: "Overview",   href: "/portal/agency/agency-finance",            order: 10,  roles: FINANCE_VIEWER_ROLES },
  { key: "income",     label: "Income",     href: "/portal/agency/agency-finance/payments",   order: 20,  roles: FINANCE_VIEWER_ROLES },
  { key: "expenses",   label: "Expenses",   href: "/portal/agency/agency-finance/expenses",   order: 30,  roles: FINANCE_VIEWER_ROLES },
  { key: "invoices",   label: "Invoices",   href: "/portal/agency/agency-finance/invoices",   order: 40,  roles: FINANCE_VIEWER_ROLES },
  { key: "reports",    label: "Reports",    href: "/portal/agency/agency-finance/reports",    order: 50,  roles: FINANCE_VIEWER_ROLES },
  { key: "budgets",    label: "Budgets",    href: "/portal/agency/agency-finance/budgets",    order: 60,  roles: FINANCE_ADMIN_ROLES },
  { key: "operations", label: "Operations", href: "/portal/agency/agency-finance/operations", order: 70,  roles: FINANCE_ADMIN_ROLES },
  { key: "planning",   label: "Planning",   href: "/portal/agency/agency-finance/planning",   order: 80,  roles: FINANCE_ADMIN_ROLES },
  { key: "plans",      label: "Plans",      href: "/portal/agency/agency-finance/plans",      order: 90,  roles: FINANCE_VIEWER_ROLES },
  { key: "deposits",   label: "Deposits",   href: "/portal/agency/agency-finance/lock-in",    order: 100, roles: FINANCE_VIEWER_ROLES },
  { key: "settings",   label: "Settings",   href: "/portal/agency/agency-finance/settings",   order: 110, roles: FINANCE_ADMIN_ROLES },
];
