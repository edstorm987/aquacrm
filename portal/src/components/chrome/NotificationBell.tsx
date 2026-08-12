import "server-only";
// Server-rendered operational bell. It uses the same live alert rules as
// the master inbox so the count and the page cannot disagree.

import { NotificationCentreButton } from "@/components/chrome/NotificationCentreButton";

interface Props {
  agencyId: string;
  actor: string;
  inboxHref?: string;
}

export async function NotificationBell({ agencyId: _agencyId, actor: _actor, inboxHref: _inboxHref = "/portal/agency/inbox" }: Props) {
  return <NotificationCentreButton />;
}
