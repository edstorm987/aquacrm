# `scripts/smoke-dev-team-editor.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The Dev Team Editor — the surface that edits AquaCRM's own configuration.  Before this file, `appConfigAdapter.ts` (446 lines), its write route and its client were covered by exactly one assertion in the whole suite: a regex looking for the string "EditorSection". Nothing drove the field catalogue, the validators, the founder gate on the WRITE, the confirm lock, or the normalise↔storage-cleaner alignment. That is how a real defect shipped: clearing an optional Identity field did nothing at all while the screen said "Applied".  Everything here drives the REAL route handler in-process against PORTAL_BACKEND=memory, so each case fails against the behaviour rather than the source text.

_No exported symbols (side-effect / internal module)._

## Depends on (9)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev-team/editor/route.ts`](../src/app/api/portal/dev-team/editor/route.md)
- [`src/engines/editor/editing/engine.ts`](../src/engines/editor/editing/engine.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/editing/appConfigAdapter.ts`](../src/lib/server/editing/appConfigAdapter.md)
- [`src/server/agencySettings.ts`](../src/server/agencySettings.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

