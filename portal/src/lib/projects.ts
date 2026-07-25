// Projects / case-studies registry. Add a new entry by appending to the
// PROJECTS array — the /projects page renders them automatically. Keep
// outcomes honest: a metric you can defend, not marketing hype.

export interface ProjectOutcome {
  metric: string;     // "Bookings"
  delta: string;      // "+180%"
  detail?: string;    // "in first 90 days"
}

export interface Project {
  slug: string;
  title: string;          // Headline of the case study
  client: string;         // Client / brand name
  sector: string;         // "Therapy clinic" / "Skincare DTC" / etc.
  year: string;           // "2025"
  status: "live" | "completed" | "in-progress";
  summary: string;        // 1-2 sentence problem → result
  services: string[];     // ["Website rebuild", "SEO", "Booking flow"]
  outcomes: ProjectOutcome[];
  brandColor?: string;    // Hex for accent on the card
  externalUrl?: string;   // Live site link (optional)
}

export const PROJECTS: Project[] = [
  {
    slug: "luv-and-ker",
    title: "Replaced 6 disconnected tools with one operating layer",
    client: "Luv & Ker",
    sector: "Therapy & wellness",
    year: "2025",
    status: "in-progress",
    summary:
      "Wholesale + clinic brand running on Shopify, Notion, Calendly and Google Sheets. We're consolidating bookings, end-customer accounts and stockist comms into a single Aqua Portal tenant.",
    services: ["Portal build", "Stockist platform", "End-customer accounts", "Brand kit"],
    outcomes: [
      { metric: "Tools consolidated", delta: "6 → 1", detail: "single source of truth" },
      { metric: "Order admin", delta: "−4 hrs/week", detail: "vs old Shopify + Sheets" },
    ],
    brandColor: "#0E7490",
  },
  {
    slug: "milesymedia-portal",
    title: "Built our own multi-tenant agency platform from scratch",
    client: "Milesy Media",
    sector: "Agency / SaaS",
    year: "2026",
    status: "live",
    summary:
      "40-plugin portal serving Agency → Client → End-customer on a single Next.js host. Public Health Check funnel and Business OS demo wired into the same engine.",
    services: ["Next.js platform", "Plugin architecture", "Auth + multi-agency", "Marketing site"],
    outcomes: [
      { metric: "Plugins shipped", delta: "40", detail: "in registry" },
      { metric: "Tenant tiers", delta: "3", detail: "Agency · Client · Customer" },
      { metric: "Single host", delta: "1 cookie · 1 deploy", detail: "no SSO seams" },
    ],
    brandColor: "#C9A76A",
    externalUrl: "https://milesymedia.com",
  },
];
