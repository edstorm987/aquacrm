# `src/lib/server/auth/effectiveRole.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (3)

- `interface EffectiveRole (3 members)`
- `effectiveRole(session: SessionPayload | null | undefined): EffectiveRole`
- `hasAllPermissions(effective: EffectiveRole, requires: readonly PermissionKey[]): boolean`

## Depends on (3)

- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](../../built-ins/modules/agency-hr/src/lib/domain.md)
- [`src/built-ins/modules/agency-hr/src/server/roles.ts`](../../built-ins/modules/agency-hr/src/server/roles.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (12)

- [`src/app/api/auth/dev-mode/route.ts`](../../app/api/auth/dev-mode/route.md)
- [`src/app/api/auth/preview-as-client-at-phase/route.ts`](../../app/api/auth/preview-as-client-at-phase/route.md)
- [`src/app/api/portal/phases/apply/route.ts`](../../app/api/portal/phases/apply/route.md)
- [`src/app/api/portal/phases/delete/route.ts`](../../app/api/portal/phases/delete/route.md)
- [`src/app/api/portal/phases/upsert/route.ts`](../../app/api/portal/phases/upsert/route.md)
- [`src/app/portal/account/permissions/page.tsx`](../../app/portal/account/permissions/page.md)
- [`src/app/portal/agency/layout.tsx`](../../app/portal/agency/layout.md)
- [`src/app/portal/agency/phases/[phaseId]/page.tsx`](../../app/portal/agency/phases/[phaseId]/page.md)
- [`src/app/portal/agency/phases/page.tsx`](../../app/portal/agency/phases/page.md)
- [`src/app/portal/clients/page.tsx`](../../app/portal/clients/page.md)
- [`src/lib/server/RequirePermission.tsx`](./RequirePermission.md)
- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)

