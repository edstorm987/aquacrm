# `src/lib/server/assistants/externalAdvisorContext.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `async buildExternalAdvisorContext(auth: ExternalAssistantAuth, now = Date.now())`
- `externalAssistantDomains(modules: ExternalAssistantModule[]): AdvisorDomain[]`

## Depends on (5)

- [`src/lib/advisor/advisorActions.ts`](../advisorActions.md)
- [`src/lib/radar/businessRadar.ts`](../businessRadar.md)
- [`src/lib/intelligence/operationalAttention.ts`](../operationalAttention.md)
- [`src/lib/server/assistants/advisorContext.ts`](./advisorContext.md)
- [`src/lib/server/assistants/externalAssistantApi.ts`](./externalAssistantApi.md)

## Used by (3)

- [`src/app/api/v1/advisor/context/route.ts`](../../app/api/v1/advisor/context/route.md)
- [`src/app/api/v1/assistant/context/route.ts`](../../app/api/v1/assistant/context/route.md)
- [`src/lib/server/assistants/externalAssistantMcp.ts`](./externalAssistantMcp.md)

