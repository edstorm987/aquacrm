# `scripts/smoke-dev-console-views.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Console view-layer pins — Logs' changes count, and the Library's dropped blocker strip.  Two different kinds of check live here, and the difference matters:  • BEHAVIOURAL. `changesPillLabel` is a real function with real inputs; the old pill printed a truncated file count as if it were the whole truth, and these cases fail against that. • SOURCE-SHAPE. The Library's dead `scanBlockers()` fetch has no observable output by definition — it was dead code whose only cost was a wasted file read per page load, and the section is a React server component that cannot be imported here (it pulls in next/link, which needs a client React). So the removal is pinned by shape. That is weaker proof and is labelled as such rather than dressed up.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/app/portal/dev-team/logs/_changesLabel.ts`](../src/app/portal/dev-team/logs/_changesLabel.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

