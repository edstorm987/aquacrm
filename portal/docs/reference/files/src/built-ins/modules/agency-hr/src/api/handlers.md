# `src/built-ins/modules/agency-hr/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** HTTP handlers for the agency-HR plugin. Each handler unpacks a `PluginCtx`, calls into the per-request container built via `containerFor({...})`, and returns a JSON response.  Conventions: - 200 on success with `{ ok: true, ...payload }` - 400 on validation errors - 404 when the resource doesn't belong to the agency - 422 when business rules block (e.g. cycles) - 500 on unexpected throws

## Exports (17)

- `async listStaffHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createStaffHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getStaffHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateStaffHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async archiveStaffHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listDepartmentsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createDepartmentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateDepartmentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteDepartmentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async requestLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async decideLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async cancelLeaveHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listRolesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createRoleHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateRoleHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteRoleHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/agency-hr/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-hr/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-hr/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by (1)

- [`src/built-ins/modules/agency-hr/src/api/routes.ts`](./routes.md)

