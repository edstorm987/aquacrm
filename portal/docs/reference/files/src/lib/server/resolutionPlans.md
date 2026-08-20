# `src/lib/server/resolutionPlans.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `async resolutionPlanFor(agencyId: string, alertId: string): Promise<ResolutionPlan | null>`
- `async resolutionExplainFor(agencyId: string, alertId: string, now = Date.now()): Promise<ResolutionExplain | null>`
- `async resolutionEvidenceFor(agencyId: string, alertId: string, now = Date.now()): Promise<ResolutionEvidence | null>`
- `async radarEvidenceFor(agencyId: string, alertId: string): Promise<ResolutionEvidence | null>`

## Depends on (17)

- [`src/lib/clients/clientContracts.ts`](../clients/clientContracts.md)
- [`src/lib/clients/clientPaymentPlans.ts`](../clients/clientPaymentPlans.md)
- [`src/lib/clients/clientWorkspace.ts`](../clients/clientWorkspace.md)
- [`src/lib/inbox/evidenceSteps.ts`](../inbox/evidenceSteps.md)
- [`src/lib/inbox/resolutionContext.ts`](../inbox/resolutionContext.md)
- [`src/lib/inbox/resolutionEvidence.ts`](../inbox/resolutionEvidence.md)
- [`src/lib/inbox/resolutionExplain.ts`](../inbox/resolutionExplain.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](./inbox/operationalAlerts.md)
- [`src/lib/server/radar/businessIssueRadar.ts`](./radar/businessIssueRadar.md)
- [`src/lib/server/radar/radarEvidenceVault.ts`](./radar/radarEvidenceVault.md)
- [`src/lib/server/websiteEnquiries.ts`](./websiteEnquiries.md)
- [`src/server/completedActions.ts`](../../server/completedActions.md)
- [`src/server/organisations.ts`](../../server/organisations.md)
- [`src/server/persons.ts`](../../server/persons.md)
- [`src/server/tasks.ts`](../../server/tasks.md)
- [`src/server/tenants.ts`](../../server/tenants.md)
- [`src/server/users.ts`](../../server/users.md)

## Used by (1)

- [`src/app/api/portal/attention/plan/route.ts`](../../app/api/portal/attention/plan/route.md)

