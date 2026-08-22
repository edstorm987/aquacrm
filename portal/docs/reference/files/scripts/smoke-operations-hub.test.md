# `scripts/smoke-operations-hub.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Operations hub (the surface front door) — completeness guard.  Ed's IA v2 makes Operations one of the five owner surfaces, and this hub is its landing page. It must list every business function the sidebar assembles under the "Operations" group, so the hub and the nav never drift apart. This test rebuilds the REAL sidebar (respecting the AquaOasis agency override) and fails if any Operations function is missing a card on the hub.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/chrome/sidebarLayout.ts`](../src/lib/chrome/sidebarLayout.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

