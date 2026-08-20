# `src/built-ins/modules/leads-pipeline/src/server/campaigns.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** CampaignService — single-shot email-blast dispatcher.  Lifecycle: `draft` → optional `scheduled` → `sending` → `sent`. `send()` is the canonical entry point; it walks the resolved audience, enqueues one EmailSender message per recipient (via the `EmailEnqueuePort` adapter), records `sentCount` per Lead, stamps `Campaign.sentAt`, and emits `leads.campaign.sent`.  Rate-limiting: the email-sender plugin owns the queue (T2 R024). We just pile messages onto it; the SMTP driver drains at whatever pace the agency's identity allows. No back-pressure logic here.  Idempotency: each enqueue uses externalRef `campaign:<id>:<email>` so re-running send() on a half-failed campaign collapses dupes.

## Exports (2)

- `PLUGIN_ID`
- `class CampaignService`
    - `constructor(private agencyId: AgencyId, private storage: PluginStorage, private activity: ActivityLogPort, private events: EventBusPort, private leads: LeadService, private emailEnqueue?: EmailEnqueuePort)`
    - `async list(): Promise<Campaign[]>`
    - `async get(id: string): Promise<Campaign | null>`
    - `async create(input: CreateCampaignInput, actor: UserId): Promise<Campaign>`
    - `async update(id: string, patch: UpdateCampaignPatch, actor: UserId): Promise<Campaign | null>`
    - `async send(id: string, actor: UserId): Promise<Campaign>`

## Depends on (7)

- [`src/built-ins/modules/leads-pipeline/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/leads-pipeline/src/server/leads.ts`](./leads.md)
- [`src/built-ins/modules/leads-pipeline/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)

