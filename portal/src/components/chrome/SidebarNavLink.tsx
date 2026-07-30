"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Boxes,
  Building2,
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
  Package,
  PanelTop,
  ReceiptText,
  Settings,
  Ship,
  ShoppingBag,
  Sparkles,
  Target,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";

const NAV_ICONS: Record<string, typeof Circle> = {
  home: LayoutDashboard,
  dashboard: LayoutDashboard,
  company: Building2,
  actions: ClipboardCheck,
  inbox: Inbox,
  performance: Gauge,
  clients: ContactRound,
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
  fulfilment: FolderKanban,
  leads: Target,
};

export function SidebarNavLink({
  id,
  href,
  label,
  icon,
  badge,
}: {
  id: string;
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}) {
  const pathname = usePathname();
  const active = id === "home"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = NAV_ICONS[id] ?? Circle;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      data-sidebar-nav-link
      className={[
        "mm-sidebar-link flex min-h-10 items-center gap-2 rounded-md px-2 py-2",
        active ? "bg-brand/10 text-brand font-medium" : "text-black/80 hover:bg-black/5",
      ].join(" ")}
    >
      <span
        aria-hidden
        className="mm-sidebar-link-icon inline-flex h-5 w-5 shrink-0 items-center justify-center text-black/55"
      >
        {icon ?? <Icon size={16} strokeWidth={1.8} />}
      </span>
      <span className="mm-sidebar-link-label flex-1 truncate">{label}</span>
      {badge !== undefined ? (
        <span aria-label={`${badge}`} className="mm-sidebar-link-badge rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] text-black/70">
          {String(badge)}
        </span>
      ) : null}
    </Link>
  );
}
