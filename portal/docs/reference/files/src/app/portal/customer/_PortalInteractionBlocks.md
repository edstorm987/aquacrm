# `src/app/portal/customer/_PortalInteractionBlocks.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

_No file-level doc-comment. Purpose inferred from its path (App routes & UI — src/app/) and its exports below._

## Exports (3)

- `PortalRequestBlock({ clientId, title, eyebrow, body, providerName, readOnly, dark, centered, surfaceClass, requestType = "choose", actionLabel, initialRequests, }: SharedProps & { requestType?: ClientPortalRequestType; actionLabel: string;…`
- `PortalApprovalBlock({ clientId, title, eyebrow, body, providerName, readOnly, dark, centered, surfaceClass, approvalType = "all", initialApprovals, }: SharedProps & { approvalType?: ClientPortalApprovalType; initialApprovals: ClientApprova…`
- `PortalFileUploadBlock({ clientId, title, eyebrow, body, readOnly, dark, centered, surfaceClass, uploadCategory = "brief", actionLabel, }: Omit<SharedProps, "providerName"> & { uploadCategory?: ClientPortalUploadCategory; actionLabel: strin…`

## Depends on (3)

- [`src/app/api/tenants/client-approvals/route.ts`](../../api/tenants/client-approvals/route.md)
- [`src/app/api/tenants/client-requests/route.ts`](../../api/tenants/client-requests/route.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (1)

- [`src/app/portal/customer/_PortalPageComposition.tsx`](./_PortalPageComposition.md)

