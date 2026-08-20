# `src/built-ins/modules/client-crm/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** HTTP handlers for the client-CRM plugin.

## Exports (15)

- `async listContactsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createContactHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateContactHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteContactHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async importContactsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async addNoteHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listContactActivityHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listSegmentsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createSegmentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateSegmentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteSegmentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listSegmentMembersHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async ingestEventHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meProfileHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async meUpdateProfileHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/client-crm/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/client-crm/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/client-crm/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by (1)

- [`src/built-ins/modules/client-crm/src/api/routes.ts`](./routes.md)

