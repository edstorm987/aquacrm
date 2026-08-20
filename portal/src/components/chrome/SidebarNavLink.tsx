"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  Camera,
  Circle,
  ClipboardCheck,
  Code2,
  ContactRound,
  FileText,
  FolderKanban,
  Gauge,
  Gift,
  Globe2,
  HandCoins,
  HeartPulse,
  House,
  Images,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MonitorCog,
  NotebookPen,
  Package,
  PackagePlus,
  Palette,
  PanelTop,
  PanelsTopLeft,
  MapPin,
  Radar,
  ReceiptText,
  Settings,
  Ship,
  ShoppingBag,
  Sparkles,
  Target,
  Users,
  UsersRound,
  UserRoundCheck,
  WalletCards,
  Wrench,
  Workflow,
} from "lucide-react";
import { attentionTitle, useAttentionMatches, useNotificationAttention, useUnresolvedAttentionMatches } from "@/components/chrome/NotificationAttentionProvider";
import type { OperationalAlertCategory } from "@/lib/intelligence/operationalAttention";

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
  tools: Wrench,
  settings: Settings,
  "agency-settings": Settings,
  "agency-phases": Boxes,
  "back-to-agency": House,
  "client-overview": LayoutDashboard,
  "client-relationship": UsersRound,
  "client-delivery": FolderKanban,
  "client-marketing": Megaphone,
  "client-communications": Inbox,
  "client-finance": ReceiptText,
  "client-files": FileText,
  "client-portal": PanelTop,
  "client-notes": NotebookPen,
  "client-systems": MonitorCog,
  "client-settings": Settings,
  "client-assign-services": PackagePlus,
  customer: Users,
  people: UsersRound,
  "my-day": Gauge,
  onboarding: UserRoundCheck,
  leave: CalendarDays,
  training: BookOpen,
  pay: WalletCards,
  notes: NotebookPen,
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
  "client-marketing": "pink",
  "client-overview": "sky",
  "client-relationship": "violet",
  "client-delivery": "teal",
  "client-communications": "sky",
  "client-finance": "emerald",
  "client-files": "amber",
  "client-portal": "cyan",
  "client-notes": "amber",
  "client-systems": "blue",
  "client-settings": "slate",
  "client-assign-services": "amber",
  finance: "emerald",
  "agency-finance": "emerald",
  "sop-library": "slate",
  tools: "cyan",
  people: "violet",
  "my-day": "teal",
  onboarding: "sky",
  leave: "rose",
  training: "blue",
  pay: "emerald",
  notes: "amber",
  settings: "slate",
  "agency-settings": "slate",
};

const CLIENT_SERVICE_ICONS: Array<[string, typeof Circle]> = [
  ["client-service-brand-identity-", Palette],
  ["client-service-google-profile-", MapPin],
  ["client-service-custom-software-", Code2],
  ["client-service-ongoing-care-", HeartPulse],
  ["client-service-business-os-", Building2],
  ["client-service-health-check-", Gauge],
  ["client-service-social-ads-", Megaphone],
  ["client-service-photography-", Camera],
  ["client-service-automation-", Workflow],
  ["client-service-website-", Globe2],
  ["client-service-content-", FileText],
  ["client-service-custom-", Package],
];

const CLIENT_SERVICE_TONES: Array<[string, string]> = [
  ["client-service-brand-identity-", "violet"],
  ["client-service-google-profile-", "emerald"],
  ["client-service-custom-software-", "indigo"],
  ["client-service-ongoing-care-", "teal"],
  ["client-service-business-os-", "violet"],
  ["client-service-health-check-", "lime"],
  ["client-service-social-ads-", "pink"],
  ["client-service-photography-", "amber"],
  ["client-service-automation-", "cyan"],
  ["client-service-website-", "blue"],
  ["client-service-content-", "sky"],
  ["client-service-custom-", "slate"],
];

// The single "Operations" row (operations-home) stands in for its collapsed
// functions. It lights up when you are inside any of their agency routes, and
// (via OPERATIONS_ATTENTION_DESTINATIONS) rolls up their attention badges — the
// function rows themselves live on the hidden, search-only Operations panel and
// never render, so without this the operator would lose both signals.
const OPERATIONS_ACTIVE_PREFIXES = [
  "/portal/agency/fulfilment",
  "/portal/agency/agency-finance",
  "/portal/agency/marketing",
  "/portal/agency/people",
  "/portal/agency/freelancers",
  "/portal/agency/sop-library",
  "/portal/agency/governance",
  "/portal/agency/you-deserve-it",
  // Fulfilment's widened surfaces (the old Fulfilment row matched these too).
  "/portal/agency/development",
  "/portal/agency/performance",
  "/portal/agency/portals",
];
const OPERATIONS_ATTENTION_DESTINATIONS = ["pipelines", "fulfilment", "marketing", "finance", "people"];

function navIcon(id: string): typeof Circle {
  return NAV_ICONS[id] ?? CLIENT_SERVICE_ICONS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? Circle;
}

function navTone(id: string): string {
  return NAV_TONES[id] ?? CLIENT_SERVICE_TONES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? "slate";
}

interface ClientAttentionSpec {
  clientId: string;
  hrefs: string[];
  categories: OperationalAlertCategory[];
  allForClient: boolean;
}

