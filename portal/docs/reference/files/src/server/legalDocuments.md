# `src/server/legalDocuments.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (5)

- `listLegalDocuments(agencyId: string): LegalDocument[]`
- `getLegalDocument(agencyId: string, id: string): LegalDocument | null`
- `createLegalDocument(input: Omit<LegalDocument, "createdAt" | "updatedAt">): LegalDocument`
- `updateLegalDocument(agencyId: string, id: string, patch: Partial<Pick<LegalDocument, "title" | "category" | "status" | "counterparty" | "reference" | "effectiveAt" | "expiresAt" | "reminderAt" | "notes" | "companyIds">>, actorUserId: strin…`
- `deleteLegalDocument(agencyId: string, id: string): LegalDocument | null`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (10)

- [`src/app/api/portal/company/legal/content/route.ts`](../app/api/portal/company/legal/content/route.md)
- [`src/app/api/portal/company/legal/route.ts`](../app/api/portal/company/legal/route.md)
- [`src/app/api/portal/company/legal/upload/route.ts`](../app/api/portal/company/legal/upload/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/built-ins/modules/agency-finance/src/pages/OperationsPage.tsx`](../built-ins/modules/agency-finance/src/pages/OperationsPage.md)
- [`src/lib/server/businessIssueRadar.ts`](../lib/server/businessIssueRadar.md)
- [`src/lib/server/operationalAlerts.ts`](../lib/server/operationalAlerts.md)
- [`src/lib/server/radarSourceInspection.ts`](../lib/server/radarSourceInspection.md)

