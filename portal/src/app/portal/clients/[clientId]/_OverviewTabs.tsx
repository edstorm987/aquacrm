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
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";

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

export function OverviewTabs({ clientId, active, visibleTabs }: { clientId: string; active: TabId; visibleTabs?: TabId[] }) {
  const visible = visibleTabs ? new Set(visibleTabs) : null;
  return (
    <nav aria-label="Client sections" className="mm-client-local-nav-links flex min-w-0 flex-wrap gap-1">
      {TABS.filter(tab => !visible || visible.has(tab.id)).map(tab => {
        const isActive = tab.id === active;
        const href = clientWorkspaceHref(clientId, tab.id);
        const Icon = TAB_ICONS[tab.id];
        return (
          <Link
            key={tab.id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            data-client-local-nav-link
            className={[
              "inline-flex min-h-10 items-center border px-3 py-2 text-sm transition",
              isActive
                ? "border-brand/25 bg-brand/[0.075] font-semibold text-brand"
                : "border-transparent text-black/58 hover:border-black/10 hover:bg-white hover:text-black/82",
            ].join(" ")}
          >
            <span className="inline-flex items-center gap-2"><Icon size={14} aria-hidden="true" />{tab.label}<AttentionDot href={href} /></span>
          </Link>
        );
      })}
    </nav>
  );
}
