# `scripts/smoke-dev-team-board-status.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Team board — plan-status parsing + worker reconciliation.  The board is the founder's only "what is moving" view, and both of its truth sources are markdown written by hand. Three defects lived here, all of them silent (a wrong lane or a missing card, never an error):  1. `**Status:** value` — bold LABEL, value after the closing `**` — parsed to null, so the plan vanished from every lane and every count. 2. "awaiting" was checked BEFORE the ✅/shipped rule, so "✅ SHIPPED — awaiting sign-off" landed in "Ready next · Planned, ready to assign". 3. Only the FIRST plan link in a worker row was reconciled, so a worker owning two plans governed one of them and not the other.  Everything below drives the real parsers over real-shaped markdown.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/dev/devTeamBoard.ts`](../src/lib/server/dev/devTeamBoard.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

