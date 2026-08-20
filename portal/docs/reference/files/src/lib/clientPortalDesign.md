# `src/lib/portal/clientPortalDesign.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (10)

- `CLIENT_PORTAL_TEMPLATE_ID`
- `CLIENT_PORTAL_TEMPLATE_NAME`
- `CLIENT_PORTAL_MODES: ClientPortalMode[]`
- `CLIENT_PORTAL_SECTIONS: ClientPortalSectionId[]`
- `EMPTY_CLIENT_PORTAL_CUSTOM_CODE: ClientPortalCustomCode`
- `STUNNING_STANDARD_PORTAL: ClientPortalDesignDocument`
- `clonePortalDesign(document: ClientPortalDesignDocument = STUNNING_STANDARD_PORTAL): ClientPortalDesignDocument`
- `normalisePortalDesign(value: unknown, fallback: ClientPortalDesignDocument = STUNNING_STANDARD_PORTAL): ClientPortalDesignDocument`
- `portalCustomCode(document: ClientPortalDesignDocument): ClientPortalCustomCode`
- `formatPortalCopy(value: string, tokens: Record<string, string>): string`

## Depends on (2)

- [`src/lib/portal/clientPortalBuilder.ts`](./clientPortalBuilder.md)
- [`src/server/types.ts`](../server/types.md)

## Used by (5)

- [`src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx`](../app/portal/agency/portals/editor/_ClientPortalStudio.md)
- [`src/app/portal/customer/_CustomerPortalChrome.tsx`](../app/portal/customer/_CustomerPortalChrome.md)
- [`src/app/portal/customer/_CustomerPortalViews.tsx`](../app/portal/customer/_CustomerPortalViews.md)
- [`src/app/portal/customer/_PortalPageComposition.tsx`](../app/portal/customer/_PortalPageComposition.md)
- [`src/server/clientPortalDesigns.ts`](../server/clientPortalDesigns.md)

