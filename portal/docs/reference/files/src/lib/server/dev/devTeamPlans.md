# `src/lib/server/dev/devTeamPlans.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `interface NewPlanInput (5 members)`
- `interface NewPlanResult (3 members)`
- `planSlug(title: string): string`
- `renderPlanMarkdown(input: NewPlanInput, now = Date.now()): string`
- `async createPlan(input: NewPlanInput, now = Date.now()): Promise<NewPlanResult>`

## Depends on (3)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/lib/server/dev/devLocalTime.ts`](./devLocalTime.md)
- [`src/lib/server/dev/devMarkdownCache.ts`](./devMarkdownCache.md)

## Used by (3)

- [`src/app/api/portal/dev-team/plans/route.ts`](../../../app/api/portal/dev-team/plans/route.md)
- [`src/app/api/portal/dev-team/roadmap/route.ts`](../../../app/api/portal/dev-team/roadmap/route.md)
- [`src/lib/server/dev/devTeamFindings.ts`](./devTeamFindings.md)

