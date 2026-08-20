# `src/lib/chrome/activityCategoryStyle.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Activity-category chip styling (T1 R033 — chapter `04-activity-category-batch-extension.md`).  Pure pin map: every `ActivityCategory` member resolves to a chip `{color, icon, label}` so the agency activity feed can light up new plugin categories without a code change at each render site.  Severity is a separate axis — derived from the entry's action prefix (e.g. `feedback.detractor.*` → "warn"). The chip is the category visual; severity adds an outline / bell.

## Exports (6)

- `type Severity`
- `interface CategoryStyle (3 members)`
- `categoryStyle(category: ActivityCategory | string): CategoryStyle`
- `deriveActivitySeverity(entry: { action: string }): Severity`
- `describeActivityChip(entry: { category: ActivityCategory | string; action?: string }): { category: CategoryStyle; severity: Severity; }`
- `CATEGORY_FILTER_ORDER: readonly ActivityCategory[]`

## Depends on (1)

- [`src/server/types.ts`](../../server/types.md)

## Used by (2)

- [`scripts/smoke-activity-category-batch.test.ts`](../../../scripts/smoke-activity-category-batch.test.md)
- [`src/app/portal/agency/_AgencyActivityFeed.tsx`](../../app/portal/agency/_AgencyActivityFeed.md)

