# `src/lib/server/assistants/externalAssistantApi.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (18)

- `EXTERNAL_ASSISTANT_MODULES`
- `type ExternalAssistantModule`
- `interface ExternalAssistantRecord (7 members)`
- `interface ExternalAssistantAuth (7 members)`
- `class ExternalAssistantApiError`
    - `constructor(status: number, code: string, message: string, retryAfter?: number)`
- `async authenticateExternalAssistant(request: Request): Promise<ExternalAssistantAuth>`
- `externalApiErrorResponse(error: unknown): Response`
- `externalApiHeaders(): Headers`
- `isExternalAssistantModule(value: string): value is ExternalAssistantModule`
- `requireExternalAssistantPermission(auth: ExternalAssistantAuth, permission: ExternalAssistantApiPermission): void`
- `requireExternalAssistantModule(auth: ExternalAssistantAuth, module: ExternalAssistantModule): void`
- `listExternalAssistantRecords(agencyId: string, module: ExternalAssistantModule): ExternalAssistantRecord[]`
- `buildExternalAssistantContext(agencyId: string, allowedModules: ExternalAssistantModule[] = [...EXTERNAL_ASSISTANT_MODULES], permissions: ExternalAssistantApiPermission[] = [...EXTERNAL_ASSISTANT_PERMISSIONS])`
- `findExternalAssistantRecord(agencyId: string, module: ExternalAssistantModule, recordId: string): ExternalAssistantRecord | null`
- `searchExternalAssistantRecords(agencyId: string, query: string, modules: ExternalAssistantModule[], limit: number): Array<ExternalAssistantRecord & { score: number }>`
- `filterAndPaginateRecords(records: ExternalAssistantRecord[], options: { status?: string; updatedAfter?: string; cursor?: string; limit: number; })`
- `recordsToCsv(records: ExternalAssistantRecord[]): string`
- `sanitizeExternalData(value: unknown, depth = 0, key = ""): unknown`

## Depends on (7)

- [`src/lib/clients/clientWorkspace.ts`](../clientWorkspace.md)
- [`src/lib/shared/formatDateTime.ts`](../formatDateTime.md)
- [`src/lib/server/assistants/externalAssistantKeys.ts`](./externalAssistantKeys.md)
- [`src/lib/server/rateLimit.ts`](./rateLimit.md)
- [`src/server/activity.ts`](../../server/activity.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (13)

- [`src/app/api/mcp/route.ts`](../../app/api/mcp/route.md)
- [`src/app/api/portal/settings/external-ai/route.ts`](../../app/api/portal/settings/external-ai/route.md)
- [`src/app/api/v1/actions/proposals/route.ts`](../../app/api/v1/actions/proposals/route.md)
- [`src/app/api/v1/advisor/context/route.ts`](../../app/api/v1/advisor/context/route.md)
- [`src/app/api/v1/assistant/context/route.ts`](../../app/api/v1/assistant/context/route.md)
- [`src/app/api/v1/export/route.ts`](../../app/api/v1/export/route.md)
- [`src/app/api/v1/openapi.json/route.ts`](../../app/api/v1/openapi.json/route.md)
- [`src/app/api/v1/records/[recordId]/route.ts`](../../app/api/v1/records/[recordId]/route.md)
- [`src/app/api/v1/records/route.ts`](../../app/api/v1/records/route.md)
- [`src/app/api/v1/search/route.ts`](../../app/api/v1/search/route.md)
- [`src/app/portal/dev-team/api/page.tsx`](../../app/portal/dev-team/api/page.md)
- [`src/lib/server/assistants/externalAdvisorContext.ts`](./externalAdvisorContext.md)
- [`src/lib/server/assistants/externalAssistantMcp.ts`](./externalAssistantMcp.md)

