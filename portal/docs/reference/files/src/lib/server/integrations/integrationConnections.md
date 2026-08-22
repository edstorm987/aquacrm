# `src/lib/server/integrations/integrationConnections.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (14)

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
- `scrubSecrets(message: string, secrets: string[] = []): string`
- `MANAGED_INTEGRATION_PROVIDERS`

## Depends on (7)

- [`src/lib/integrations/catalog.ts`](../../integrations/catalog.md)
- [`src/lib/integrations/types.ts`](../../integrations/types.md)
- [`src/lib/server/auth/founderAgency.ts`](../auth/founderAgency.md)
- [`src/lib/server/integrations/googleSearchConsole.ts`](./googleSearchConsole.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (25)

- [`scripts/smoke-aqua-editor-ai-token.test.ts`](../../../../scripts/smoke-aqua-editor-ai-token.test.md)
- [`src/app/api/portal/dev/editor-ai/route.ts`](../../../app/api/portal/dev/editor-ai/route.md)
- [`src/app/api/portal/dev/projects/route.ts`](../../../app/api/portal/dev/projects/route.md)
- [`src/app/api/portal/performance/search-console/route.ts`](../../../app/api/portal/performance/search-console/route.md)
- [`src/app/api/portal/settings/integrations/route.ts`](../../../app/api/portal/settings/integrations/route.md)
- [`src/app/api/portal/site-editor/files/route.ts`](../../../app/api/portal/site-editor/files/route.md)
- [`src/app/portal/agency/settings/page.tsx`](../../../app/portal/agency/settings/page.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../../../built-ins/modules/leads-pipeline/src/api/handlers.md)
- [`src/engines/editor/server/devProjects.ts`](../../../engines/editor/server/devProjects.md)
- [`src/engines/editor/server/editorAi.ts`](../../../engines/editor/server/editorAi.md)
- [`src/engines/editor/server/editorAiReply.ts`](../../../engines/editor/server/editorAiReply.md)
- [`src/engines/editor/server/mapProject.ts`](../../../engines/editor/server/mapProject.md)
- [`src/engines/editor/server/sourceEdit.ts`](../../../engines/editor/server/sourceEdit.md)
- [`src/lib/server/assistants/openaiAssistant.ts`](../assistants/openaiAssistant.md)
- [`src/lib/server/dev/devTeamAuditor.ts`](../dev/devTeamAuditor.md)
- [`src/lib/server/dev/fileFinding.ts`](../dev/fileFinding.md)
- [`src/lib/server/email/enquiryNotifications.ts`](../email/enquiryNotifications.md)
- [`src/lib/server/email/outboundCommunications.ts`](../email/outboundCommunications.md)
- [`src/lib/server/email/transactionalEmail.ts`](../email/transactionalEmail.md)
- [`src/lib/server/integrations/githubProjectPublisher.ts`](./githubProjectPublisher.md)
- [`src/lib/server/integrations/metaMessaging.ts`](./metaMessaging.md)
- [`src/lib/server/integrations/vercelProjectDeployer.ts`](./vercelProjectDeployer.md)
- [`src/lib/server/marketingIntelligence.ts`](../marketingIntelligence.md)
- [`src/lib/server/plugins/pluginSecretConfig.ts`](../plugins/pluginSecretConfig.md)
- [`src/lib/server/plugins/pluginSettingsSurface.ts`](../plugins/pluginSettingsSurface.md)

