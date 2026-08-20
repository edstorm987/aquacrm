# `src/lib/server/websiteEnquiryLeadSync.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (1)

- `async recordWebsiteEnquiryLeadContact(input: { agencyId: string; leadId?: string; actorUserId: string; channel: string; outcome: string; note?: string; at?: number; incrementSentCount?: boolean; }): Promise<boolean>`

## Depends on (3)

- [`src/built-ins/runtime/foundation-adapters/leadsPipelineFoundation.ts`](../../built-ins/runtime/foundation-adapters/leadsPipelineFoundation.md)
- [`src/lib/server/pluginStorage.ts`](./pluginStorage.md)
- [`src/server/pluginInstalls.ts`](../../server/pluginInstalls.md)

## Used by (2)

- [`src/app/api/portal/website-enquiries/calls/route.ts`](../../app/api/portal/website-enquiries/calls/route.md)
- [`src/app/api/portal/website-enquiries/communications/route.ts`](../../app/api/portal/website-enquiries/communications/route.md)

