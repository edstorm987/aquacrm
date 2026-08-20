# `src/lib/server/dev/devTeamAuditor.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `interface AuditFinding (7 members)`
- `interface DevTeamAudit (4 members)`
- `parseAuditFindings(md: string): AuditFinding[]`
- `countStillOpenFindings(findings: AuditFinding[]): number`
- `async scanAuditFindings(): Promise<AuditFinding[]>`
- `readinessContextForAgency(agencyId: string): ReadinessContext`
- `async scanDevTeamAudit(context: ReadinessContext = {}): Promise<DevTeamAudit>`

## Depends on (5)

- [`src/lib/server/assistants/externalAssistantKeys.ts`](../assistants/externalAssistantKeys.md)
- [`src/lib/server/dev/devDocs.ts`](./devDocs.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../integrations/integrationConnections.md)
- [`src/lib/server/productionReadiness.ts`](../productionReadiness.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)

## Used by (1)

- [`src/app/portal/dev-team/auditor/_Section.tsx`](../../../app/portal/dev-team/auditor/_Section.md)

