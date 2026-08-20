# `src/app/portal/agency/dev-docs/_DevDocViewer.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev Docs viewer (Phase 2) — renders one doc's live markdown in-app, with a last-edited stamp, the raw path, and a way back to the index. Server component; the markdown itself renders in the client `DocMarkdown`.

## Exports (1)

- `DevDocViewer({ doc, nowMs }: { doc: DevDocContent; nowMs: number })`

## Depends on (3)

- [`src/app/portal/agency/dev-docs/_DocMarkdown.tsx`](./_DocMarkdown.md)
- [`src/lib/server/dev/devDocs.ts`](../../../../lib/server/dev/devDocs.md)
- [`src/lib/shared/formatDateTime.ts`](../../../../lib/shared/formatDateTime.md)

## Used by (1)

- [`src/app/portal/agency/dev-docs/page.tsx`](./page.md)

