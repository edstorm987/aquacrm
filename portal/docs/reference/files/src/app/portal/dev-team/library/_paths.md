# `src/app/portal/dev-team/library/_paths.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Shared route helpers for the Dev Team Library.  The Library reuses the dev-docs BACKEND wholesale (`listDevDocs`/`readDevDoc`/ `scanBlockers` in `@/lib/server/devDocs`), but the dev-docs *view* components hardcode `/portal/agency/dev-docs` in their links via a module-local `docHref` and can't be parameterised without editing them (off-limits). So the Library re-implements only the link-generating views (index, tree, viewer) against THIS base — keeping every click inside the Dev Team hub instead of bouncing out to the agency dev-docs page.

## Exports (2)

- `LIBRARY_BASE`
- `libraryDocHref(relPath: string): string`

## Used by (4)

- [`src/app/portal/dev-team/library/_LibraryDocViewer.tsx`](./_LibraryDocViewer.md)
- [`src/app/portal/dev-team/library/_LibraryIndex.tsx`](./_LibraryIndex.md)
- [`src/app/portal/dev-team/library/_LibraryTree.tsx`](./_LibraryTree.md)
- [`src/app/portal/dev-team/updates/page.tsx`](../updates/page.md)

