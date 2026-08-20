# `src/lib/server/integrations/integrationConnections.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (13)

- `integrationVaultAvailable(): boolean`
- `listIntegrationConnections(agencyId: string): PublicIntegrationConnection[]`
- `listManagedIntegrationProviders(agencyId: string): IntegrationProvider[]`
- `listAgencyIdsForProvider(provider: IntegrationProvider): string[]`
- `getIntegrationConnection(agencyId: string, connectionId: string): IntegrationConnection | null`
- `saveIntegrationConnection(input: SaveIntegrationConnectionInput): PublicIntegrationConnection`
- `revokeIntegrationConnection(input: { agencyId: string; connectionId: string; actorUserId: string; actorEmail?: string; }): PublicIntegrationConnection`
- `resolveIntegrationValues(agencyId: string, provider: IntegrationProvider, options: ResolveIntegrationOptions = {}): Record<string, string>`
- `resolveIntegrationConnectionValues(agencyId: string, connectionId: string): Record<string, string>`
- `markIntegrationConnectionSynced(agencyId: string, connectionId: string, syncedAt = Date.now()): PublicIntegrationConnection`
- `async testIntegrationConnection(agencyId: string, connectionId: string, actor: { userId: string; email?: string }, fetchImpl: typeof fetch = fetch): Promise<PublicIntegrationConnection>`
- `publicIntegrationConnection(connection: IntegrationConnection): PublicIntegrationConnection`
- `MANAGED_INTEGRATION_PROVIDERS`

## Depends on (7)

- [`src/lib/integrations/catalog.ts`](../../integrations/catalog.md)
- [`src/lib/integrations/types.ts`](../../integrations/types.md)
- [`src/lib/server/auth/founderAgency.ts`](../auth/founderAgency.md)
- [`src/lib/server/integrations/googleSearchConsole.ts`](./googleSearchConsole.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (14)

- [`src/app/api/portal/performance/search-console/route.ts`](../../../app/api/portal/performance/search-console/route.md)
- [`src/app/api/portal/settings/integrations/route.ts`](../../../app/api/portal/settings/integrations/route.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/app/portal/agency/settings/page.tsx`](../../../app/portal/agency/settings/page.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../../../built-ins/modules/leads-pipeline/src/api/handlers.md)
- [`src/lib/server/assistants/openaiAssistant.ts`](../assistants/openaiAssistant.md)
- [`src/lib/server/dev/devTeamAuditor.ts`](../dev/devTeamAuditor.md)
- [`src/lib/server/email/enquiryNotifications.ts`](../email/enquiryNotifications.md)
- [`src/lib/server/email/outboundCommunications.ts`](../email/outboundCommunications.md)
- [`src/lib/server/email/transactionalEmail.ts`](../email/transactionalEmail.md)
- [`src/lib/server/integrations/githubProjectPublisher.ts`](./githubProjectPublisher.md)
- [`src/lib/server/integrations/metaMessaging.ts`](./metaMessaging.md)
- [`src/lib/server/integrations/vercelProjectDeployer.ts`](./vercelProjectDeployer.md)
- [`src/lib/server/marketingIntelligence.ts`](../marketingIntelligence.md)

