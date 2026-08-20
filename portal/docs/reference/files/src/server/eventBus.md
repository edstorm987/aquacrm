# `src/server/eventBus.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (7)

- `type AquaEventName`
- `interface AquaEvent (5 members)`
- `on(name: EventName | "*", handler: Handler): () => void`
- `subscribeForPlugin(pluginId: string, eventName: EventName, handler: Handler): () => void`
- `emit<T = unknown>(scope: { agencyId: string; clientId?: string }, name: EventName, payload: T): void`
- `describeSubscribers(): Array<{ event: string; handlers: number; pluginHandlers: number }>`
- `_resetForTests(): void`

## Used by (13)

- [`src/built-ins/runtime/_runtime.ts`](../built-ins/runtime/_runtime.md)
- [`src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts`](../built-ins/runtime/foundation-adapters/_eventSubscribers.md)
- [`src/built-ins/runtime/foundation-adapters/_foundationPorts.ts`](../built-ins/runtime/foundation-adapters/_foundationPorts.md)
- [`src/built-ins/runtime/foundation-adapters/eventBusAdapter.ts`](../built-ins/runtime/foundation-adapters/eventBusAdapter.md)
- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/built-ins/runtime/foundation-adapters/personClientSeeding.ts`](../built-ins/runtime/foundation-adapters/personClientSeeding.md)
- [`src/lib/server/radar/radarSeeding.ts`](../lib/server/radar/radarSeeding.md)
- [`src/server/completedActions.ts`](./completedActions.md)
- [`src/server/organisations.ts`](./organisations.md)
- [`src/server/persons.ts`](./persons.md)
- [`src/server/pipelines.ts`](./pipelines.md)
- [`src/server/tenants.ts`](./tenants.md)
- [`src/server/users.ts`](./users.md)

