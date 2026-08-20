# `src/lib/server/dev/devDocEdits.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `interface DocEdit (6 members)`
- `interface DocHistory (3 members)`
- `async saveDevDoc(input: { session: SessionPayload; relPath: string; content: string; note?: string; authorName?: string; expectedMtimeMs?: number; }): Promise<{ mtimeMs: number; sizeBytes: number }>`
- `async docHistory(relPath: string): Promise<DocHistory>`
- `async recentDocEdits(limit = 25): Promise<DocEdit[]>`

## Depends on (2)

- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (4)

- [`src/app/api/portal/dev-team/docs/route.ts`](../../app/api/portal/dev-team/docs/route.md)
- [`src/app/portal/dev-team/docs/_DocEditor.tsx`](../../app/portal/dev-team/docs/_DocEditor.md)
- [`src/app/portal/dev-team/docs/page.tsx`](../../app/portal/dev-team/docs/page.md)
- [`src/app/portal/dev-team/logs/page.tsx`](../../app/portal/dev-team/logs/page.md)

