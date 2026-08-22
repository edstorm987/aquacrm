# `scripts/smoke-librarian.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** THE LIBRARIAN — its own thing, consuming the file-finding skill.  Ed (dev-editor-finish.md, phase 15): "the librarian also needs its own thing like what weve done for the aqua editor ui and the librarian needs to be inside dev mode in the editor as well its different from the editor since librarian is for files finding".  `smoke-file-finding-skill.test.ts` pins the SKILL. This file pins the CONSUMER half phase 15's second act built:  1. THE BRIEF — `fileFindingWorld` is what the Librarian is briefed from: docs + reference counts and THIS agency's projects with honest repo flavours, network-free, tenant-scoped. (The drawer half of "briefs from the skill, business context GONE" is pinned in smoke-dev-team-shell.) 2. THE DOOR — `/api/portal/dev/librarian` wears the layered dev-surface gate (role → Dev Mode → origin), scopes every call to the SESSION's agency, answers a foreign project id exactly like an invented one, and has no GET to widen. 3. THE SURFACE — `LibrarianPanel` renders ranked hits WITH their WHY and the `searched` report, wears the editor's clothes (never `--dt-*`), and states plainly that opening files is the editor's job until the DevEditor mount lands. 4. THE TAB — "librarian" is declared on the developer ladder and HELD off `INSPECTOR_TABS` until the DevEditor mount pass, because the rail must never offer a tab that has no panel. First, and statically — see the note in dev-console-request-scope.ts.

_No exported symbols (side-effect / internal module)._

## Depends on (10)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/librarian/route.ts`](../src/app/api/portal/dev/librarian/route.md)
- [`src/engines/editor/editing/modes.ts`](../src/engines/editor/editing/modes.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/dev/devDocs.ts`](../src/lib/server/dev/devDocs.md)
- [`src/lib/server/dev/fileFinding.ts`](../src/lib/server/dev/fileFinding.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

