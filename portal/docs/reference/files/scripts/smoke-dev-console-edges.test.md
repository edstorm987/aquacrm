# `scripts/smoke-dev-console-edges.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The Dev Console's edges — the places where the popover told the founder something that was not true.  Four verified defects, each pinned by BEHAVIOUR rather than by grepping the component:  1. "Working now" printed the length of a list that is capped at five, so the popover said 5 while the Command Centre station said 6 and listed the sixth worker. Driven here against a fixture with SEVEN check-ins. 2. The reload fired after a save discarded the fresh `?part=core` response (`setCore(previous => previous ?? value)`), so the badge moved while the panel's own tile and list kept showing pre-save data — for good, if the slow read then failed. 3. Twelve links on two hot surfaces pointed at the restructure's redirect stubs, paying two server renders per click. 4. Two of the route's three failures are machine codes, and the founder read the bare word "not_found".  The worker fixture is a TEMP PROJECT ROOT, not `.data/workers/` — this file runs in its own process (see `smoke-dev-team-workers`), so a chdir is contained, and nothing here writes into the real working tree that seven other agents are editing.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

