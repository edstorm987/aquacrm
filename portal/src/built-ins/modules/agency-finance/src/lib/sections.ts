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

// ─── Page access control ──────────────────────────────────────────────────
//
// The section list above drives NAV VISIBILITY. Hiding a link is not access
// control: before 22 Aug 2026 the manifest's `pages[]` declared no roles at
// all, so `pluginPageAllowedRoles(page)` returned `undefined`, the host's only
// remaining gate was `requireRole(AGENCY_ROLES)`, and an `agency-staff` member
// could open /budgets, /operations, /planning and /settings by typing the URL
// — with Operations handing over compensation profiles and payments in its SSR
// props before any client-side 403 could fire.
//
// The gate now lives on the manifest, derived from the SAME list as the nav so
// the two can never disagree, and is enforced by the host in one place for
// every plugin page.

// The mount point every section href hangs off.
const FINANCE_MOUNT = "/portal/agency/agency-finance";

// The manifest page path a section href resolves to. "" is the index page.
export function financeSectionPagePath(section: FinanceSection): string {
  return section.href === FINANCE_MOUNT ? "" : section.href.slice(FINANCE_MOUNT.length + 1);
}

const FINANCE_PAGE_ROLES: Readonly<Record<string, FinanceSection["roles"]>> =
  Object.fromEntries(FINANCE_SECTIONS.map(section => [financeSectionPagePath(section), section.roles]));

// Roles allowed to open a manifest page path. A detail page (`invoices/:id`)
// inherits its parent section's roles; anything with no section behind it
// falls back to the viewer set rather than to "everyone the scope gate lets
// in", so a newly added page is never MORE open than the section it sits under.
export function financePageRoles(path: string): FinanceSection["roles"] {
  const direct = FINANCE_PAGE_ROLES[path];
  if (direct) return direct;
  const parent = path.includes("/") ? FINANCE_PAGE_ROLES[path.slice(0, path.lastIndexOf("/"))] : undefined;
  return parent ?? FINANCE_VIEWER_ROLES;
}
