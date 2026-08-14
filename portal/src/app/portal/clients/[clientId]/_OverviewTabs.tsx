"use client";

// Tab nav for the per-client overview. Tabs persist via `?tab=` so a
// link to `/portal/clients/<id>?tab=systems` lands on the systems lens.
// Server-rendered content lives in `page.tsx`; this is just the bar.

import Link from "next/link";
import {
  Files,
  FolderKanban,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  MonitorCog,
  PanelTop,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { TABS, type TabId } from "./_tabs";
import { AttentionDot } from "@/components/chrome/NotificationAttentionProvider";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";

export type { TabId };

const TAB_ICONS: Record<TabId, LucideIcon> = {
  overview: LayoutDashboard,
  relationship: HeartHandshake,
  delivery: FolderKanban,
  marketing: Megaphone,
  systems: MonitorCog,
  finance: Landmark,
  communications: MessagesSquare,
  files: Files,
  portal: PanelTop,
  notes: StickyNote,
};

export function OverviewTabs({ clientId, active }: { clientId: string; active: TabId }) {
  return (
    <nav aria-label="Client sections" className="flex flex-wrap gap-1 border-b border-black/10">
      {TABS.map(tab => {
        const isActive = tab.id === active;
        const href = clientWorkspaceHref(clientId, tab.id);
        const Icon = TAB_ICONS[tab.id];
        return (
          <Link
            key={tab.id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm",
              isActive
                ? "border-brand font-medium text-brand"
                : "border-transparent text-black/65 hover:text-black/85",
            ].join(" ")}
          >
            <span className="inline-flex items-center gap-2"><Icon size={14} aria-hidden="true" />{tab.label}<AttentionDot href={href} /></span>
          </Link>
        );
      })}
    </nav>
  );
}
