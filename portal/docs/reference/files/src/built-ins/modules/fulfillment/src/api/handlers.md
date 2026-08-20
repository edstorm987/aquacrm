# `src/built-ins/modules/fulfillment/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** API handlers — pure request/response functions invoked by the manifest's `api` routes. Each handler receives a fresh `PluginCtx` that the foundation builds per request, carrying scope (agencyId/clientId), the install record, the actor user id, plugin storage, and the dependency- injected services container.  Convention: every handler returns a `Response` (Web Fetch API) and never throws to the caller. Errors become 4xx/5xx JSON responses with a shape the clients can reliably parse.

## Exports (19)

- `async listClientsHandler(_req: Request, ctx: PluginCtx): Promise<Response>`
- `interface CreateClientBody (7 members)`
- `async createClientHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `interface AdvancePhaseBody (4 members)`
- `async advancePhaseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `interface TickItemBody (5 members)`
- `async tickItemHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getChecklistHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listPhasesHandler(_req: Request, ctx: PluginCtx): Promise<Response>`
- `interface UpsertPhaseBody (8 members)`
- `async upsertPhaseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deletePhaseHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async marketplaceListHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `interface MarketplaceMutationBody (4 members)`
- `async marketplaceInstallHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async marketplaceSetEnabledHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async marketplaceUninstallHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listActivityHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listPhasePresetsHandler(_req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (2)

- [`src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](../server/index.md)

## Used by (1)

- [`src/built-ins/modules/fulfillment/src/api/routes.ts`](./routes.md)

