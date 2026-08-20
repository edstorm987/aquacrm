# `src/built-ins/modules/website-editor/src/server/components.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R028 — Reusable block-group components.  Per-install registry of named block trees. Operators select N blocks, "Save as component" snapshots the tree under a name; the editor surfaces a `componentRef` block whose `componentId` points back here, and the renderer expands the ref inline against the current source tree.  Storage: t/<a>/<c>/website-editor/components/index           → string[] (newest-first) t/<a>/<c>/website-editor/components/by-id/<id>      → ComponentRecord  Pure server module — host pages compose with the existing block- tree mutation flow.

## Exports (12)

- `type ComponentCategory`
- `COMPONENT_CATEGORIES: readonly ComponentCategory[]`
- `interface ComponentRecord (8 members)`
- `interface CreateComponentInput (7 members)`
- `async createComponent(storage: PluginStorage, input: CreateComponentInput): Promise<ComponentRecord>`
- `async getComponent(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string): Promise<ComponentRecord | null>`
- `async listComponents(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId): Promise<ComponentRecord[]>`
- `interface UpdateComponentPatch (4 members)`
- `async updateComponent(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string, patch: UpdateComponentPatch): Promise<ComponentRecord | null>`
- `async deleteComponent(storage: PluginStorage, agencyId: AgencyId, clientId: ClientId, id: string): Promise<boolean>`
- `expandComponentRefs(blocks: Block[], components: Record<string, ComponentRecord>, depth = 0): Block[]`
- `countComponentRefs(blocks: Block[]): Record<string, number>`

## Depends on (3)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r028-block-group-reuse.test.ts`](../__smoke__/r028-block-group-reuse.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/components.ts`](../api/handlers/components.md)

