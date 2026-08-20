# `src/lib/server/sopsAccess.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `type SopsTagFamily`
- `class SopsAccessError`
    - `constructor(public readonly required: string)`
- `assertSopsAccess(session: SessionPayload | null | undefined, family?: SopsTagFamily): void`
- `familiesForStage(stage: string): SopsTagFamily[]`

## Depends on (1)

- [`src/server/types.ts`](../../server/types.md)

## Used by (1)

- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)

