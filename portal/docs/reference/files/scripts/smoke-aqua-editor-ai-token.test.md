# `scripts/smoke-aqua-editor-ai-token.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** AQUA EDITOR AI — its own token, its own config, per project.  Ed, verbatim: "aqua editor ai needs to be its only thing please now. needs a seperate tocken please to configure please. it needs its own thing and its saved per project this one is."  This file pins the SECURITY half of that sentence, which is the half that goes wrong quietly. Four properties, each asserted from both sides:  1. THE KEY NEVER LEAVES THE SERVER. Not in `EditorAiStatus`, not in a route response — not even on the request that just set it, which is exactly the moment a value ends up in a screenshot — and not in plaintext anywhere in `PortalState`.  2. IT IS GENUINELY SEPARATE FROM THE AGENCY ASSISTANT. A key pasted for the editor must not turn the Aqua Advisor on, and the Advisor's key must not turn the editor on. They are different provider kinds in the vault so that this is structural rather than a convention.  3. IT IS PER PROJECT. Two projects in ONE agency hold two independent keys; configuring one says nothing about the other.  4. IT IS TENANT-SCOPED, AGENCY BEFORE PROJECT. A project id from another agency resolves nothing — no config, no model, no token — and cannot be written to. This matches how `devProjects.assertConnection` guards, and it is the check that stops a guessed id reaching a decrypt. First, and statically — see the note in dev-console-request-scope.ts.

_No exported symbols (side-effect / internal module)._

## Depends on (12)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/app/api/portal/dev/editor-ai/route.ts`](../src/app/api/portal/dev/editor-ai/route.md)
- [`src/app/api/portal/settings/integrations/route.ts`](../src/app/api/portal/settings/integrations/route.md)
- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/engines/editor/server/editorAi.ts`](../src/engines/editor/server/editorAi.md)
- [`src/lib/server/assistants/openaiAssistant.ts`](../src/lib/server/assistants/openaiAssistant.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../src/lib/server/integrations/integrationConnections.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

