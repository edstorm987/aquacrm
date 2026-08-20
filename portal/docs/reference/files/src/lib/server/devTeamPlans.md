# `src/lib/server/devTeamPlans.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `interface NewPlanInput (5 members)`
- `interface NewPlanResult (3 members)`
- `planSlug(title: string): string`
- `renderPlanMarkdown(input: NewPlanInput, now = Date.now()): string`
- `async createPlan(input: NewPlanInput, now = Date.now()): Promise<NewPlanResult>`

## Depends on (1)

- [`src/lib/server/devDocs.ts`](./devDocs.md)

## Used by (2)

- [`src/app/api/portal/dev-team/findings/route.ts`](../../app/api/portal/dev-team/findings/route.md)
- [`src/app/api/portal/dev-team/plans/route.ts`](../../app/api/portal/dev-team/plans/route.md)

