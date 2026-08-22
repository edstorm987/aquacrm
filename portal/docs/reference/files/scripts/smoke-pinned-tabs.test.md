# `scripts/smoke-pinned-tabs.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Pinned tabs — pure store logic guard.  The localStorage + React layers are client-only, but the pin logic is pure and testable: two locations (topbar / sidebar), move between them, dedupe, per-location cap, toggle, clear-all, and defensive normalisation on load.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/components/chrome/pinnedTabsStore.ts`](../src/components/chrome/pinnedTabsStore.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

