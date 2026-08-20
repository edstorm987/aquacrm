# `src/lib/server/assistants/externalAssistantProposals.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `interface SubmitExternalAssistantProposalInput (13 members)`
- `listExternalAssistantActionProposals(agencyId: string, statuses?: ExternalAssistantProposalStatus[]): ExternalAssistantActionProposal[]`
- `listProposalsForExternalAssistant(agencyId: string, assistantFingerprint: string): ExternalAssistantActionProposal[]`
- `submitExternalAssistantActionProposal(input: SubmitExternalAssistantProposalInput): ExternalAssistantActionProposal`
- `decideExternalAssistantActionProposal(input: { agencyId: string; proposalId: string; decision: "accept" | "park" | "reject"; actorUserId: string; assigneeUserId?: string; dueAt?: number; parkedUntil?: number; note?: string; }): { proposal:…`

## Depends on (4)

- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tasks.ts`](../../../server/tasks.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (5)

- [`src/app/api/portal/external-ai/proposals/route.ts`](../../../app/api/portal/external-ai/proposals/route.md)
- [`src/app/api/v1/actions/proposals/route.ts`](../../../app/api/v1/actions/proposals/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../../app/portal/agency/actions/_ActionsPage.md)
- [`src/lib/server/assistants/externalAssistantMcp.ts`](./externalAssistantMcp.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../inbox/operationalAlerts.md)

