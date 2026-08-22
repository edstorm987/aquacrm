# `scripts/smoke-sop-guides.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** SOP Engine — guides (Phase 3) smoke.  A GUIDE is an ordered sequence of existing SOPs (by sopId) composed in the SOP library. These prove the additive contract: a guide round-trips through create → get → reorder → delete; a guide that references a SOP which does not exist for the agency is REFUSED; and the HTTP CRUD is owner/manager gated so agency-staff cannot compose guides. The `sopGuides` collection surviving a state save/load is proven generically by `smoke-state-roundtrip.test.ts` (it derives the collection list from the PortalState type).  Everything below drives the SHIPPED server functions and the REAL exported route handlers in-process (a minted session + a NextRequest), against the memory backend.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

