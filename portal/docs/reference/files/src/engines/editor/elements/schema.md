# `src/engines/editor/elements/schema.ts`

← [File index](../../../../../files-index.md) · Area: Other

**What it is:** The machine-checkable half of an element definition.  P2 of the element engine. `PropField` is a *form widget* descriptor — it says which control the properties panel should draw. It cannot answer "is this a legal value for this prop", which is the question an edit engine (and an assistant proposing edits) has to answer before anything is published.  `ElementSchema` is that answer, and it is GENERATED from `fields`. There is deliberately no way to hand-write one: a second declaration of the same contract is exactly the drift this phase exists to delete. The one thing the generator cannot invent is intent, so anything it needs beyond the widget type (`required`, `min`, `pattern`, …) is an optional member on `PropField` itself — still one declaration.  Runtime-dependency-free, same rule as the rest of `src/engines/editor/elements`.

## Exports (7)

- `interface ElementPropSchema (11 members)`
- `interface ElementSchema (5 members)`
- `buildElementSchema(def: Pick<BlockDefinition, "type" | "fields" | "defaultProps" | "isContainer" | "surfaces">): ElementSchema`
- `elementSchema(def: BlockDefinition): ElementSchema`
- `interface ElementPropProblem (2 members)`
- `validateElementProps(schema: ElementSchema, props: Record<string, unknown>): ElementPropProblem[]`
- `assertDefinitionConsistent(def: Pick<BlockDefinition, "type" | "fields" | "defaultProps" | "isContainer" | "surfaces">): ElementPropProblem[]`

## Depends on (1)

- [`src/engines/editor/elements/definition.ts`](./definition.md)

## Used by (5)

- [`scripts/smoke-element-engine.test.ts`](../../../../scripts/smoke-element-engine.test.md)
- [`scripts/smoke-portal-elements.test.ts`](../../../../scripts/smoke-portal-elements.test.md)
- [`src/engines/editor/elements/definition.ts`](./definition.md)
- [`src/engines/editor/elements/index.ts`](./index.md)
- [`src/engines/editor/elements/registry.ts`](./registry.md)

