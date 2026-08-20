# `src/lib/server/email/outboundCommunications.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (9)

- `type OutboundCommunicationChannel`
- `interface CommunicationSenderIdentity (6 members)`
- `interface OutboundCommunicationReadiness (4 members)`
- `interface SendPhoneMessageResult (4 members)`
- `outboundCommunicationReadiness(agencyId: string): OutboundCommunicationReadiness`
- `resolveCommunicationSender(agencyId: string, senderId: string, channel: OutboundCommunicationChannel): CommunicationSenderIdentity | null`
- `async sendPhoneMessage(input: { agencyId: string; sender: CommunicationSenderIdentity; channel: "sms" | "whatsapp"; to: string; body: string; mediaUrls?: string[]; }): Promise<SendPhoneMessageResult>`
- `async initiatePhoneCall(input: { agencyId: string; sender: CommunicationSenderIdentity; customerPhone: string; }): Promise<{ initiated: boolean; via: "device" | "twilio"; externalCallId?: string; reason?: string }>`
- `normalisePhone(value: string): string | null`

## Depends on (2)

- [`src/lib/integrations/catalog.ts`](../../integrations/catalog.md)
- [`src/lib/server/integrations/integrationConnections.ts`](../integrations/integrationConnections.md)

## Used by (7)

- [`src/app/api/portal/website-enquiries/calls/route.ts`](../../../app/api/portal/website-enquiries/calls/route.md)
- [`src/app/api/portal/website-enquiries/communications/route.ts`](../../../app/api/portal/website-enquiries/communications/route.md)
- [`src/app/portal/agency/inbox/_EnquiryCommunications.tsx`](../../../app/portal/agency/inbox/_EnquiryCommunications.md)
- [`src/app/portal/agency/inbox/_EnquiryDetailCard.tsx`](../../../app/portal/agency/inbox/_EnquiryDetailCard.md)
- [`src/app/portal/agency/inbox/_MasterInbox.tsx`](../../../app/portal/agency/inbox/_MasterInbox.md)
- [`src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx`](../../../app/portal/agency/inbox/_UnifiedInboxWorkspace.md)
- [`src/app/portal/agency/inbox/page.tsx`](../../../app/portal/agency/inbox/page.md)

