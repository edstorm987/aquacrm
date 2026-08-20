# `src/server/legalDocuments.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (10)

- `COMPLIANCE_DECLARATION_PREFIX`
- `HIPAA_TRACK_REFERENCE`
- `listLegalDocuments(agencyId: string): LegalDocument[]`
- `listComplianceDeclarations(agencyId: string): LegalDocument[]`
- `getLegalDocument(agencyId: string, id: string): LegalDocument | null`
- `isHipaaTrackEnabled(agencyId: string, companyId: string | null): boolean`
- `setHipaaTrack(input: { agencyId: string; companyId: string | null; companyName: string; enabled: boolean; actorUserId: string; }): LegalDocument | null`
- `createLegalDocument(input: Omit<LegalDocument, "createdAt" | "updatedAt">): LegalDocument`
- `updateLegalDocument(agencyId: string, id: string, patch: Partial<Pick<LegalDocument, "title" | "category" | "status" | "counterparty" | "reference" | "effectiveAt" | "expiresAt" | "reminderAt" | "notes" | "companyIds">>, actorUserId: strin…`
- `deleteLegalDocument(agencyId: string, id: string): LegalDocument | null`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (12)

- [`src/app/api/portal/company/legal/content/route.ts`](../app/api/portal/company/legal/content/route.md)
- [`src/app/api/portal/company/legal/route.ts`](../app/api/portal/company/legal/route.md)
- [`src/app/api/portal/company/legal/upload/route.ts`](../app/api/portal/company/legal/upload/route.md)
- [`src/app/api/portal/compliance/frameworks/route.ts`](../app/api/portal/compliance/frameworks/route.md)
- [`src/app/api/portal/search/route.ts`](../app/api/portal/search/route.md)
- [`src/app/portal/agency/company/page.tsx`](../app/portal/agency/company/page.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/built-ins/modules/agency-finance/src/pages/OperationsPage.tsx`](../built-ins/modules/agency-finance/src/pages/OperationsPage.md)
- [`src/lib/server/compliancePostureSource.ts`](../lib/server/compliancePostureSource.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../lib/server/inbox/operationalAlerts.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](../lib/server/radar/businessIssueRadar.md)
- [`src/lib/server/radar/radarSourceInspection.ts`](../lib/server/radar/radarSourceInspection.md)

