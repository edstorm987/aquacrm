# `src/app/portal/agency/dev-docs/page.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** /portal/agency/dev-docs — owner + Dev-Mode-only in-app docs browser.  The gate is everything (and it is layered): the sidebar item only appears for a founder in Dev Mode, THIS route independently 404s otherwise, and the doc-index helper asserts the same gate again. Absent + unreachable in any production-like context — which is what makes reading `docs/` off disk safe.

## Exports (2)

- `dynamic`
- `default async DevDocsPage({ searchParams }: { searchParams: SearchParams })`

## Depends on (6)

- [`src/app/portal/agency/dev-docs/_DevDocViewer.tsx`](./_DevDocViewer.md)
- [`src/app/portal/agency/dev-docs/_DevDocsIndex.tsx`](./_DevDocsIndex.md)
- [`src/lib/server/auth/auth.ts`](../../../../lib/server/auth/auth.md)
- [`src/lib/server/dev/devDocs.ts`](../../../../lib/server/dev/devDocs.md)
- [`src/server/storage.ts`](../../../../server/storage.md)
- [`src/server/types.ts`](../../../../server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

