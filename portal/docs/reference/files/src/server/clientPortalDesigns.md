# `src/server/clientPortalDesigns.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (20)

- `type ClientPortalDesignScope`
- `type ClientPortalDesignRecord`
- `portalTemplateRecordId(agencyId: string, slug = CLIENT_PORTAL_TEMPLATE_ID): string`
- `productPortalTemplateRecordId(agencyId: string, productId: string): string`
- `portalInstanceRecordId(agencyId: string, clientId: string): string`
- `ensureStunningPortalTemplate(agencyId: string, actorUserId = "system"): ClientPortalTemplateRecord`
- `ensureProductPortalTemplate(agencyId: string, product: AgencyProduct, actorUserId = "system"): ClientPortalTemplateRecord`
- `ensureProductPortalTemplates(agencyId: string, products: AgencyProduct[], actorUserId = "system"): ClientPortalTemplateRecord[]`
- `listClientPortalTemplates(agencyId: string): ClientPortalTemplateRecord[]`
- `getClientPortalTemplate(agencyId: string, templateId?: string): ClientPortalTemplateRecord | null`
- `ensureClientPortalInstance(input: { agencyId: string; clientId: string; actorUserId?: string; accentColor?: string; templateId?: string; }): ClientPortalInstanceRecord`
- `getClientPortalInstance(agencyId: string, clientId: string): ClientPortalInstanceRecord | null`
- `resolveClientPortalDesign(input: { agencyId: string; clientId: string; scope?: ClientPortalDesignScope; templateId?: string; draft?: boolean; fallbackAccentColor?: string; }): ClientPortalDesignDocument`
- `getPortalDesignRecord(input: { agencyId: string; scope: ClientPortalDesignScope; recordId?: string; clientId?: string; actorUserId?: string; accentColor?: string; templateId?: string; }): ClientPortalDesignRecord | null`
- `savePortalDesignDraft(input: { agencyId: string; scope: ClientPortalDesignScope; recordId: string; document: unknown; actorUserId: string; }): ClientPortalDesignRecord | null`
- `publishPortalDesign(input: { agencyId: string; scope: ClientPortalDesignScope; recordId: string; actorUserId: string; label?: string; }): ClientPortalDesignRecord | null`
- `checkpointPortalDesign(input: { agencyId: string; scope: ClientPortalDesignScope; recordId: string; actorUserId: string; label: string; }): ClientPortalDesignRecord | null`
- `restorePortalDesignVersion(input: { agencyId: string; scope: ClientPortalDesignScope; recordId: string; versionId: string; actorUserId: string; }): ClientPortalDesignRecord | null`
- `refreshProductPortalTemplateFromMaster(input: { agencyId: string; templateId: string; actorUserId: string; }): ClientPortalTemplateRecord | null`
- `resetClientPortalFromTemplate(input: { agencyId: string; clientId: string; actorUserId: string; }): ClientPortalInstanceRecord | null`

## Depends on (5)

- [`src/lib/portal/clientPortalDesign.ts`](../lib/portal/clientPortalDesign.md)
- [`src/lib/portal/portalProductModules.ts`](../lib/portal/portalProductModules.md)
- [`src/lib/portal/portalProducts.ts`](../lib/portal/portalProducts.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (9)

- [`src/app/api/portal/client-portal-design/route.ts`](../app/api/portal/client-portal-design/route.md)
- [`src/app/api/portal/products/rollout/route.ts`](../app/api/portal/products/rollout/route.md)
- [`src/app/api/portal/products/route.ts`](../app/api/portal/products/route.md)
- [`src/app/api/tenants/customer-portal-control/route.ts`](../app/api/tenants/customer-portal-control/route.md)
- [`src/app/portal/agency/portals/_portalWorkspaceData.ts`](../app/portal/agency/portals/_portalWorkspaceData.md)
- [`src/app/portal/agency/portals/editor/page.tsx`](../app/portal/agency/portals/editor/page.md)
- [`src/app/portal/agency/products/[productId]/page.tsx`](../app/portal/agency/products/[productId]/page.md)
- [`src/app/portal/customer/_portalData.ts`](../app/portal/customer/_portalData.md)
- [`src/server/clientPortalSetup.ts`](./clientPortalSetup.md)

