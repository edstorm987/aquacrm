# `scripts/smoke-dev-team-plan-authoring.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Writing a plan from the Dev Team portal — the only write path in the Dev Console that creates a FILE, and the one nothing tested.  The risk here is not "does the file get written" (it always did). It is that the writer and the two readers live in three different modules and nobody crossed the seam:  src/lib/server/dev/devTeamPlans.ts   writes docs/development/plans/<slug>.md devTeamBoard.parsePlanStatus     reads the `**Status:` line → a board lane devTeamTasks.parsePhases         reads `## Phases…` → the Tasks view  A plan the system cannot read back is worse than no plan, so the contract asserted below is the ROUND TRIP: render → parse → the plan Ed just wrote is planned, unstarted, and visible on the board he was sent to look at.  Everything runs against a throwaway PROJECT_ROOT. `PROJECT_ROOT` is `resolve(process.cwd())` captured when devDocs first loads, so the sandbox is entered with `process.chdir` BEFORE the modules are imported — no test here can touch the real `docs/development/plans/`.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

