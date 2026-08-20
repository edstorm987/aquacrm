# `src/lib/server/devTeamUpdates.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (13)

- `UPDATES_DOC_REL`
- `MAX_ENTRIES`
- `interface DevUpdateEntry (3 members)`
- `class UpdateInputError`
    - `constructor(message: string)`
- `todayIsoDay(nowMs: number = Date.now()): string`
- `parseUpdates(markdown: string, limit: number = MAX_ENTRIES): DevUpdateEntry[]`
- `async scanUpdates(limit: number = MAX_ENTRIES): Promise<DevUpdateEntry[]>`
- `renderUpdateEntry(entry: DevUpdateEntry): string`
- `updatesInsertOffset(markdown: string): number`
- `insertUpdateBlock(markdown: string, block: string): string`
- `interface NewUpdateInput (2 members)`
- `buildUpdateEntry(input: NewUpdateInput, nowMs: number = Date.now()): DevUpdateEntry`
- `async appendUpdateEntry(input: NewUpdateInput, nowMs: number = Date.now()): Promise<DevUpdateEntry>`

## Depends on (1)

- [`src/lib/server/devDocs.ts`](./devDocs.md)

## Used by (2)

- [`src/app/api/portal/dev-team/updates/route.ts`](../../app/api/portal/dev-team/updates/route.md)
- [`src/app/portal/dev-team/updates/page.tsx`](../../app/portal/dev-team/updates/page.md)

