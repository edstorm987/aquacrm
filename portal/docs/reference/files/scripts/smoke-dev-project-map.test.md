# `scripts/smoke-dev-project-map.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** MAP — the one button, and the rule it feeds.  Ed: "for setup create project create the repo give the editor the repo press a button called map and then it maps everything all good and then when for aqua tag you connect it you have to press map then it creates the aqua tag browser so bloody simple"  Two things are under test here and they are worth naming separately.  1. THE UNLOCK RULE. `devProjectVisualEditorUnlocked` used to AND in `kind !== "software"`. Every project Ed creates is `software` (it is the default and the setup form has no kind picker), so the browser was gated off everything he builds. The tag alone is now the gate, and the half that must survive — no tag, no browser — is pinned in several directions.  2. WHAT MAP MAY CONCLUDE. "Tagged" is not a checkbox somebody ticks: a verified tag mints `aquaTagId` from the key the page really carried, and an unverified one must never set it. That is the difference between a gate and a suggestion, so it is asserted from both sides — including the someone-else's-key case, where a tag IS present but is not this agency's.  The repository walk and the tag detector are injected, so nothing here touches the network or a real clone. One case deliberately drives the REAL filesystem walk against a temp directory, because that walk was moved out of the files route in this change and its hiding rules are a credential boundary.

_No exported symbols (side-effect / internal module)._

## Depends on (11)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/projects/route.ts`](../src/app/api/portal/dev/projects/route.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/mapProject.ts`](../src/engines/editor/server/mapProject.md)
- [`src/engines/editor/server/workspaceFiles.ts`](../src/engines/editor/server/workspaceFiles.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/integrations/aquaTagDetection.ts`](../src/lib/server/integrations/aquaTagDetection.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

