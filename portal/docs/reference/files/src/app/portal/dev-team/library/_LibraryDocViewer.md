# `src/app/portal/dev-team/library/_LibraryDocViewer.tsx`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Dev Team Library viewer — renders one doc's live markdown in-app, with a last-edited stamp, the raw path, and a way back to the Library index, dressed in the shared Dev Team design kit. A faithful reuse of the dev-docs viewer; the ONLY behavioural change is the back-link target (the dev-docs original hardcodes /portal/agency/dev-docs). The markdown itself is the SHARED `DocMarkdown` client component, reused unchanged — it carries no route-specific links, so nothing there needed re-implementing.

## Exports (1)

- `LibraryDocViewer({ doc, nowMs }: { doc: DevDocContent; nowMs: number })`

## Depends on (4)

- [`src/app/portal/agency/dev-docs/_DocMarkdown.tsx`](../../agency/dev-docs/_DocMarkdown.md)
- [`src/app/portal/dev-team/library/_paths.ts`](./_paths.md)
- [`src/lib/server/dev/devDocs.ts`](../../../../lib/server/dev/devDocs.md)
- [`src/lib/shared/formatDateTime.ts`](../../../../lib/shared/formatDateTime.md)

## Used by (1)

- [`src/app/portal/dev-team/library/_Section.tsx`](./_Section.md)

