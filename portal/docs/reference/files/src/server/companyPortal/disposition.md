# `src/server/companyPortal/disposition.ts`

← [File index](../../../../files-index.md) · Area: State layer — src/server/

**What it is:** Company-portal disposition map — what happens to EVERY collection in `PortalState` when a trading company is given a portal of its own.  ⚠ THE MODEL, settled by the founder 2026-08-20: agency is a HOLDING GROUP, trading companies are the businesses under it, and each company has its own clients. Three permanent tiers. A company does NOT become an agency — it stays a company and gains a workspace, backed by a tenant carrying `holdingAgencyId`. "Move" below therefore means "into the company's own portal tenant", never "out of the group".  ─── WHY THIS FILE EXISTS ─────────────────────────────────────────────────  This codebase has already shipped the bug this file prevents, twice. The only two pieces of "everything belonging to a tenant" code hand-list their collections: `src/lib/server/auth/showcaseMode.ts:477-519` names 25 of 78, and `src/lib/server/seeds/demoSeed.ts:430-463` names 7 of 78. Both silently miss the rest. A hand-list is invisible when it goes stale — nothing fails, the missed collections are simply left behind.  So the map below is not a list. It is a MAPPED TYPE over `Required<PortalState>`: TypeScript itself demands one entry per collection, and `keyof` is read straight off the state type. Add a 79th collection to `PortalState` and this file stops compiling until somebody classifies it. Delete an entry and it stops compiling. Rename a collection and it stops compiling. That is the whole job — see the GUARD block at the bottom.  Deliberately NOT imported from `showcaseMode`. The right precedent is `src/server/clientErasure.ts:625-680`, which iterates `Object.entries(state)` generically rather than trusting a written-down list.  This module is pure data + types: no `server-only`, no state access, no imports beyond the state type. The preview (`./companyPortal.ts`) reads it; so, later, will the confirmation UI.

## Exports (12)

- `type PromotionDisposition`
- `type PromotionOwnership`
- `type PromotionKeying`
- `interface PromotionParentLink (2 members)`
- `interface CollectionPromotionPlan (6 members)`
- `type PromotionDispositionMap`
- `PROMOTION_DISPOSITION`
- `PROMOTION_COLLECTION_COUNT`
- `PROMOTION_COLLECTIONS`
- `dispositionFor(collection: keyof Required<PortalState>): CollectionPromotionPlan`
- `collectionsWithDisposition(disposition: PromotionDisposition): Array<keyof Required<PortalState>>`
- `collectionsNeedingConfirmation(): Array<keyof Required<PortalState>>`

## Depends on (1)

- [`src/server/types.ts`](../types.md)

## Used by (2)

- [`scripts/smoke-company-portal.test.ts`](../../../scripts/smoke-company-portal.test.md)
- [`src/server/companyPortal/companyPortal.ts`](./companyPortal.md)

