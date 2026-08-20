# `src/lib/server/integrations/vercelProjectDeployer.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (6)

- `interface VercelDeploymentConfig (2 members)`
- `interface VercelPreviewDeployment (6 members)`
- `isVercelProjectDeploymentConfigured(env: NodeJS.ProcessEnv = process.env): boolean`
- `isVercelProjectDeploymentConfiguredForAgency(agencyId: string, clientId?: string): boolean`
- `vercelDeploymentConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VercelDeploymentConfig`
- `async deployProjectPreviewToVercel(input: { agencyId?: string; clientId?: string; localPath: string; projectSlug: string; config?: VercelDeploymentConfig; }, dependencies: DeployDependencies = {}): Promise<VercelPreviewDeployment>`

## Depends on (2)

- [`src/lib/server/clients/clientProjectProvisioner.ts`](./clientProjectProvisioner.md)
- [`src/lib/server/integrations/integrationConnections.ts`](./integrationConnections.md)

## Used by (2)

- [`src/app/api/tenants/client-projects/deploy/route.ts`](../../app/api/tenants/client-projects/deploy/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)

