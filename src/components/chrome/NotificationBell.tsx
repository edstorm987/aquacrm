import "server-only";
// Server-rendered bell badge for the agency-shell sidebar. Reads
// foundation activity + the activity-inbox plugin's per-actor read
// state to compute an unread count. Renders nothing if the
// activity-inbox plugin is not installed for this agency — making it
// safe to wire unconditionally from the layout.

import Link from "next/link";
import { getInstall } from "@/server/pluginInstalls";
import { listActivity } from "@/server/activity";
import { makePluginStorage } from "@/lib/server/pluginStorage";

interface Props {
  agencyId: string;
  actor: string;
  inboxHref?: string;
}

const READ_PREFIX = "inbox/read/";
const SCAN_LIMIT = 500;

export async function NotificationBell({ agencyId, actor, inboxHref = "/portal/agency/activity-inbox?unread=1" }: Props) {
  const install = getInstall({ agencyId }, "activity-inbox");
  if (!install || !install.enabled) return null;

  const storage = makePluginStorage(install.id);
  const state = (await storage.get<{ lastReadTs?: number }>(`${READ_PREFIX}${actor}`)) ?? { lastReadTs: 0 };
  const lastReadTs = state.lastReadTs ?? 0;

  const recent = listActivity({ agencyId, limit: SCAN_LIMIT });
  const unread = recent.filter(e => e.ts > lastReadTs).length;
  const display = unread > 99 ? "99+" : String(unread);

  return (
    <div className="mt-4 border-t border-black/10 pt-3">
      <Link
        href={inboxHref}
        aria-label={`Inbox — ${unread} unread events`}
        className="flex items-center justify-between rounded-md px-2 py-1.5 text-black/80 hover:bg-black/5"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">🔔</span>
          <span>Inbox</span>
        </span>
        {unread > 0 && (
          <span className="rounded-full bg-[var(--brand-primary,#4a6cf7)] px-1.5 py-0.5 text-[10px] font-medium text-white">
            {display}
          </span>
        )}
      </Link>
    </div>
  );
}
