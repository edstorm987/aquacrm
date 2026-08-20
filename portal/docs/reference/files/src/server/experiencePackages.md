# `src/server/experiencePackages.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (6)

- `interface ExperiencePackageInput (14 members)`
- `listExperiencePackages(agencyId: string, includeArchived = false): ExperiencePackage[]`
- `getExperiencePackage(agencyId: string, id?: string): ExperiencePackage | null`
- `createExperiencePackage(agencyId: string, input: ExperiencePackageInput, actorUserId: string): ExperiencePackage`
- `updateExperiencePackage(agencyId: string, id: string, input: Partial<ExperiencePackageInput>, actorUserId: string): ExperiencePackage | null`
- `deleteExperiencePackage(agencyId: string, id: string): boolean`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (4)

- [`scripts/smoke-experience-commerce.test.ts`](../../scripts/smoke-experience-commerce.test.md)
- [`src/app/api/tenants/experience-packages/route.ts`](../app/api/tenants/experience-packages/route.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../app/portal/agency/you-deserve-it/page.md)
- [`src/server/clientDelight.ts`](./clientDelight.md)

