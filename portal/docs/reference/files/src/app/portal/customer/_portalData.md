# `src/app/portal/customer/_portalData.ts`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

_No file-level doc-comment. Purpose inferred from its path (App routes & UI — src/app/) and its exports below._

## Exports (14)

- `type CustomerPortalMode`
- `interface CustomerFile (13 members)`
- `interface CustomerProperty (8 members)`
- `interface CustomerInvoice (11 members)`
- `interface CustomerRecordNote (2 members)`
- `interface CustomerRecordLink (3 members)`
- `interface CustomerRecordEntry (8 members)`
- `interface CustomerRecordMessage (7 members)`
- `interface CustomerRecord (9 members)`
- `interface CustomerPortalData (32 members)`
- `portalMode(value: unknown): CustomerPortalMode`
- `customerVisibleInvoices(invoices: Invoice[]): Invoice[]`
- `async loadCustomerPortalData(client: Client, fallbackName: string, providerName = "Milesymedia", options: { scope?: ClientPortalDesignScope; templateId?: string; productIds?: string[]; draft?: boolean; audience?: "customer" | "agency"; } =…`
- `customerPortalModeLabel(data: CustomerPortalData): string`

## Depends on (21)

- [`src/app/api/tenants/client-approvals/route.ts`](../../api/tenants/client-approvals/route.md)
- [`src/app/api/tenants/client-requests/route.ts`](../../api/tenants/client-requests/route.md)
- [`src/app/api/tenants/customer-project-brief/route.ts`](../../api/tenants/customer-project-brief/route.md)
- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](../../../built-ins/modules/agency-finance/src/lib/domain.md)
- [`src/built-ins/modules/agency-finance/src/server/index.ts`](../../../built-ins/modules/agency-finance/src/server/index.md)
- [`src/lib/clientContracts.ts`](../../../lib/clientContracts.md)
- [`src/lib/clientPaymentPlans.ts`](../../../lib/clientPaymentPlans.md)
- [`src/lib/clientRelationshipRecord.ts`](../../../lib/clientRelationshipRecord.md)
- [`src/lib/clientRequests.ts`](../../../lib/clientRequests.md)
- [`src/lib/portalProductModules.ts`](../../../lib/portalProductModules.md)
- [`src/lib/portalProductWorkspaces.ts`](../../../lib/portalProductWorkspaces.md)
- [`src/lib/portalProducts.ts`](../../../lib/portalProducts.md)
- [`src/lib/productAssignments.ts`](../../../lib/productAssignments.md)
- [`src/lib/server/inboxStore.ts`](../../../lib/server/inboxStore.md)
- [`src/lib/server/pluginStorage.ts`](../../../lib/server/pluginStorage.md)
- [`src/lib/server/websiteEnquiries.ts`](../../../lib/server/websiteEnquiries.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/agencyProducts.ts`](../../../server/agencyProducts.md)
- [`src/server/clientPortalDesigns.ts`](../../../server/clientPortalDesigns.md)
- [`src/server/pluginInstalls.ts`](../../../server/pluginInstalls.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (10)

- [`scripts/smoke-customer-portal-attention.test.ts`](../../../../scripts/smoke-customer-portal-attention.test.md)
- [`src/app/client-preview/[clientId]/page.tsx`](../../client-preview/[clientId]/page.md)
- [`src/app/embed/account/page.tsx`](../../embed/account/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../clients/[clientId]/page.md)
- [`src/app/portal/customer/_CustomerPortalActions.tsx`](./_CustomerPortalActions.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](./_CustomerPortalViews.md)
- [`src/app/portal/customer/_PortalPageComposition.tsx`](./_PortalPageComposition.md)
- [`src/app/portal/customer/_ProductWorkspaceApplication.tsx`](./_ProductWorkspaceApplication.md)
- [`src/app/portal/customer/layout.tsx`](./layout.md)
- [`src/lib/customerPortalAttention.ts`](../../../lib/customerPortalAttention.md)

