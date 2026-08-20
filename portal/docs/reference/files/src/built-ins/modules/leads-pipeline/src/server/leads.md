# `src/built-ins/modules/leads-pipeline/src/server/leads.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** LeadService — Lead CRUD + CSV import + audience filter resolution.  Storage layout mirrors the agency-hr StaffService pattern: - `lead:<id>`        — Lead row - `leads/index`      — id list for cheap listing - `leads/email/<canonical>` — id pointer for O(1) idempotent lookup by canonical email (powers idempotent CSV re-import)

## Exports (2)

- `normalizeLeadJourney(lead: Lead): Lead`
- `class LeadService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort, private pipeline?: PipelinePort)`
    - `async list(filter?: LeadFilter): Promise<Lead[]>`
    - `async get(id: string): Promise<Lead | null>`
    - `async getByEmail(email: string): Promise<Lead | null>`
    - `async getByPhone(phone: string): Promise<Lead | null>`
    - `async upsert(input: CreateLeadInput, actor: UserId): Promise<{ lead: Lead; created: boolean }>`
    - `async update(id: string, patch: UpdateLeadPatch, actor: UserId): Promise<Lead | null>`
    - `async recordEnquiryCapture(id: string, input: { at: number; source: string; enquiryId?: string }, actor: UserId): Promise<Lead | null>`
    - `async recordContact(id: string, input: { at?: number; channel?: string; outcome?: string; note?: string; incrementSentCount?: boolean }, actor: UserId): Promise<Lead | null>`
    - `async recordStageChange(id: string, input: { fromStage?: string; toStage: string; at?: number }, actor: UserId): Promise<Lead | null>`
    - `async recordMeeting(id: string, meetingAt: number, actor: UserId): Promise<Lead | null>`
    - `async recordConversion(id: string, clientId: string, actor: UserId, at = now()): Promise<Lead | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async anonymiseForErasure(id: string, actor: UserId): Promise<Lead | null>`
    - `async importCsv(args: { text: string; filename?: string; actor: UserId; defaultSource?: string; defaultTags?: string[]; defaultRelationshipCategory?: LeadRelationshipCategory; mapping?: Record<string, string>; customFieldTypes?: Record<str…`
    - `async resolveAudience(filter: AudienceFilter): Promise<Lead[]>`
    - `async stampLastEmailedAt(leadId: string, ts: number, actor: UserId): Promise<Lead | null>`

## Depends on (8)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/safeDate.ts`](../lib/safeDate.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/leads-pipeline/src/server/csv.ts`](./csv.md)
- [`src/built-ins/modules/leads-pipeline/src/server/ports.ts`](./ports.md)

## Used by (5)

- [`scripts/smoke-lead-wait-tracing.test.ts`](../../../../../../scripts/smoke-lead-wait-tracing.test.md)
- [`src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts`](../__smoke__/leads-pipeline.test.md)
- [`src/built-ins/modules/leads-pipeline/src/server/campaigns.ts`](./campaigns.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/leads-pipeline/src/server/subscribers.ts`](./subscribers.md)

