# `src/built-ins/modules/website-editor/src/api/handlers/forcePassword.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R007 — Force-password-change API handlers.  All endpoints are agency-scoped (admins toggle the flag for users in their agency). The login-time redirect itself is foundation work — these handlers expose the toggle + state read.

## Exports (2)

- `async handleGetForcePassword(req: Request, ctx: PluginCtx): Promise<Response>`
- `async handleSetForcePassword(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/api/helpers.ts`](../helpers.md)
- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/server/forcePasswordChange.ts`](../../server/forcePasswordChange.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r007-cookie-force-password.test.ts`](../../__smoke__/r007-cookie-force-password.test.md)
- [`src/built-ins/modules/website-editor/src/api/routes.ts`](../routes.md)

