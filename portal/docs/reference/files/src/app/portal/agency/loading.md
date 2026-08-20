# `src/app/portal/agency/loading.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Instant route-level skeleton for the Command Centre.  Without this, Next.js has nothing to show while the agency page's server work resolves, so the browser sat on the previous screen (or a blank canvas) until everything was ready. `loading.tsx` streams immediately — the sidebar and topbar come from the layout, and this fills the main region with the Command Centre's own shape (station nav + day board) so the app feels instant instead of stalled. Purely presentational; no data, no logic.

## Exports (1)

- `default AgencyHomeLoading()`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

