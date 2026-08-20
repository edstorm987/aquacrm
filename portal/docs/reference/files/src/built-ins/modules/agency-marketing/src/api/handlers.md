# `src/built-ins/modules/agency-marketing/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** HTTP handlers for the agency-marketing plugin.

## Exports (17)

- `async listMarketingAssetsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createMarketingAssetHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateMarketingAssetHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteMarketingAssetHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listCampaignsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async deleteCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listLeadsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createLeadHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateLeadHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async contactLeadHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listTemplatesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async reportCampaignsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async reportLeadsHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (3)

- [`src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-marketing/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by (2)

- [`src/built-ins/modules/agency-marketing/src/__smoke__/funnel-assets.test.ts`](../__smoke__/funnel-assets.test.md)
- [`src/built-ins/modules/agency-marketing/src/api/routes.ts`](./routes.md)

