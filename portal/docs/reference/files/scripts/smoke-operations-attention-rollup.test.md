# `scripts/smoke-operations-attention-rollup.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Operations attention rollup — regression guard.  When the Operations surface collapsed to a single row, its business functions (Finance, Fulfilment, Marketing, Journey, Staff…) stopped rendering as sidebar rows — they live on a hidden, search-only panel. Their alert badges must not vanish: addSidebarAttention rolls the hidden functions' attention up onto the one visible "Operations" (operations-home) row. This pins that behaviour so a future refactor cannot silently drop the operator's at-a-glance signal.

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/lib/chrome/sidebarLayout.ts`](../src/lib/chrome/sidebarLayout.md)
- [`src/lib/intelligence/operationalAttention.ts`](../src/lib/intelligence/operationalAttention.md)
- [`src/lib/server/sidebarAttention.ts`](../src/lib/server/sidebarAttention.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

