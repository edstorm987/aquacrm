# `scripts/smoke-dev-team-workers.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Live worker signals — the API, the scanner, and the panel's view helpers.  This half of the Dev Team board is meant to be EVIDENCE rather than intent: "FILE ACTIVITY (truth)". Nothing in the suite touched it, and two defects lived here unnoticed:  1. `scanWorkerSignals` truncated its recent-file list to 200 BEFORE the callers counted it and grouped it into areas, so the panel printed "200 in 2h" against a real number ten times larger and whole areas of the codebase were missing from the map. 2. Check-ins had no staleness contract — every check-in ever written read as a live worker, so one surface said "nobody is active" while another named two workers on the same launch blocker.  Plus the founder gate on the route itself: delete it and the whole suite used to stay green while every agency role could read the repo's activity map.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

