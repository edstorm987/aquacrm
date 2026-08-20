# `src/lib/server/openaiAssistant.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (4)

- `isAssistantConfigured(agencyId?: string)`
- `assistantModel(agencyId?: string)`
- `async askMilesymediaAssistant(input: { agencyId: string; userName: string; memories: AssistantMemory[]; history: AssistantMessage[]; businessContext: string; contextTruncated: boolean; question: string; skill: AdvisorSkill; }): Promise<str…`
- `async suggestAdvisorActions(input: { agencyId: string; businessContext: string; alerts: OperationalAlert[]; radarIssues: BusinessRadarIssue[]; recommendedActions?: AdvisorActionSuggestion[]; existingTaskTitles: string[]; skill: AdvisorSkil…`

## Depends on (7)

- [`src/lib/advisorActions.ts`](../advisorActions.md)
- [`src/lib/advisorSkills.ts`](../advisorSkills.md)
- [`src/lib/businessRadar.ts`](../businessRadar.md)
- [`src/lib/server/advisorSkills.ts`](./advisorSkills.md)
- [`src/lib/server/integrationConnections.ts`](./integrationConnections.md)
- [`src/lib/server/operationalAlerts.ts`](./operationalAlerts.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (5)

- [`src/app/api/assistant/route.ts`](../../app/api/assistant/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/assistant/page.tsx`](../../app/portal/agency/assistant/page.md)
- [`src/app/portal/agency/page.tsx`](../../app/portal/agency/page.md)
- [`src/components/chrome/AdvisorDrawerControl.tsx`](../../components/chrome/AdvisorDrawerControl.md)

