# `scripts/smoke-dev-team-shell.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Team shell — the five shell fixes that live in the Dev Team layout and the shared Topbar (see docs/development/plans/dev-team-librarian-and-assistants.md):  1. Librarian drawer — the layout passes its OWN advisorControl (its own find surface over the SAME side-panel drawer — since phase 15 the Librarian briefs from the file-finding skill, not the Advisor's business context), so the Topbar never falls through to the full-page /portal/agency/assistant link. 2. Role-dependent "Back to home" — the exit link uses resolvePostLoginPath + "Back to home", not a hardcoded href="/" or /portal/agency. 3. "Leave Dev Team" is gone from the sidebar (the topbar is the way out). 4. Editor is a first-class sidebar item. 5. Team chat is a sidebar item + page.  These are WIRING pins over source, the honest check for shell composition (props passed, items present/absent) that no behavioural unit test covers. Each assertion fails on the pre-change source.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

