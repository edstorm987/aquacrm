# `src/lib/server/portal/previewPhase.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `PREVIEW_PHASE_COOKIE`
- `PREVIEW_PHASE_MAX_AGE`
- `async getPreviewPhase(): Promise<PhaseDefinition | null>`
- `interface PreviewCookie (3 members)`
- `previewPhaseCookie(phaseId: string | null): PreviewCookie`
- `escapeStyleContent(css: string): string`
- `escapeScriptContent(js: string): string`

## Depends on (2)

- [`src/server/phases.ts`](../../../server/phases.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (2)

- [`src/app/api/auth/preview-as-client-at-phase/route.ts`](../../../app/api/auth/preview-as-client-at-phase/route.md)
- [`src/app/portal/clients/[clientId]/layout.tsx`](../../../app/portal/clients/[clientId]/layout.md)

