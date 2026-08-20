# `src/built-ins/modules/website-editor/src/lib/splitTests.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (7)

- `async listGroups(siteId?: string): Promise<SplitTestGroup[]>`
- `async createGroup(input: { siteId: string; name: string; description?: string; trafficPercent?: number; stickyBy?: "visitor" | "session"; goalEvent?: string; }): Promise<SplitTestGroup | null>`
- `async patchGroup(id: string, patch: Partial<Pick<SplitTestGroup, "name" | "description" | "status" | "trafficPercent" | "stickyBy" | "goalEvent" | "endsAt" | "blockRefs">> & { setStatus?: SplitTestStatus }): Promise<SplitTestGroup | null>`
- `async deleteGroup(id: string): Promise<boolean>`
- `async getGroupResults(id: string): Promise<{ group: SplitTestGroup | null; results: SplitTestResult[] }>`
- `onSplitTestsChange(cb: () => void): () => void`
- `statusTone(s: SplitTestStatus): string`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/components/canvas/PropertiesPanel.tsx`](../components/canvas/PropertiesPanel.md)

