# `src/built-ins/modules/agency-finance/src/lib/sections.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** The one canonical list of Finance sections.  Before this existed, the finance sub-navigation was defined twice — once in the plugin manifest's `navItems` (index.ts) and once in the in-page tab bar (FinanceNav.tsx) — and the two had drifted: different labels ("Reports" vs "Revenue", "Operations" vs "Finance operations", "Overview" vs "Finance overview") and different ordering. Both now derive from this single list, so they can never drift apart again.  This module is PURE DATA (no runtime imports) so it is safe to import from both the server-side manifest and the nav component. Icons live with the renderer (FinanceNav) to keep this dependency-free. Hrefs are full literals (not templated) so they stay greppable for the nav-audit contract tests.

## Exports (7)

- `type FinanceSectionKey`
- `FINANCE_VIEWER_ROLES`
- `FINANCE_ADMIN_ROLES`
- `interface FinanceSection (5 members)`
- `FINANCE_SECTIONS: readonly FinanceSection[]`
- `financeSectionPagePath(section: FinanceSection): string`
- `financePageRoles(path: string): FinanceSection["roles"]`

## Used by (3)

- [`scripts/smoke-finance-section-gates.test.ts`](../../../../../../scripts/smoke-finance-section-gates.test.md)
- [`src/built-ins/modules/agency-finance/index.ts`](../../index.md)
- [`src/built-ins/modules/agency-finance/src/components/FinanceNav.tsx`](../components/FinanceNav.md)

