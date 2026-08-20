# `src/built-ins/modules/leads-pipeline/src/api/handlers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** HTTP handlers for the leads-pipeline plugin.  Mirrors the agency-hr convention: 200 on success with `{ ok: true, ...payload }`, 400 on validation, 404 on missing, 422 on business rule violation.

## Exports (37)

- `async prospectsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async importProspectsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async qualifyProspectHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async prospectOutreachHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async prospectNotesHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async prospectInspectionHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async prospectFollowUpsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async dismissProspectHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async getCommercialPackHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async saveCommercialPackHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async sendCommercialPackHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async recordCommercialPaymentHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createCommercialStripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async commercialStripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listLeadsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createLeadHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateLeadHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateLeadStatusHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateLeadMeetingHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async markLeadContactedHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async convertLeadToClientHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async archiveLeadHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async previewCsvHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async importCsvHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async contactConfigurationHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listContactsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createContactHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateContactHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async convertContactToClientHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async addContactToBoardHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateContactMeetingHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async markContactContactedHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async listCampaignsHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async createCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async updateCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async sendCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response>`
- `async previewAudienceHandler(req: Request, ctx: PluginCtx): Promise<Response>`

## Depends on (18)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/clientMatch.ts`](../lib/clientMatch.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/safeDate.ts`](../lib/safeDate.md)
- [`src/built-ins/modules/leads-pipeline/src/server/csv.ts`](../server/csv.md)
- [`src/built-ins/modules/leads-pipeline/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)
- [`src/built-ins/modules/leads-pipeline/src/server/prospects.ts`](../server/prospects.md)
- [`src/lib/portal/portalProducts.ts`](../../../../../lib/portal/portalProducts.md)
- [`src/lib/products/productAssignments.ts`](../../../../../lib/products/productAssignments.md)
- [`src/lib/server/clients/customerPortalProvisioning.ts`](../../../../../lib/server/clients/customerPortalProvisioning.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../../../../../lib/server/integrations/integrationConnections.md)
- [`src/lib/server/websiteEnquiries.ts`](../../../../../lib/server/websiteEnquiries.md)
- [`src/server/agencyProducts.ts`](../../../../../server/agencyProducts.md)
- [`src/server/clientPortalSetup.ts`](../../../../../server/clientPortalSetup.md)
- [`src/server/pipelines.ts`](../../../../../server/pipelines.md)
- [`src/server/storage.ts`](../../../../../server/storage.md)
- [`src/server/tenants.ts`](../../../../../server/tenants.md)
- [`src/server/types.ts`](../../../../../server/types.md)

## Used by (1)

- [`src/built-ins/modules/leads-pipeline/src/api/routes.ts`](./routes.md)

