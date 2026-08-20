# `src/lib/server/integrations/githubProjectPublisher.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface GitHubPublishingConfig (2 members)`
- `interface PublishedGitHubProject (5 members)`
- `isGitHubPublishingConfigured(env: NodeJS.ProcessEnv = process.env): boolean`
- `isGitHubPublishingConfiguredForAgency(agencyId: string, clientId?: string): boolean`
- `githubPublishingOwner(env: NodeJS.ProcessEnv = process.env): string | undefined`
- `githubConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GitHubPublishingConfig`
- `async publishProjectToGitHub(input: { agencyId?: string; clientId?: string; localPath: string; projectSlug: string; description: string; private?: boolean; config?: GitHubPublishingConfig; }, dependencies: PublishDependencies = {}): Promis…`

## Depends on (2)

- [`src/lib/server/clients/clientProjectProvisioner.ts`](../clients/clientProjectProvisioner.md)
- [`src/lib/server/integrations/integrationConnections.ts`](./integrationConnections.md)

## Used by (3)

- [`src/app/api/tenants/client-projects/publish/route.ts`](../../../app/api/tenants/client-projects/publish/route.md)
- [`src/app/portal/agency/development/projects/[projectId]/page.tsx`](../../../app/portal/agency/development/projects/[projectId]/page.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../../app/portal/clients/[clientId]/page.md)

