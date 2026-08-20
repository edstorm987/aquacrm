# `src/built-ins/modules/fulfillment/src/server/transitions.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Phase transitions — advancing a client from one phase to the next.  Algorithm (locked in `04-architecture.md §7` and Decisions log #4):  1. Disable old phase's plugins (`enabled = false`, config preserved). 2. Enable / install new phase's plugins (re-enable if already present). 3. Apply new phase's starter portal variant (T3 integration via `StarterVariantService`). 4. Update `client.stage = toPhase.stage`. 5. Initialise the checklist progress for the new phase. 6. Append an `ActivityLog` entry. 7. Emit `phase.advanced` on the eventBus.  Auto-disable, config preserved. Reversible. Never auto-uninstall.

## Exports (4)

- `interface AdvancePhaseArgs (8 members)`
- `interface AdvancePhaseResult (6 members)`
- `interface AdvancePhaseFailure (4 members)`
- `class TransitionService`
    - `constructor(private clients: ClientStorePort, private installs: PluginInstallStorePort, private runtime: PluginRuntimePort, private activity: ActivityLogPort, private events: EventBusPort, private checklist: ChecklistService, private varia…`
    - `async advancePhase(args: AdvancePhaseArgs): Promise<AdvancePhaseResult | AdvancePhaseFailure>`

## Depends on (4)

- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/fulfillment/src/server/checklist.ts`](./checklist.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/fulfillment/src/server/starterVariant.ts`](./starterVariant.md)

## Used by (2)

- [`scripts/smoke-stage-jump.test.ts`](../../../../../../scripts/smoke-stage-jump.test.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)

