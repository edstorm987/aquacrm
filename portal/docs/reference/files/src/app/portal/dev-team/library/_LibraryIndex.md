# `src/app/portal/dev-team/library/_LibraryIndex.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev Team Library index — the landing: a short recently-edited feed ("what moved") and a collapsible FOLDER TREE of every doc so ~1,800 files read as folders, not a flat mess. A faithful reuse of the dev-docs index presentation, re-pointed at the Library route (`libraryDocHref` + `LibraryTree`) so navigation stays inside the Dev Team hub, and dressed in the shared Dev Team design kit (`../_ui`). Server component, presentational.  The index shows only the 5 latest edits (keeps the page fast + uncluttered); "View all" opens the full list at `?view=recent` (rendered by `LibraryRecentView`, capped for speed). The launch-blocker strip that used to live here was dropped — the Dev Team Home already surfaces live blockers.

## Exports (2)

- `LibraryIndexView({ index }: { index: DevDocsIndex; blockers?: DevDocBlocker[] })`
- `LibraryRecentView({ index }: { index: DevDocsIndex })`

## Depends on (5)

- [`src/app/portal/dev-team/_ui.tsx`](../_ui.md)
- [`src/app/portal/dev-team/library/_LibraryTree.tsx`](./_LibraryTree.md)
- [`src/app/portal/dev-team/library/_paths.ts`](./_paths.md)
- [`src/lib/formatDateTime.ts`](../../../../lib/formatDateTime.md)
- [`src/lib/server/devDocs.ts`](../../../../lib/server/devDocs.md)

## Used by (1)

- [`src/app/portal/dev-team/library/page.tsx`](./page.md)

