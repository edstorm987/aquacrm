# `src/lib/server/assistants/externalAssistantKeys.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `EXTERNAL_ASSISTANT_PERMISSIONS`
- `interface ExternalAssistantApiKeySummary (13 members)`
- `listExternalAssistantApiKeys(agencyId: string): ExternalAssistantApiKeySummary[]`
- `createExternalAssistantApiKey(input: ApiKeyInput): { key: ExternalAssistantApiKeySummary; token: string; }`
- `revokeExternalAssistantApiKey(input: { agencyId: string; keyId: string; revokedBy: string; }): ExternalAssistantApiKeySummary`
- `rotateExternalAssistantApiKey(input: { agencyId: string; keyId: string; createdBy: string; }): { key: ExternalAssistantApiKeySummary; token: string }`
- `findExternalAssistantApiKey(token: string): ExternalAssistantApiKey | null`
- `touchExternalAssistantApiKey(keyId: string): void`

## Depends on (3)

- [`src/server/activity.ts`](../../server/activity.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (4)

- [`src/app/api/portal/settings/external-ai/route.ts`](../../app/api/portal/settings/external-ai/route.md)
- [`src/app/portal/agency/settings/page.tsx`](../../app/portal/agency/settings/page.md)
- [`src/app/portal/dev-team/api/page.tsx`](../../app/portal/dev-team/api/page.md)
- [`src/lib/server/assistants/externalAssistantApi.ts`](./externalAssistantApi.md)

