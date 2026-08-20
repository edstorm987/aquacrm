# `src/app/portal/agency/dev-docs/_DevDocsIndex.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev Docs index — the landing: launch blockers (parsed from state.md), a recently-edited feed ("what moved"), and a collapsible FOLDER TREE of every doc so 1,800 files read as folders, not a flat mess. Server component, presentational; the tree collapses natively via <details> (no client JS).

## Exports (1)

- `DevDocsIndexView({ index, blockers = [] }: { index: DevDocsIndex; blockers?: DevDocBlocker[] })`

## Depends on (3)

- [`src/app/portal/agency/dev-docs/_DocTree.tsx`](./_DocTree.md)
- [`src/lib/formatDateTime.ts`](../../../../lib/formatDateTime.md)
- [`src/lib/server/devDocs.ts`](../../../../lib/server/devDocs.md)

## Used by (1)

- [`src/app/portal/agency/dev-docs/page.tsx`](./page.md)

