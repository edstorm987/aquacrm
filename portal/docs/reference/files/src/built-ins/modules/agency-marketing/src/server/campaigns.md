# `src/built-ins/modules/agency-marketing/src/server/campaigns.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Campaign service. CRUD + status state-machine + budget vs result rollup.  Storage: campaigns/by-id/<id>           → Campaign campaigns/by-channel/<channel> → string[] of campaign ids campaigns/index                → string[] of all campaign ids  Status transitions: draft     → scheduled | running | archived scheduled → running | paused | archived running   → paused | completed | archived paused    → running | completed | archived completed → archived archived  → (terminal)

## Exports (1)

- `class CampaignService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter?: CampaignFilter): Promise<Campaign[]>`
    - `async get(id: string): Promise<Campaign | null>`
    - `async listForChannel(channel: string): Promise<Campaign[]>`
    - `async create(input: CreateCampaignInput, actor: UserId, defaultCurrency: Currency = "usd"): Promise<Campaign>`
    - `async update(id: string, patch: UpdateCampaignPatch, actor: UserId): Promise<Campaign | null>`
    - `async delete(id: string, actor: UserId): Promise<boolean>`
    - `async setResult(id: string, resultActual: number, actor: UserId): Promise<Campaign | null>`

## Depends on (5)

- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-marketing/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-marketing/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-marketing/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/agency-marketing/src/server/reports.ts`](./reports.md)
- [`src/built-ins/modules/agency-marketing/src/server/touchpoints.ts`](./touchpoints.md)

