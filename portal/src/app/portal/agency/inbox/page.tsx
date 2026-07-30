import { requireRole } from "@/lib/server/auth";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";
import { listActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { listClients } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

import { MasterInbox } from "./_MasterInbox";

type RequestRecord = {
  id: string;
  type: string;
  message: string;
  status: "open" | "reviewed" | "closed";
  submittedBy: string;
  submittedAt: number;
  replies?: unknown[];
};

export default async function AgencyInboxPage() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const clients = listClients(session.agencyId);
  const [alerts, activity] = await Promise.all([
    listOperationalAlerts(session.agencyId),
    Promise.resolve(listActivity({ agencyId: session.agencyId, limit: 150 })),
  ]);
  const conversations = clients.flatMap(client => {
    const metadata = client.metadata as { clientRequests?: RequestRecord[] } | undefined;
    return (metadata?.clientRequests ?? []).map(request => ({
      id: request.id,
      clientId: client.id,
      clientName: client.name,
      type: request.type,
      message: request.message,
      status: request.status,
      submittedBy: request.submittedBy,
      submittedAt: request.submittedAt,
      replyCount: request.replies?.length ?? 0,
    }));
  }).sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return b.submittedAt - a.submittedAt;
  });

  return <MasterInbox
    alerts={alerts}
    conversations={conversations}
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
