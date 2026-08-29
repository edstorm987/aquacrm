// The app's icon vocabulary — one map, used by the nav and by the saved-tab
// icon picker.
//
// Extracted from `SidebarNavLink.tsx` on 2026-08-27 when Ed asked to be able to
// choose a saved tab's icon: *"if i hold the star icon or the icon i can switch
// it to the workspace icons."* The picker had to draw from the SAME vocabulary
// the nav uses, or the app would grow a second set of icons meaning the same
// things and they would drift.
//
// Deliberately not a client module: it is a plain map of components, so the
// server-side sidebar assembly can resolve a chosen icon too.

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

export type NavIconComponent = typeof Circle;

export const NAV_ICONS: Record<string, typeof Circle> = {
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

export const CLIENT_SERVICE_ICONS: Array<[string, typeof Circle]> = [
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


/** The icon for a nav id, falling back to a neutral dot. */
export function navIcon(id: string): NavIconComponent {
  return NAV_ICONS[id] ?? CLIENT_SERVICE_ICONS.find(([prefix]) => id.startsWith(prefix))?.[1] ?? Circle;
}

/** The icon for a key a person CHOSE, or null when the key is unknown. */
export function chosenNavIcon(key: string | undefined): NavIconComponent | null {
  if (!key) return null;
  return NAV_ICONS[key] ?? null;
}

// ─── What a person may choose from ────────────────────────────────────────
//
// Ed, 2026-08-27: *"if i hold the star icon or the icon i can switch it to the
// workspace icons — every workspace should have an icon."*
//
// A saved tab's icon is DERIVED by default: a shortcut into Finance wears the
// Finance icon, resolved from the nav tree so there is nothing to drift. This
// list is the override — the areas of the app a person might want a shortcut to
// *look* like, whatever it points at. Derived by default, chosen when chosen.
//
// Drawn from `NAV_ICONS` above rather than a new set, so the picker and the
// sidebar always mean the same thing by the same picture.

export interface NavIconChoice {
  /** Key into `NAV_ICONS`. */
  key: string;
  /** What the person is picking, in their words. */
  label: string;
}

export const SAVED_TAB_ICON_CHOICES: readonly NavIconChoice[] = [
  { key: "home", label: "Command Centre" },
  { key: "inbox", label: "Inbox" },
  { key: "clients", label: "Clients" },
  { key: "fulfilment", label: "Fulfilment" },
  { key: "pipelines", label: "Pipelines" },
  { key: "products", label: "Products" },
  { key: "finance", label: "Finance" },
  { key: "marketing", label: "Marketing" },
  { key: "people", label: "People" },
  { key: "calendar", label: "Calendar" },
  { key: "actions", label: "Actions" },
  { key: "development", label: "Development" },
  { key: "portals", label: "Portals" },
  { key: "company", label: "Company" },
  { key: "sop-library", label: "SOPs" },
  { key: "performance", label: "Performance" },
  { key: "notepad", label: "Notes" },
  { key: "tools", label: "Tools" },
  { key: "settings", label: "Settings" },
  { key: "leads", label: "Leads" },
];
