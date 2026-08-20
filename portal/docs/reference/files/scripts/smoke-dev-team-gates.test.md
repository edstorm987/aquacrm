# `scripts/smoke-dev-team-gates.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** One test that walks the whole Dev Team workspace and asks every reachable body the same question: does a non-founder get in?  The 2026-08-20 restructure moved the gate from "one gate per route file" to "one gate per `_Section` body, with the host route ungated by design". That shape is correct, but it destroyed the property that made it self-enforcing: a new file under `src/app/portal/dev-team/` used to be a page, and a page with no gate was obvious. Now `findings/page.tsx`, `library/page.tsx` and `tools/page.tsx` are legitimately gate-free, so "this dev-team file has no gate" is no longer a signal at all.  Exactly one of the eight section bodies was pinned by anything, and only by regex. The suite would have stayed green with the gate deleted from any of the other seven — invisible until the day `canUseDevMode()` is widened for the planned production "demo portals" path, at which point every agency manager reads the lot.  Two layers here, deliberately: 1. BEHAVIOUR — call each section body with a real agency-manager session inside a real request scope, and require a 404. 2. ENUMERATION — walk the tree on disk so a NEW file has to be added to an allowlist on purpose rather than passing in silence.

_No exported symbols (side-effect / internal module)._

## Depends on (5)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

