# `scripts/smoke-dev-team-findings.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Findings — the INPUT side of the Dev Console.  Everything here runs against the REAL module, writing to a throwaway project root. `PROJECT_ROOT` is `resolve(process.cwd())` evaluated when devDocs is first imported, so chdir-ing into a temp directory BEFORE the first dynamic import gives this file its own docs/development/{findings,plans} tree. No dev server, no session, no shared state — and nothing here can touch the repo's own findings.  The point of these tests is that they are about OBSERVABLE RESULTS: what comes back out of a finding after a round-trip through the markdown, what is on disk after a failure, what a generated plan actually contains. The surface previously had only source-shape coverage, and every bug below survived it.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

