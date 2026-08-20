# `src/built-ins/modules/fulfillment/src/server/checklist.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Checklist progress tracker.  `PhaseDefinition.checklist` carries the **template** (id, label, visibility). The per-client `done` state lives in plugin-namespaced storage under the key:  progress:<clientId>:<phaseId>  The shape stored is `ChecklistProgress` — a map keyed by templateItem.id with timestamp + actor metadata, so a phase advance can audit who ticked what and when.

## Exports (5)

- `interface ChecklistItemState (4 members)`
- `interface ChecklistProgress (4 members)`
- `interface ChecklistView (7 members)`
- `interface ChecklistViewItem (4 members)`
- `class ChecklistService`
    - `constructor(private storage: PluginStorage, private events: EventBusPort)`
    - `async getProgress(clientId: ClientId, phaseId: string): Promise<ChecklistProgress>`
    - `async setProgress(progress: ChecklistProgress): Promise<void>`
    - `async viewFor(args: { agencyId: AgencyId; clientId: ClientId; phase: PhaseDefinition; }): Promise<ChecklistView>`
    - `async tickItem(args: { agencyId: AgencyId; clientId: ClientId; phase: PhaseDefinition; itemId: string; done: boolean; actor?: UserId; notes?: string; }): Promise<ChecklistProgress>`
    - `async initialiseFor(args: { clientId: ClientId; phase: PhaseDefinition; }): Promise<ChecklistProgress>`

## Depends on (4)

- [`src/built-ins/modules/fulfillment/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/fulfillment/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/fulfillment/src/server/clients.ts`](./clients.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/fulfillment/src/server/transitions.ts`](./transitions.md)

