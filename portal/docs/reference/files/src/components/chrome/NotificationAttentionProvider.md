# `src/components/chrome/NotificationAttentionProvider.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

_No file-level doc-comment. Purpose inferred from its path (Components — src/components/) and its exports below._

## Exports (6)

- `NotificationAttentionProvider({ initialAlerts, children, clientId, }: { initialAlerts: OperationalAlertView[]; children: ReactNode; clientId?: string; })`
- `useNotificationAttention(): AttentionContextValue | null`
- `useAttentionMatches({ hrefs = [], prefixHrefs = [], categories = [], clientCategories = [], clientId, allForClient = false, navId, all = false, pool = "focus", }: { hrefs?: string[]; prefixHrefs?: string[]; categories?: OperationalAlertCat…`
- `useUnresolvedAttentionMatches({ navId, clientId, }: { navId: string; clientId?: string; }): OperationalAlertView[]`
- `AttentionDot({ href, hrefs, prefixHref, prefixHrefs, categories, all, className = "", }: { href?: string; hrefs?: string[]; prefixHref?: string; prefixHrefs?: string[]; categories?: OperationalAlertCategory[]; all?: boolean; className?: st…`
- `attentionTitle(alerts: OperationalAlertView[]): string`

## Depends on (2)

- [`src/lib/intelligence/attentionProtection.ts`](../../lib/intelligence/attentionProtection.md)
- [`src/lib/intelligence/operationalAttention.ts`](../../lib/intelligence/operationalAttention.md)

## Used by (15)

- [`src/app/portal/agency/actions/_ActionsWorkspace.tsx`](../../app/portal/agency/actions/_ActionsWorkspace.md)
- [`src/app/portal/agency/company/_CompanyWorkspace.tsx`](../../app/portal/agency/company/_CompanyWorkspace.md)
- [`src/app/portal/agency/development/_DevelopmentNav.tsx`](../../app/portal/agency/development/_DevelopmentNav.md)
- [`src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx`](../../app/portal/agency/fulfilment/_FulfilmentWorkspace.md)
- [`src/app/portal/agency/inbox/_MasterInbox.tsx`](../../app/portal/agency/inbox/_MasterInbox.md)
- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../app/portal/agency/marketing/page.md)
- [`src/app/portal/clients/[clientId]/_OverviewTabs.tsx`](../../app/portal/clients/[clientId]/_OverviewTabs.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../app/portal/clients/[clientId]/layout.md)
- [`src/app/portal/clients/_PeopleHub.tsx`](../../app/portal/clients/_PeopleHub.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/built-ins/modules/agency-finance/src/components/FinanceNav.tsx`](../../built-ins/modules/agency-finance/src/components/FinanceNav.md)
- [`src/components/chrome/NotificationCentreButton.tsx`](./NotificationCentreButton.md)
- [`src/components/chrome/ProfileMenu.tsx`](./ProfileMenu.md)
- [`src/components/chrome/SidebarNavLink.tsx`](./SidebarNavLink.md)

