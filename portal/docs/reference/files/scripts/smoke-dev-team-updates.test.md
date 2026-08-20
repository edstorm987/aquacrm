# `scripts/smoke-dev-team-updates.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Team → Updates smoke — the ONE write the Dev Console makes to the project's own memory file (docs/development/updates.md), plus the parser that decides how much of that memory Ed actually gets to see.  This surface had zero coverage: a full green suite certified neither the insert offset, nor the parse, nor the concurrency guard. Two data-loss bugs lived here as a result, and both are pinned below:  1. CONCURRENCY. `appendUpdateEntry` read the whole file, spliced, and wrote it back. Two callers that read the same snapshot both wrote it back, so N concurrent appends returned N successes and left ONE entry on disk — the route answering 201 for text that never landed. Now every append in the process queues on one chain. 2. PROSE. `parseUpdates` only understood `- ` bullets. Prose BEFORE an entry's first bullet was unreachable and silently dropped; prose AFTER a bullet was glued onto the end of that bullet. The real doc is prose-first, so most entries rendered as a truncated fragment with no marker.  Isolation: `PROJECT_ROOT` is `resolve(process.cwd())` captured at module load, so `process.chdir(sandbox)` BEFORE requiring the module points every path at a temp tree. The module is therefore pulled in with `require`, not `import` — `import` hoists and would beat the chdir. The real updates.md is only ever READ, by absolute path, for the regression check on live data.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

