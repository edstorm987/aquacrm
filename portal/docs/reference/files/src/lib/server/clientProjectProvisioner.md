# `src/lib/server/clients/clientProjectProvisioner.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `CLIENT_PROJECT_STARTERS`
- `type ClientProjectStarterId`
- `interface ProvisionClientProjectInput (8 members)`
- `interface ProvisionedClientProject (6 members)`
- `slugifyProject(value: string): string`
- `isProvisionedClientProjectPath(localPath: string): boolean`
- `provisionClientProject(input: ProvisionClientProjectInput): ProvisionedClientProject`

## Used by (3)

- [`src/app/api/tenants/client-projects/provision/route.ts`](../../app/api/tenants/client-projects/provision/route.md)
- [`src/lib/server/integrations/githubProjectPublisher.ts`](./githubProjectPublisher.md)
- [`src/lib/server/integrations/vercelProjectDeployer.ts`](./vercelProjectDeployer.md)

