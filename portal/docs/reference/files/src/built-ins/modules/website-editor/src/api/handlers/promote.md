# `src/built-ins/modules/website-editor/src/api/handlers/promote.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** GitHub PR promote — Round-1 handler is a SHIM. Wiring the real GitHub-PR-publish flow requires the Postgres migration flagged in `04-architecture.md` §13. Round-1 returns a deterministic stub response so the editor's publish-modal flow can be exercised end-to- end without erroring.  **TODO** Round 2: lift the GitHub Octokit + branch/PR creation logic from `02/src/app/api/portal/promote/[siteId]/route.ts`.

## Exports (1)

- `async handlePromote(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (2)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

