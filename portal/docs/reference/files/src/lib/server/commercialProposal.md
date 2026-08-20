# `src/lib/server/commercialProposal.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (1)

- `async findCommercialProposal(token: string): Promise<{ pack: CommercialPack; agencyName: string; accept: (acceptedBy: string) => Promise<CommercialPack | null>; } | null>`

## Depends on (4)

- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)
- [`src/server/tenants.ts`](../../server/tenants.md)

## Used by (2)

- [`src/app/api/public/proposals/[token]/route.ts`](../../app/api/public/proposals/[token]/route.md)
- [`src/app/proposal/[token]/page.tsx`](../../app/proposal/[token]/page.md)

