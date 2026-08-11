import { requireRole } from "@/lib/server/auth";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";
import { listWebsiteEnquiries } from "@/lib/server/websiteEnquiries";
import { triageWebsiteEnquiry, type WebsiteEnquiryPriority } from "@/lib/server/websiteEnquiries";
import { listActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { listInboxSnapshot } from "@/lib/server/inboxStore";
import { metaInboxReadiness } from "@/lib/server/metaMessaging";

import { MasterInbox } from "./_MasterInbox";

type RequestRecord = {
  id: string;
  type: string;
  message: string;
  status: "open" | "reviewed" | "closed";
  submittedBy: string;
  submittedAt: number;
  replies?: unknown[];
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
  const [alerts, activity, websiteFormsResult, socialInboxResult] = await Promise.all([
    listOperationalAlerts(session.agencyId),
    Promise.resolve(listActivity({ agencyId: session.agencyId, limit: 150 })),
    listWebsiteEnquiries().then(
      submissions => ({ submissions, error: null as string | null }),
      cause => ({
        submissions: [],
        error: cause instanceof Error ? cause.message : "Website enquiries could not be loaded.",
      }),
    ),
    listInboxSnapshot(session.agencyId).then(
      snapshot => ({ snapshot, error: null as string | null }),
      cause => ({
        snapshot: { connections: [], conversations: [], generatedAt: Date.now() },
        error: cause instanceof Error ? cause.message : "Social inbox storage could not be loaded.",
      }),
    ),
  ]);
  const conversations = clients.flatMap(client => {
    const metadata = client.metadata as { clientRequests?: RequestRecord[]; properties?: PropertyRecord[] } | undefined;
    const properties = Array.isArray(metadata?.properties) ? metadata.properties : [];
    return (metadata?.clientRequests ?? []).map(request => {
      const selectedProperty = request.propertyId
        ? properties.find(property => property.id === request.propertyId)
        : properties.find(property => property.status === "live") ?? properties[0];
      const triage = triageWebsiteEnquiry(request.type === "support-ticket" ? "support" : "form", request.message);
      return {
        id: request.id,
        clientId: client.id,
        clientName: client.name,
        type: request.type,
        message: request.message,
        status: request.status,
        submittedBy: request.submittedBy,
        submittedAt: request.submittedAt,
        replyCount: request.replies?.length ?? 0,
        propertyId: request.propertyId ?? selectedProperty?.id,
        siteName: request.siteLabel ?? selectedProperty?.label ?? "Client portal",
        siteUrl: request.siteUrl ?? selectedProperty?.liveUrl ?? selectedProperty?.previewUrl,
        siteKind: request.siteKind ?? selectedProperty?.kind ?? "client portal",
        priority: request.priority ?? triage.priority,
        topic: request.topic ?? triage.topic,
        suggestedAction: request.suggestedAction ?? triage.suggestedAction,
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
    websiteForms={websiteFormsResult.submissions}
    websiteFormsError={websiteFormsResult.error}
    conversations={conversations}
    socialInbox={socialInboxResult.snapshot}
    socialInboxError={socialInboxResult.error}
    metaReadiness={metaInboxReadiness()}
    currentUserId={session.userId}
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
