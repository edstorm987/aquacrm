# `src/engines/sop/server/sopGuides.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (7)

- `listSopGuides(agencyId: string): SopGuide[]`
- `getSopGuide(agencyId: string, id: string): SopGuide | null`
- `interface CreateSopGuideInput (7 members)`
- `createSopGuide(input: CreateSopGuideInput): SopGuide`
- `interface UpdateSopGuidePatch (5 members)`
- `updateSopGuide(agencyId: string, id: string, patch: UpdateSopGuidePatch, actorUserId: string): SopGuide | null`
- `deleteSopGuide(agencyId: string, id: string): SopGuide | null`

## Depends on (3)

- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`src/app/api/portal/sop-guides/route.ts`](../../../app/api/portal/sop-guides/route.md)
- [`src/app/portal/agency/sop-library/page.tsx`](../../../app/portal/agency/sop-library/page.md)

