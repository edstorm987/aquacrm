# `scripts/smoke-dev-team-api-view.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The Dev Team "API & MCP" view must count the credentials that actually work.  The header pills were derived purely from `listExternalAssistantApiKeys()`, which returns MANAGED keys only. The legacy environment token is a live, authenticating, full-scope credential for the very MCP server this page exists to describe — and it contributed nothing to either pill. On a machine with the env token set and no managed keys, the page rendered "0 active keys · 0 granted tools" while a bearer request with that token authenticated and received the full tool list. The inverse is worse: after revoking the last managed key to lock the workspace down, the page shows 0/0 and looks locked while the env credential is untouched.  This renders the REAL section for a founder in Dev Mode and reads the numbers off the returned element tree.

_No exported symbols (side-effect / internal module)._

## Depends on (7)

- [`scripts/dev-console-request-scope.ts`](./dev-console-request-scope.md)
- [`src/lib/server/assistants/externalAssistantApi.ts`](../src/lib/server/assistants/externalAssistantApi.md)
- [`src/lib/server/assistants/externalAssistantKeys.ts`](../src/lib/server/assistants/externalAssistantKeys.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

