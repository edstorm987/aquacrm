# `src/built-ins/modules/leads-pipeline/src/server/prospects.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (2)

- `REQUIRED_PROSPECT_INSPECTION_CHECKS: ProspectInspectionCheck[]`
- `class ProspectService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(): Promise<Prospect[]>`
    - `async get(id: string): Promise<Prospect | null>`
    - `async create(input: CreateProspectInput, actor: UserId): Promise<Prospect>`
    - `async update(id: string, patch: UpdateProspectPatch, actor: UserId): Promise<Prospect | null>`
    - `async dismiss(id: string, actor: UserId): Promise<Prospect | null>`
    - `async recordOutreach(id: string, input: RecordProspectOutreachInput, actor: UserId): Promise<Prospect | null>`
    - `async saveInspection(id: string, checks: ProspectInspectionCheck[], actor: UserId): Promise<Prospect | null>`
    - `async scheduleFollowUp(id: string, input: ScheduleProspectFollowUpInput, actor: UserId): Promise<Prospect | null>`
    - `async resolveFollowUp(id: string, input: ResolveProspectFollowUpInput, actor: UserId): Promise<Prospect | null>`
    - `async addNote(id: string, body: string, actor: UserId): Promise<Prospect | null>`

## Depends on (6)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/leads-pipeline/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`scripts/smoke-scouting-niche.test.ts`](../../../../../../scripts/smoke-scouting-niche.test.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)