function clientAttentionSpec(id: string, href: string): ClientAttentionSpec | null {
  if (!id.startsWith("client-")) return null;
  const target = new URL(href, "https://aqua.local");
  const match = target.pathname.match(/^\/portal\/clients\/([^/]+)/);
  if (!match?.[1]) return null;
  let clientId = match[1];
  try {
    clientId = decodeURIComponent(clientId);
  } catch {
    // Keep the encoded route segment when a malformed legacy id is encountered.
  }
  const base = target.pathname;
  const tabHref = (tab: string) => `${base}?tab=${tab}`;
  if (id === "client-overview") return { clientId, hrefs: [], categories: [], allForClient: true };
  if (id === "client-relationship") return {
    clientId,
    hrefs: [tabHref("relationship"), tabHref("communications")],
    categories: ["support", "meeting"],
    allForClient: false,
  };
  if (id === "client-delivery") return {
    clientId,
    hrefs: [tabHref("delivery"), tabHref("marketing"), tabHref("systems"), tabHref("files")],
    categories: ["outage", "development", "marketing"],
    allForClient: false,
  };
  if (id === "client-finance") return {
    clientId,
    hrefs: [tabHref("finance")],
    categories: ["money", "contract", "compliance"],
    allForClient: false,
  };
  if (id === "client-portal") return { clientId, hrefs: [tabHref("portal")], categories: [], allForClient: false };
  if (id === "client-notes") return { clientId, hrefs: [tabHref("notes")], categories: [], allForClient: false };
  return null;
}

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
  const searchParams = useSearchParams();
  const target = href.startsWith("/") ? new URL(href, "https://aqua.local") : null;
  const targetHasQuery = Boolean(target?.search);
  const queryMatches = targetHasQuery && target
    ? [...target.searchParams.entries()].every(([key, value]) => searchParams.get(key) === value)
    : false;
  const clientOverviewAtRoot = id === "client-overview" && pathname === target?.pathname && !searchParams.has("tab");
  const directActive = targetHasQuery
    ? pathname === target?.pathname && queryMatches
    : id === "client-overview"
      ? clientOverviewAtRoot
      : id === "home"
        ? pathname === href
    : id === "operations-home"
      ? pathname === href
        || pathname.startsWith(`${href}/`)
        || pathname === "/portal/clients"
        || OPERATIONS_ACTIVE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    : id === "fulfilment"
      ? pathname === href
        || pathname.startsWith(`${href}/`)
        || pathname.startsWith("/portal/agency/development")
        || pathname.startsWith("/portal/agency/performance")
        || pathname.startsWith("/portal/agency/portals")
        || pathname.startsWith("/portal/agency/pipelines/fulfilment")
      : pathname === href || pathname.startsWith(`${href}/`);
  const currentClientTab = pathname === target?.pathname ? searchParams.get("tab") ?? "overview" : null;
  const groupedClientActive = id === "client-relationship"
    ? currentClientTab === "relationship" || currentClientTab === "communications"
    : id === "client-delivery"
      ? currentClientTab === "delivery" || currentClientTab === "marketing" || currentClientTab === "systems" || currentClientTab === "files"
      : false;
  const active = directActive || groupedClientActive;
  const Icon = navIcon(id);
  const attentionContext = useNotificationAttention();
  const clientAttention = clientAttentionSpec(id, href);
  const attentionHrefs = clientAttention?.hrefs ?? [href];
  // The collapsed "Operations" row rolls up its functions' badges.
  const rollupDestinations = id === "operations-home" ? OPERATIONS_ATTENTION_DESTINATIONS : undefined;
  const liveAttention = useAttentionMatches({
    navId: id,
    hrefs: attentionHrefs,
    clientId: clientAttention?.clientId,
    clientCategories: clientAttention?.categories,
    allForClient: clientAttention?.allForClient,
    destinations: rollupDestinations,
  });
  const reserveAttention = useAttentionMatches({
    navId: id,
    hrefs: attentionHrefs,
    clientId: clientAttention?.clientId,
    clientCategories: clientAttention?.categories,
    allForClient: clientAttention?.allForClient,
    destinations: rollupDestinations,
    pool: "reserve",
  });
  const unresolvedAttention = useUnresolvedAttentionMatches({
    navId: id,
    clientId: clientAttention?.clientId,
  });
  const visibleAttention = [...new Map([...liveAttention, ...unresolvedAttention].map(alert => [alert.id, alert])).values()];
  const resolvedAttentionCount = attentionContext ? visibleAttention.length : attentionCount;
  const reserveNote = reserveAttention.length ? `\nAttention shield: ${reserveAttention.length} related ${reserveAttention.length === 1 ? "item is" : "items are"} safely held in reserve.` : "";
  const hoverTitle = visibleAttention.length ? `${label}\n${attentionTitle(visibleAttention)}${reserveNote}` : label;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={resolvedAttentionCount > 0 ? `${label}, ${resolvedAttentionCount} notification${resolvedAttentionCount === 1 ? "" : "s"} in focus${reserveAttention.length ? ` and ${reserveAttention.length} held in reserve` : ""}` : undefined}
      title={hoverTitle}
      data-sidebar-nav-link
      data-nav-tone={navTone(id)}
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
