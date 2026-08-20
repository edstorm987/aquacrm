# `src/built-ins/modules/leads-pipeline/src/server/subscribers.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Cross-plugin event glue. The foundation registers these subscribers at boot — they fire when other plugins emit on the shared event bus.  Two subscriptions:  `public-funnel.lead.captured` Payload `{email, name?, phone?, source}` — public-funnel (T2 R021) emits this when an HC / Resources tool captures a lead. We upsert the Lead row + (when wired) drop a card on the leads pipeline's "New" column.  `pipelines.card.moved` Payload `{cardId, leadId?, fromColumn, toColumn}` — T1's foundation pipelines service emits this on every column change. We listen for `toColumn === "Won"` on a `lead`-kind card and promote the lead to a Customer Contact (idempotent on email).

## Exports (6)

- `interface FunnelLeadCapturedPayload (6 members)`
- `interface PipelineCardMovedPayload (5 members)`
- `SYSTEM_ACTOR: UserId`
- `async handleFunnelLeadCaptured(leads: LeadService, payload: FunnelLeadCapturedPayload): Promise<void>`
- `async handlePipelineCardMoved(leads: LeadService, contacts: ContactService, payload: PipelineCardMovedPayload): Promise<void>`
- `EVENT_SUBSCRIPTIONS`

## Depends on (3)

- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/leads-pipeline/src/server/contacts.ts`](./contacts.md)
- [`src/built-ins/modules/leads-pipeline/src/server/leads.ts`](./leads.md)

## Used by (2)

- [`src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts`](../__smoke__/leads-pipeline.test.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](./index.md)

