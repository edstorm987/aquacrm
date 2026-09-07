// The focused landing a department hat lands on.
//
// Ed, on "Working as": *"if i choose to work as executive i get a full executive
// mode across the app… same for sales it shows the sales stuff… right now it
// shows the same for any working as which is weird."*
//
// Phase 1 narrowed the SIDEBAR under a hat. This decides the LANDING. Each
// department gets a small, focused home instead of the full macro Command
// Centre: the two or three numbers that matter to that seat, the few places its
// work lives, and — for Sales — the booked meetings. Simple enough that, in Ed's
// words, a four-year-old would not get lost. Executive's home opens simply and
// links straight to the full Executive Command Deck (preserved at
// `?station=executive`); with the focus-home flag off it falls back to landing
// on that deck directly (`focusLandingStation`).
//
// ── This is presentation, never permission ────────────────────────────────
//
// A focus home only ever LINKS to surfaces the actor could already reach; every
// destination is gated at its own route, exactly as before. Landing somewhere
// grants nothing. And it is a landing, not a redirect: it renders at
// /portal/agency only when no ?station= is in the URL, so in-app navigation and
// taking the hat off both move off it freely. Nobody is trapped in a hat.

import { departmentProfile, type DepartmentId } from "@/lib/access/departmentProfiles";

/** A number worth putting on the department's home, by the key the page fills. */
export type FocusStatKey =
  | "leads"
  | "meetings"
  | "delivery"
  | "activeClients"
  | "products"
  | "openActions";

export interface FocusStat {
  key: FocusStatKey;
  label: string;
  /** Where clicking the number goes, when it leads somewhere useful. */
  href?: string;
}

export interface FocusDestination {
  label: string;
  description: string;
  href: string;
  /** A lucide icon name; the component maps it to the real icon. */
  icon: string;
}

export interface FocusHomeConfig {
  /** The department id, echoed so a consumer of the config alone still has it. */
  id: DepartmentId;
  heading: string;
  purpose: string;
  /** The handful of numbers this seat opens its day on. */
  stats: FocusStat[];
  /** The few places this seat's work actually lives. */
  destinations: FocusDestination[];
  /** Sales only: also show the booked-meetings feed and a scouting nudge. */
  showMeetingsFeed?: boolean;
}

function purposeOf(id: DepartmentId): string {
  return departmentProfile(id)?.purpose ?? "";
}

