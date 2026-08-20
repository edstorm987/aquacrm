# `src/built-ins/modules/fulfillment/src/server/clients.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Client creation flow with phase preset application.  Splits cleanly into three steps that the API handler / page wraps in a transaction-flavoured "all-or-nothing":  1. Create the Client row (`clientStore.createClient`). 2. Install the phase's plugin preset for this client. 3. Apply the starter portal variant. 4. Initialise the checklist for the phase. 5. Activity log + event.  On failure mid-flight the partial state is logged but not rolled back — the agency owner sees a client in an "incomplete" state and can retry. Future hardening: wrap in a unit-of-work once the storage layer exposes one.

## Exports (3)

- `interface CreateClientWithPhaseInput (9 members)`
- `interface CreateClientWithPhaseResult (4 members)`
- `class ClientLifecycleService`
    - `constructor(private clients: ClientStorePort, private runtime: PluginRuntimePort, private activity: ActivityLogPort, private events: EventBusPort, private phases: PhaseService, private checklist: ChecklistService, private variants: Starter…`
    - `async createWithPhase(input: CreateClientWithPhaseInput): Promise<CreateClientWithPhaseResult>`

## Depends on (5)

- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/fulfillment/src/server/checklist.ts`](./checklist.md)
- [`src/built-ins/modules/fulfillment/src/server/phases.ts`](./phases.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/fulfillment/src/server/starterVariant.ts`](./starterVariant.md)

## Used by (2)

- [`scripts/smoke-stage-jump.test.ts`](../../../../../../scripts/smoke-stage-jump.test.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)

