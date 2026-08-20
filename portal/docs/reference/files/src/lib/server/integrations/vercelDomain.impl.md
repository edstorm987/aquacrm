# `src/lib/server/integrations/vercelDomain.impl.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Foundation-level Vercel domain-attach API client (impl). Test-friendly: NO `import "server-only"` so the smoke at `scripts/smoke-vercel-domain.test.ts` can import it via tsx. The server-only guard lives in `vercelDomain.ts`, the public re-export. Application code SHOULD import from `vercelDomain.ts`; only the smoke imports this impl file directly.  Same surface as `02 felicias aqua portal work/src/lib/vercel/server.ts` (lifted per architecture §13 parked-item directive) but adapted for the multi-tenant pool model:  - Token + project-id + team-id are arguments, not env-only — the foundation reads `VERCEL_TOKEN` from env (operator-level secret), but the project id varies per per-Live-client deployment, so the caller passes it in. - Errors return typed results instead of throwing — handlers care about happy / sad path, not stack traces.  Existing parallel copy at `04-the-final-portal/plugins/domains/src/server/vercelClient.ts` (T6 R1 Phase C). The plugin keeps its standalone copy so it tsc-cleans without depending on the portal; once the foundation wires the plugin as a workspace dep (foundation-pending per `04-deployment-domains-observability.md` §4), this module becomes the single source and the plugin re-exports.  Reference: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain

## Exports (11)

- `interface VercelDomainConfig (3 members)`
- `interface DnsRequirement (4 members)`
- `interface VercelDomainResult (7 members)`
- `readEnvToken(): string | null`
- `readEnvTeamId(): string | undefined`
- `isVercelDomainConfigured(): boolean`
- `configFromEnv(args: { projectId: string; teamId?: string; }): VercelDomainConfig`
- `normaliseHostname(raw: string): string`
- `async attachDomain(cfg: VercelDomainConfig, rawHostname: string): Promise<VercelDomainResult>`
- `async verifyDomain(cfg: VercelDomainConfig, rawHostname: string): Promise<VercelDomainResult>`
- `async removeDomain(cfg: VercelDomainConfig, rawHostname: string): Promise<{ ok: boolean; hostname: string; error?: string }>`

## Used by (2)

- [`scripts/smoke-vercel-domain.test.ts`](../../../../scripts/smoke-vercel-domain.test.md)
- [`src/lib/server/integrations/vercelDomain.ts`](./vercelDomain.md)

