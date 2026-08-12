"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  Circle,
  ClipboardCheck,
  Code2,
  ContactRound,
  FileText,
  FolderKanban,
  Gauge,
  Gift,
  HandCoins,
  House,
  Images,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MonitorCog,
  NotebookPen,
  Package,
  PanelTop,
  PanelsTopLeft,
  Radar,
  ReceiptText,
  Settings,
  Ship,
  ShoppingBag,
  Sparkles,
  Target,
  Users,
  WalletCards,
  Wrench,
  Workflow,
} from "lucide-react";
import { attentionTitle, useAttentionMatches, useNotificationAttention } from "@/components/chrome/NotificationAttentionProvider";

const NAV_ICONS: Record<string, typeof Circle> = {
  home: Radar,
  dashboard: LayoutDashboard,
  company: Building2,
  actions: ClipboardCheck,
  calendar: CalendarDays,
  notepad: NotebookPen,
  automations: Workflow,
  inbox: Inbox,
  performance: Gauge,
  clients: ContactRound,
  portals: PanelsTopLeft,
  fulfilment: FolderKanban,
  "you-deserve-it": Gift,
  pipelines: Ship,
  products: Package,
  development: Code2,
  marketing: Megaphone,
  finance: WalletCards,
  "agency-finance": WalletCards,
  "sop-library": BookOpen,
  settings: Settings,
  "agency-settings": Settings,
  "agency-phases": Boxes,
  "back-to-agency": House,
  "client-overview": LayoutDashboard,
  "client-fulfilment": FolderKanban,
  "client-kanban": ClipboardCheck,
  "client-website": PanelTop,
  "client-properties": MonitorCog,
  "client-finance": ReceiptText,
  "client-assets": Images,
  "client-files": FileText,
  "client-sops": BookOpen,
  "client-systems": Wrench,
  "client-settings": Settings,
  customer: Users,
  orders: ShoppingBag,
  bookings: Bell,
  membership: Sparkles,
  affiliate: HandCoins,
  account: Building2,
  leads: Target,
};

const NAV_TONES: Record<string, string> = {
  home: "teal",
  dashboard: "teal",
  company: "indigo",
  actions: "amber",
  calendar: "teal",
  notepad: "amber",
  automations: "cyan",
  inbox: "sky",
  clients: "violet",
  portals: "cyan",
  fulfilment: "teal",
  "you-deserve-it": "rose",
  pipelines: "orange",
  products: "lime",
  development: "blue",
  performance: "blue",
  marketing: "pink",
  finance: "emerald",
  "agency-finance": "emerald",
  "sop-library": "slate",
  settings: "slate",
  "agency-settings": "slate",
};

export function SidebarNavLink({
  id,
  href,
  label,
  icon,
  badge,
  attentionCount = 0,
}: {
  id: string;
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  attentionCount?: number;
}) {
  const pathname = usePathname();
  const active = id === "home"
    ? pathname === href
    : id === "fulfilment"
      ? pathname === href
        || pathname.startsWith(`${href}/`)
        || pathname.startsWith("/portal/agency/portals")
        || pathname.startsWith("/portal/agency/pipelines/fulfilment")
      : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = NAV_ICONS[id] ?? Circle;
  const attentionContext = useNotificationAttention();
  const liveAttention = useAttentionMatches({ navId: id, hrefs: [href] });
  const resolvedAttentionCount = attentionContext ? liveAttention.length : attentionCount;
  const hoverTitle = liveAttention.length ? `${label}\n${attentionTitle(liveAttention)}` : label;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={resolvedAttentionCount > 0 ? `${label}, ${resolvedAttentionCount} notification${resolvedAttentionCount === 1 ? "" : "s"} need attention` : undefined}
      title={hoverTitle}
      data-sidebar-nav-link
      data-nav-tone={NAV_TONES[id] ?? "slate"}
      className={[
        "mm-sidebar-link flex min-h-10 items-center gap-2 rounded-md px-2 py-2",
        active ? "is-active font-medium" : "text-black/80",
      ].join(" ")}
    >
      <span
        aria-hidden
        className="mm-sidebar-link-icon relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
      >
        {icon ?? <Icon size={16} strokeWidth={1.8} />}
        {resolvedAttentionCount > 0 ? (
          <span
            aria-hidden
            className="mm-sidebar-attention-dot absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-600 ring-2 ring-white"
          />
        ) : null}
      </span>
      <span className="mm-sidebar-link-label flex-1 truncate">{label}</span>
      {resolvedAttentionCount > 0 ? (
        <span
          aria-hidden
          className="mm-attention-badge mm-sidebar-link-badge grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white"
        >
          {resolvedAttentionCount > 99 ? "99+" : resolvedAttentionCount}
        </span>
      ) : badge !== undefined ? (
        <span aria-label={`${badge}`} className="mm-sidebar-link-badge rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] text-black/70">
          {String(badge)}
        </span>
      ) : null}
    </Link>
  );
}
