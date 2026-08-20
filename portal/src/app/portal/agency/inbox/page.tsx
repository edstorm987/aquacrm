import { requireRole } from "@/lib/server/auth/auth";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { listWebsiteEnquiries, synchroniseWebsiteEnquiryIdentities } from "@/lib/server/websiteEnquiries";
import { triageWebsiteEnquiry, type WebsiteEnquiryPriority } from "@/lib/server/websiteEnquiries";
import { listActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { listInboxSnapshot } from "@/lib/server/inbox/inboxStore";
import { metaInboxReadiness } from "@/lib/server/integrations/metaMessaging";
import { outboundCommunicationReadiness } from "@/lib/server/email/outboundCommunications";
import { listOperationalAlertViews } from "@/lib/server/inbox/operationalAlertPreferences";
import { synchroniseInboxIdentityResolutions } from "@/lib/server/inbox/inboxService";
import { clearIdentityResolutionReviews } from "@/lib/server/identityResolution";

import { MasterInbox } from "./_MasterInbox";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import { cleanClientRequests } from "@/lib/clients/clientRequests";
import { clientWorkspaceDisplayName } from "@/lib/clients/clientWorkspace";

type RequestRecord = {
  id: string;
  type: string;
  message: string;
  status: "open" | "reviewed" | "closed";
  submittedBy: string;
  submittedAt: number;
  replies?: Array<{
    id: string;
    message: string;
    from: "customer" | "milesymedia";
    createdAt: number;
    attachments?: InboxOutboundAttachment[];
  }>;
  propertyId?: string;
  siteLabel?: string;
  siteUrl?: string;
  siteKind?: string;
  priority?: WebsiteEnquiryPriority;
  topic?: string;
  suggestedAction?: string;
};

type PropertyRecord = {
  id: string;
  label?: string;
  kind?: string;
  status?: string;
  liveUrl?: string;
  previewUrl?: string;
};

export default async function AgencyInboxPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId);
  const [liveAlerts, activity, websiteFormsResult, socialInboxResult] = await Promise.all([
    listOperationalAlerts(session.agencyId),
    Promise.resolve(listActivity({ agencyId: session.agencyId, limit: 150 })),
    (session.isDemo ? Promise.resolve([]) : listWebsiteEnquiries(session.agencyId)).then(
      submissions => ({ submissions, error: null as string | null }),
      cause => ({
        submissions: [],
        error: cause instanceof Error ? cause.message : "Website enquiries could not be loaded.",
      }),
    ),
    (session.isDemo ? Promise.resolve({ connections: [], conversations: [], generatedAt: Date.now() }) : listInboxSnapshot(session.agencyId)).then(
      snapshot => ({ snapshot, error: null as string | null }),
      cause => ({
        snapshot: { connections: [], conversations: [], generatedAt: Date.now() },
        error: cause instanceof Error ? cause.message : "Social inbox storage could not be loaded.",
      }),
    ),
  ]);
  if (session.isDemo) clearIdentityResolutionReviews(session.agencyId);
  const alerts = listOperationalAlertViews(session.agencyId, session.userId, liveAlerts).filter(alert => alert.attention);
  const websiteForms = websiteFormsResult.error
    ? websiteFormsResult.submissions
    : await synchroniseWebsiteEnquiryIdentities(session.agencyId, websiteFormsResult.submissions).catch(() => websiteFormsResult.submissions);
  const socialInbox = socialInboxResult.error
    ? socialInboxResult.snapshot
    : await synchroniseInboxIdentityResolutions(session.agencyId, socialInboxResult.snapshot).catch(() => socialInboxResult.snapshot);
  await flushPendingWrites();
  const conversations = clients.flatMap(client => {
    const clientLabel = clientWorkspaceDisplayName(client);
    const metadata = client.metadata as { clientRequests?: RequestRecord[]; properties?: PropertyRecord[] } | undefined;
    const properties = Array.isArray(metadata?.properties) ? metadata.properties : [];
    return cleanClientRequests(metadata?.clientRequests).map(request => {
      const selectedProperty = request.propertyId
        ? properties.find(property => property.id === request.propertyId)
        : properties.find(property => property.status === "live") ?? properties[0];
      const triage = triageWebsiteEnquiry(request.type === "support-ticket" ? "support" : "form", request.message);
      return {
        id: request.id,
        clientId: client.id,
        clientName: clientLabel,
        buyerName: client.name,
        type: request.type,
        message: request.message,
        status: request.status,
        submittedBy: request.submittedBy,
        submittedAt: request.submittedAt,
        replyCount: request.replies?.length ?? 0,
        replies: request.replies ?? [],
        propertyId: request.propertyId ?? selectedProperty?.id,
        siteName: request.siteLabel ?? selectedProperty?.label ?? "Client portal",
        siteUrl: request.siteUrl ?? selectedProperty?.liveUrl ?? selectedProperty?.previewUrl,
        siteKind: request.siteKind ?? selectedProperty?.kind ?? "client portal",
        priority: request.priority ?? triage.priority,
        topic: request.topic ?? triage.topic,
        suggestedAction: request.suggestedAction ?? triage.suggestedAction,
        ownerEmail: client.ownerEmail,
        ownerPhone: typeof client.metadata?.phone === "string"
          ? client.metadata.phone
          : typeof client.metadata?.contactPhone === "string"
            ? client.metadata.contactPhone
            : undefined,
      };
    });
  }).sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return b.submittedAt - a.submittedAt;
  });

  return <MasterInbox
    referenceNow={Date.now()}
    alerts={alerts}
    websiteForms={websiteForms}
    websiteFormsError={websiteFormsResult.error}
    conversations={conversations}
    socialInbox={socialInbox}
    socialInboxError={socialInboxResult.error}
    metaReadiness={metaInboxReadiness(session.agencyId)}
    currentUserId={session.userId}
    canErase={session.role === "agency-owner"}
    canManageChannels={session.role === "agency-owner" || session.role === "agency-manager"}
    channelClients={clients.map(client => ({ id: client.id, name: client.name }))}
    communicationReadiness={outboundCommunicationReadiness(session.agencyId)}
    clientProfiles={clients.map(client => ({
      id: client.id,
      name: clientWorkspaceDisplayName(client),
      buyerName: client.name,
      ownerEmail: client.ownerEmail || (typeof client.metadata?.clientEmail === "string" ? client.metadata.clientEmail : undefined),
      ownerPhone: typeof client.metadata?.phone === "string"
        ? client.metadata.phone
        : typeof client.metadata?.contactPhone === "string"
          ? client.metadata.contactPhone
          : undefined,
      stage: client.stage,
      source: typeof client.metadata?.source === "string" ? client.metadata.source : "AquaCRM client",
      createdAt: client.createdAt,
      lastContactedAt: typeof client.metadata?.lastContactedAt === "number" ? client.metadata.lastContactedAt : undefined,
    }))}
    updates={activity.map(entry => ({
      id: entry.id,
      message: entry.message,
      category: entry.category,
      action: entry.action,
      actorEmail: entry.actorEmail,
      clientId: entry.clientId,
      ts: entry.ts,
    }))}
  />;
}
