# `src/app/portal/dev-team/library/page.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev Team → Library. Surfaces every plan / phase / feature / doc by reusing the dev-docs BACKEND wholesale (`listDevDocs`/`readDevDoc`/`scanBlockers` + `devDocsAccessible`), rendered through Library-scoped view components so every link stays inside the Dev Team hub. Mirrors the dev-docs page.tsx server logic exactly: same layered gate (founder + Dev Mode) that the layout already asserts, re-asserted here, plus the `?doc=` viewer branch. Renders inside the existing dev-team layout.

## Exports (2)

- `dynamic`
- `default async LibraryPage({ searchParams }: { searchParams: SearchParams })`

## Depends on (6)

- [`src/app/portal/dev-team/library/_LibraryDocViewer.tsx`](./_LibraryDocViewer.md)
- [`src/app/portal/dev-team/library/_LibraryIndex.tsx`](./_LibraryIndex.md)
- [`src/lib/server/auth.ts`](../../../../lib/server/auth.md)
- [`src/lib/server/devDocs.ts`](../../../../lib/server/devDocs.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

