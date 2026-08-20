# `src/built-ins/modules/website-editor/src/lib/funnels.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (18)

- `type FunnelStatus`
- `type StepType`
- `interface FunnelStep (7 members)`
- `interface Funnel (8 members)`
- `listFunnels(): Funnel[]`
- `getFunnel(id: string): Funnel | undefined`
- `async refreshFunnels(): Promise<Funnel[]>`
- `interface CreateFunnelInput (3 members)`
- `async createFunnel(input: CreateFunnelInput): Promise<Funnel | null>`
- `async saveFunnel(funnel: Funnel): Promise<void>`
- `async patchFunnel(id: string, patch: Partial<Funnel>): Promise<void>`
- `async deleteFunnel(id: string): Promise<void>`
- `async setFunnelStatus(id: string, status: FunnelStatus): Promise<void>`
- `interface FunnelStats (4 members)`
- `async fetchFunnelStats(funnelId: string): Promise<FunnelStats | null>`
- `async resetFunnelStats(funnelId: string): Promise<void>`
- `funnelConversionRate(funnel: Funnel): number`
- `onFunnelsChange(handler: () => void): () => void`

## Used by (3)

- [`src/built-ins/modules/website-editor/src/components/editor/EditorFunnelStage.tsx`](../components/editor/EditorFunnelStage.md)
- [`src/built-ins/modules/website-editor/src/components/editor/EditorOutliner.tsx`](../components/editor/EditorOutliner.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../pages/EditorPage.md)

