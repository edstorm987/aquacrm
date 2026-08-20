# `scripts/smoke-dev-console-write-gates.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Console WRITE-route gates — the two POSTs that can change files on disk.  POST /api/portal/dev-team/docs     → saves any markdown doc in the repo POST /api/portal/dev-team/updates  → inserts an entry in the project's log  Both hang off the same two-layer gate: an agency role (`requireRole`) and then `devDocsAccessible` — founder AND Dev Mode. Neither layer had a single test. Deleting `if (!devDocsAccessible(session))` from either route left the suite green while the write path became reachable by any agency role, including on a production-like deployment.  Driven in-process, the runtime-verify way: a minted session + a NextRequest against the REAL exported handler. Nothing here is allowed to write: • the refusal cases are asserted to answer 401/404 and to carry no save result in the body; • the POSITIVE control — proving the 404s really come from the gate and not from something incidental — is deliberately steered into a 400 that happens BEFORE any file is opened (a doc path that does not exist; an entry with no title), so a passing gate still touches no bytes. The real docs/development/updates.md is never written by this file.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

