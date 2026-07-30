import "server-only";
// Server-rendered operational bell. It uses the same live alert rules as
// the master inbox so the count and the page cannot disagree.

import Link from "next/link";
import { Bell } from "lucide-react";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";

interface Props {
  agencyId: string;
  actor: string;
  inboxHref?: string;
}

export async function NotificationBell({ agencyId, actor: _actor, inboxHref = "/portal/agency/inbox" }: Props) {
  const unread = (await listOperationalAlerts(agencyId)).length;
  const display = unread > 99 ? "99+" : String(unread);

  return (
    <Link
      href={inboxHref}
      aria-label={`Notifications — ${unread} items need attention`}
      title="Notifications"
      className="relative grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/60 shadow-sm hover:border-black/20 hover:bg-black/[0.025]"
    >
      <Bell size={16} aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white">
          {display}
        </span>
      )}
    </Link>
  );
}
