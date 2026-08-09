import "server-only";
// Server-rendered operational bell. It uses the same live alert rules as
// the master inbox so the count and the page cannot disagree.

import { listOperationalAlerts } from "@/lib/server/operationalAlerts";
import { NotificationCentreButton } from "@/components/chrome/NotificationCentreButton";

interface Props {
  agencyId: string;
  actor: string;
  inboxHref?: string;
}

export async function NotificationBell({ agencyId, actor: _actor, inboxHref = "/portal/agency/inbox" }: Props) {
  const unread = (await listOperationalAlerts(agencyId)).length;
  return <NotificationCentreButton operationalCount={unread} inboxHref={inboxHref} />;
}
