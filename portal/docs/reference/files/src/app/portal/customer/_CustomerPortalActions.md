# `src/app/portal/customer/_CustomerPortalActions.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

_No file-level doc-comment. Purpose inferred from its path (App routes & UI — src/app/) and its exports below._

## Exports (7)

- `interface CustomerStageTask (4 members)`
- `CustomerStageWorkspace({ clientId, mode, tasks, properties = [], readOnly = false, providerName = "Milesymedia", }: { clientId: string; mode: CustomerPortalMode; tasks: CustomerStageTask[]; properties?: CustomerProperty[]; readOnly?: boole…`
- `CustomerProjectBriefForm({ clientId, initialBrief, readOnly = false, providerName = "Milesymedia", }: { clientId: string; initialBrief: CustomerProjectBrief; readOnly?: boolean; providerName?: string; })`
- `CustomerApprovals({ clientId, initialApprovals, readOnly = false, providerName = "Milesymedia", }: { clientId: string; initialApprovals: ClientApproval[]; readOnly?: boolean; providerName?: string; })`
- `CustomerSupportForm({ clientId, initialRequests, readOnly = false, providerName = "Milesymedia", }: { clientId: string; initialRequests: ClientRequest[]; readOnly?: boolean; providerName?: string; })`
- `CustomerFileLinkForm({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean })`
- `CustomerAgreements({ clientId, initialContracts, readOnly = false, providerName = "Milesymedia", }: { clientId: string; initialContracts: ClientContract[]; readOnly?: boolean; providerName?: string; })`

## Depends on (6)

- [`src/app/api/tenants/client-approvals/route.ts`](../../api/tenants/client-approvals/route.md)
- [`src/app/api/tenants/client-requests/route.ts`](../../api/tenants/client-requests/route.md)
- [`src/app/api/tenants/customer-project-brief/route.ts`](../../api/tenants/customer-project-brief/route.md)
- [`src/app/portal/customer/_portalData.ts`](./_portalData.md)
- [`src/lib/clientContracts.ts`](../../../lib/clientContracts.md)
- [`src/lib/formatDateTime.ts`](../../../lib/formatDateTime.md)

## Used by (1)

- [`src/app/portal/customer/_CustomerPortalViews.tsx`](./_CustomerPortalViews.md)