// Every department — Executive included — has a home here, so no hat ever lands
// on the generic macro dashboard. Executive's home is a SIMPLIFIED cold-open (Ed:
// "make it better and simplified… a 4 year old would get lost"): the numbers that
// matter plus a card straight to the full Executive Command Deck, which is
// preserved untouched at `?station=executive`. With the flag off, Executive falls
// back to landing directly on that deck (`focusLandingStation`).
export const FOCUS_HOME_CONFIG: Readonly<Partial<Record<DepartmentId, FocusHomeConfig>>> = {
  executive: {
    id: "executive",
    heading: "Executive",
    purpose: purposeOf("executive"),
    stats: [
      { key: "activeClients", label: "Active clients" },
      { key: "products", label: "Sellable offers", href: "/portal/agency/fulfilment?view=services" },
      { key: "openActions", label: "Open actions", href: "/portal/agency/actions" },
    ],
    destinations: [
      { label: "Executive command deck", description: "The full business-health instrument panel — radar, brand portfolio, the numbers behind the numbers.", href: "/portal/agency?station=executive", icon: "Gauge" },
      { label: "Key numbers", description: "Revenue, pipeline and the KPIs that steer the decisions only you make.", href: "/portal/agency?station=intelligence", icon: "BarChart3" },
      { label: "Plan & targets", description: "Set the targets and see the plan to hit them.", href: "/portal/agency?station=battle", icon: "Target" },
      { label: "Clients", description: "Every client, and who needs attention.", href: "/portal/clients", icon: "Users" },
    ],
  },
  sales: {
    id: "sales",
    heading: "Sales",
    purpose: purposeOf("sales"),
    stats: [
      { key: "leads", label: "Open leads", href: "/portal/agency/pipelines/leads" },
      { key: "meetings", label: "Booked meetings", href: "/portal/agency/meetings" },
      { key: "activeClients", label: "Active clients" },
    ],
    destinations: [
      { label: "Scouting", description: "Find and qualify new prospects, one call list at a time.", href: "/portal/agency/pipelines/leads#scouting", icon: "Binoculars" },
      { label: "Meetings", description: "Every booked call, soonest first — confirm, join, follow up.", href: "/portal/agency/meetings", icon: "CalendarClock" },
      { label: "Sales board", description: "Move real opportunities toward a yes or a no.", href: "/portal/agency/pipelines/leads", icon: "Target" },
      { label: "Contacts", description: "The people behind the pipeline.", href: "/portal/agency/leads-pipeline/contacts", icon: "Users" },
    ],
    showMeetingsFeed: true,
  },
  delivery: {
    id: "delivery",
    heading: "Delivery",
    purpose: purposeOf("delivery"),
    stats: [
      { key: "delivery", label: "Live delivery items", href: "/portal/agency/fulfilment" },
      { key: "activeClients", label: "Active clients" },
      { key: "openActions", label: "Open actions", href: "/portal/agency/actions" },
    ],
    destinations: [
      { label: "Fulfilment", description: "Run the client work — onboarding, builds, milestones, handover.", href: "/portal/agency/fulfilment", icon: "PackageCheck" },
      { label: "Project pipeline", description: "Every project by the stage it is actually in.", href: "/portal/agency/pipelines/fulfilment", icon: "KanbanSquare" },
      { label: "Actions", description: "The delivery work waiting on you today.", href: "/portal/agency/actions", icon: "ListChecks" },
    ],
  },
  finance: {
    id: "finance",
    heading: "Finance",
    purpose: purposeOf("finance"),
    stats: [
      { key: "activeClients", label: "Active clients" },
      { key: "products", label: "Sellable offers", href: "/portal/agency/fulfilment?view=services" },
      { key: "openActions", label: "Open actions", href: "/portal/agency/actions" },
    ],
    destinations: [
      { label: "Finance", description: "Invoices out, expenses in, and the numbers that say whether this works.", href: "/portal/agency/agency-finance", icon: "Banknote" },
      { label: "Actions", description: "The money work waiting on you today.", href: "/portal/agency/actions", icon: "ListChecks" },
    ],
  },
  marketing: {
    id: "marketing",
    heading: "Marketing",
    purpose: purposeOf("marketing"),
    stats: [
      { key: "leads", label: "Leads in play", href: "/portal/agency/pipelines/leads" },
      { key: "activeClients", label: "Active clients" },
      { key: "openActions", label: "Open actions", href: "/portal/agency/actions" },
    ],
    destinations: [
      { label: "Marketing", description: "Campaigns, content and funnels that fill the top of the pipeline.", href: "/portal/agency/marketing", icon: "Megaphone" },
      { label: "Campaigns", description: "Plan and send the next touch.", href: "/portal/agency/leads-pipeline/campaigns", icon: "Send" },
      { label: "Actions", description: "The growth work waiting on you today.", href: "/portal/agency/actions", icon: "ListChecks" },
    ],
  },
  support: {
    id: "support",
    heading: "Support",
    purpose: purposeOf("support"),
    stats: [
      { key: "activeClients", label: "Active clients" },
      { key: "openActions", label: "Open actions", href: "/portal/agency/actions" },
    ],
    destinations: [
      { label: "Inbox & actions", description: "Answer what comes in and keep every thread in one place.", href: "/portal/agency/inbox", icon: "Inbox" },
      { label: "Actions", description: "The replies and follow-ups waiting on you.", href: "/portal/agency/actions", icon: "ListChecks" },
      { label: "Clients", description: "Every client's record and history.", href: "/portal/clients", icon: "Users" },
    ],
  },
};

/**
 * The focus-home config for a hat, or `null` when the hat has no focus home
 * (no hat at all, an unknown value, or Executive — which lands on its station).
 */
export function focusHomeConfig(departmentId: string | undefined): FocusHomeConfig | null {
  if (!departmentId) return null;
  return FOCUS_HOME_CONFIG[departmentId as DepartmentId] ?? null;
}

/** The department id when it has a focus home, else `null`. */
export function focusHomeDepartment(departmentId: string | undefined): DepartmentId | null {
  return focusHomeConfig(departmentId)?.id ?? null;
}

/**
 * Whether the landing-replacement is on. Default ON; it exists so the swap can
 * be turned off from the deploy's environment (Railway) without a code redeploy
 * if a department home ever misbehaves — set `PORTAL_ROLE_FOCUS_HOME=off`.
 */
export function isFocusHomeEnabled(): boolean {
  const raw = process.env.PORTAL_ROLE_FOCUS_HOME?.trim().toLowerCase();
  return raw !== "off" && raw !== "false" && raw !== "0" && raw !== "disabled";
}
