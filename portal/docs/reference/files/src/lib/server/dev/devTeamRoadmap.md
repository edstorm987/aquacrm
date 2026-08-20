# `src/lib/server/dev/devTeamRoadmap.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (28)

- `roadmapPath(): string`
- `ROADMAP_REL_PATH`
- `type Horizon`
- `type ItemStatus`
- `type ItemSize`
- `HORIZONS: { value: Horizon; label: string; hint: string }[]`
- `SIZES: { value: ItemSize; label: string; days: number }[]`
- `STATUSES: ItemStatus[]`
- `interface RoadmapItem (14 members)`
- `interface RoadmapItemView (7 members)`
- `interface Roadmap (6 members)`
- `itemId(title: string): string`
- `normaliseTarget(value: string | undefined): string | undefined`
- `daysUntil(target: string, now: number): number`
- `targetInstant(target: string): number`
- `parseRoadmap(markdown: string): RoadmapItem[]`
- `parseRoadmapDoc(markdown: string): { preamble?: string; items: RoadmapItem[] }`
- `renderRoadmap(items: RoadmapItem[], preamble?: string): string`
- `async readItems(): Promise<RoadmapItem[]>`
- `async buildRoadmap(now = Date.now()): Promise<Roadmap>`
- `interface NewItemInput (11 members)`
- `addItem(input: NewItemInput, now = Date.now()): Promise<RoadmapItem>`
- `interface UpdateItemInput (11 members)`
- `updateItem(input: UpdateItemInput, now = Date.now()): Promise<RoadmapItem>`
- `linkPlan(id: string, planName: string): Promise<RoadmapItem>`
- `removeItem(id: string): Promise<{ removed: RoadmapItem }>`
- `interface Collision (4 members)`
- `findCollisions(items: RoadmapItemView[]): Collision[]`

## Depends on (5)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/lib/server/dev/devLocalTime.ts`](./devLocalTime.md)
- [`src/lib/server/dev/devTeamBoard.ts`](./devTeamBoard.md)
- [`src/lib/server/dev/devTeamTasks.ts`](./devTeamTasks.md)
- [`src/lib/server/dev/devTeamWorkers.ts`](./devTeamWorkers.md)

## Used by (5)

- [`scripts/smoke-dev-roadmap.test.ts`](../../../../scripts/smoke-dev-roadmap.test.md)
- [`src/app/api/portal/dev-team/roadmap/route.ts`](../../../app/api/portal/dev-team/roadmap/route.md)
- [`src/app/portal/dev-team/page.tsx`](../../../app/portal/dev-team/page.md)
- [`src/app/portal/dev-team/roadmap/_RoadmapWorkspace.tsx`](../../../app/portal/dev-team/roadmap/_RoadmapWorkspace.md)
- [`src/app/portal/dev-team/roadmap/page.tsx`](../../../app/portal/dev-team/roadmap/page.md)

