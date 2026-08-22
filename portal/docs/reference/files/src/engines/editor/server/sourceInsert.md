# `src/engines/editor/server/sourceInsert.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (3)

- `type InsertAnchor`
- `type SourceInsertPlan`
- `planSourceInsert(input: { contents: string; code: string; anchor: InsertAnchor; /** The path the contents came from — the file TYPE decides the rules. */ file: string; }): SourceInsertPlan`

## Depends on (1)

- [`src/engines/editor/server/sourceMatch.ts`](./sourceMatch.md)

## Used by (2)

- [`scripts/smoke-element-insert.test.ts`](../../../../scripts/smoke-element-insert.test.md)
- [`src/engines/editor/server/repoWrite.ts`](./repoWrite.md)

