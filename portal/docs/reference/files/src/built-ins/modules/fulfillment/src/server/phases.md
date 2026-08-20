# `src/built-ins/modules/fulfillment/src/server/phases.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Phase definitions — CRUD over `PhaseDefinition` rows, scoped per agency.  Phases are stored as data, not enum. Foundation reads (sidebar showing "Phase: Onboarding") go through `services.phases`; T2 owns the writes. Agency owners can edit / reorder / archive / add phases — the six defaults are seeded from `presets.ts` on first agency creation.

## Exports (2)

- `interface PhaseUpsertInput (9 members)`
- `class PhaseService`
    - `constructor(private store: PhaseStorePort)`
    - `async seedDefaultPhases(agencyId: AgencyId): Promise<{ seeded: boolean; phases: PhaseDefinition[] }>`
    - `async listForAgency(agencyId: AgencyId): Promise<PhaseDefinition[]>`
    - `async getPhase(id: string): Promise<PhaseDefinition | null>`
    - `async getPhaseForStage(agencyId: AgencyId, stage: ClientStage): Promise<PhaseDefinition | null>`
    - `async upsert(input: PhaseUpsertInput): Promise<PhaseDefinition>`
    - `async deletePhase(id: string): Promise<boolean>`
    - `buildChecklistItem(label: string, visibility: PhaseChecklistItem["visibility"]): PhaseChecklistItem`
    - `describePresets(): readonly { stage: ClientStage; label: string; pluginPreset: readonly string[] }[]`

## Depends on (4)

- [`src/built-ins/modules/fulfillment/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/fulfillment/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/fulfillment/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/fulfillment/src/server/presets.ts`](./presets.md)

## Used by (2)

- [`src/built-ins/modules/fulfillment/src/server/clients.ts`](./clients.md)
- [`src/built-ins/modules/fulfillment/src/server/index.ts`](./index.md)

