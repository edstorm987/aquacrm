# `scripts/smoke-dev-editor-aqua-tag.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** MAKING AN AQUA TAG FROM INSIDE THE EDITOR.  Ed: "the aqua tag must be connected for browser to work. or anything to work really other than the dev since it can just use repo files directly"  Before this, the editor could only CONSUME a tag somebody had created on another screen: `DevProject.aquaTagId` was set by no surface at all, and the snippet lived in four places, none of them the editor. The loop under test is the whole thing in one place — create/get the key, show the snippet, bind it to the project, verify it, and say what is true at each step.  Three properties are load-bearing and each is asserted from both sides:  1. THE KEY COMES FROM THE SESSION. Never from a body. A request must not be able to name a key, find some page carrying it, and call itself connected. Nor may it name a tag id directly — that would be the browser gate handed out on request. 2. ONLY A PAGE MAY CONCLUDE "TAGGED". The id is minted from the key the fetched page really carried, and a check that fails never clears one that a check already earned. 3. A CHECK IS NOT A MAP. Pressing "Check it" fetches one address; it does not walk the repository, so it must leave the repository half of the last Map — and the timestamp describing it — exactly as it found them.  No network is used anywhere. Every address here ends in `.test`, which `radarSyntheticSafety` refuses before DNS is even consulted, so the failure path is deterministic offline; the success path injects a detector, the same seam `smoke-dev-project-map` uses.

_No exported symbols (side-effect / internal module)._

## Depends on (11)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/projects/route.ts`](../src/app/api/portal/dev/projects/route.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/mapProject.ts`](../src/engines/editor/server/mapProject.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/integrations/aquaTagDetection.ts`](../src/lib/server/integrations/aquaTagDetection.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)
- [`src/server/websiteSources.ts`](../src/server/websiteSources.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

