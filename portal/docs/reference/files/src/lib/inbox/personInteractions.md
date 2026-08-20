# `src/lib/inbox/personInteractions.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Everything that has passed between the agency and a person. The contact card asks you to decide what somebody is — sales, supplier, spam — while showing you none of what they actually said. That is not a decision, it is a guess. Interactions puts the enquiry, its form fields and its consent state on the same screen as the buttons that classify it. Deliberately a lightweight ledger, not the full client record: it carries what a pre-client relationship accumulates, and seeds the real client record when they convert.

## Exports (5)

- `type InteractionKind`
- `interface InteractionField (3 members)`
- `interface PersonInteraction (8 members)`
- `INTERACTION_LABELS: Record<InteractionKind, string>`
- `sortInteractions(interactions: PersonInteraction[]): PersonInteraction[]`

## Used by (4)

- [`scripts/smoke-person-interactions.test.ts`](../../../scripts/smoke-person-interactions.test.md)
- [`src/app/portal/agency/contacts/[personId]/_ContactCard.tsx`](../../app/portal/agency/contacts/[personId]/_ContactCard.md)
- [`src/app/portal/agency/contacts/[personId]/_Interactions.tsx`](../../app/portal/agency/contacts/[personId]/_Interactions.md)
- [`src/lib/server/personInteractions.ts`](../server/personInteractions.md)

