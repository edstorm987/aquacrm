export const APP_VERSION = "0.9.0";
export const RELEASE_STORAGE_KEY = "aquacrm:last-seen-release";
export const RELEASE_SEEN_EVENT = "aquacrm:release-seen";

export interface ProductRelease {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  highlights: Array<{
    title: string;
    detail: string;
  }>;
}

export const PRODUCT_RELEASES: ProductRelease[] = [
  {
    version: APP_VERSION,
    releasedAt: "2026-08-29",
    title: "Reach people, and see where your time went",
    summary:
      "Calling and outreach from the contact list itself, a workspace that adapts to the job you are doing, "
      + "and an honest read on which part of the business is actually getting your hours.",
    highlights: [
      {
        title: "Call and email straight from your list",
        detail:
          "Import a CSV, pick which number or address you are working from — a burner line or the official one — "
          + "and call or email each contact without leaving the list. Incoming calls tell you who is ringing and "
          + "whether they are a client, a lead, or somebody you tried last week. Anyone who asks to be taken off "
          + "the list is refused on every channel, not just the one they said it on.",
      },
      {
        title: "Work as a department, not as everything at once",
        detail:
          "Choose which job you are doing — sales, delivery, finance, marketing or support — and the workspace "
          + "narrows to it. The same setting is the seat you hire someone into, so a new caller sees their work "
          + "and nothing else.",
      },
      {
        title: "My Radar",
        detail:
          "Set what each part of the business should get each week, then see what it actually got. A one-person "
          + "agency reads its five departments the way a larger one reads its team — the point being to spot the "
          + "area that is starved rather than average it away.",
      },
      {
        title: "The editor, end to end",
        detail:
          "The Dev Editor now opens a projects workspace, edits several files at once with real syntax colouring, "
          + "and writes, publishes and merges its changes. It tells you when a file has moved underneath you.",
      },
      {
        title: "A workspace that fits a phone",
        detail:
          "Keep the controls you actually use on the top bar instead of in the drawer, hold to rename or recolour "
          + "a saved tab, and drag it where you want it. Search now covers every screen in the app, including the "
          + "ones with no menu entry.",
      },
      {
        title: "Safer, and lighter",
        detail:
          "Closed a set of cross-tenant and role gaps found by review, split the largest stored records so the "
          + "workspace loads faster, and corrected how long Radar keeps its evidence.",
      },
    ],
  },
  {
    version: "0.8.0",
    releasedAt: "2026-08-09",
    title: "Connected operations",
    summary: "A clearer AquaCRM that joins delivery, performance, enquiries, finance, and daily decisions in one working system.",
    highlights: [
      {
        title: "Web performance and reporting",
        detail: "Aqua Tag signals, Search Console data, conversions, page performance, client filtering, and monthly client reports now share one dashboard.",
      },
      {
        title: "Inbox and lead capture",
        detail: "Website enquiries now carry their source, brand, service, and message into the master inbox and sales workflow.",
      },
      {
        title: "Smarter company control",
        detail: "Company health, advisor context, recommended actions, and operational notifications now surface gaps before they are missed.",
      },
      {
        title: "Development workspace",
        detail: "Projects, connected repositories, previews, environment signals, Explorer tools, and performance now live together.",
      },
      {
        title: "Finance and integrations",
        detail: "Expense editing, evidence tracking, richer filtering, category analysis, and guided service connections are easier to operate.",
      },
    ],
  },
  {
    version: "0.7.0",
    releasedAt: "2026-08-06",
    title: "One AquaOasis-Web workspace",
    summary: "The internal portal was consolidated around one operating company while preserving branded customer experiences.",
    highlights: [
      {
        title: "Unified internal portal",
        detail: "Clients, products, pipelines, finance, marketing, and development can be managed without switching between internal brands.",
      },
      {
        title: "Client-facing flexibility",
        detail: "Customer portals can still follow the right public brand and hand over cleanly to each bespoke production solution.",
      },
      {
        title: "Production foundations",
        detail: "Supabase-backed storage, authentication, email delivery, connection guidance, and launch checks became part of the core setup.",
      },
    ],
  },
  {
    version: "0.6.0",
    releasedAt: "2026-07-31",
    title: "Agency operating system foundation",
    summary: "The core client journey, portal lifecycle, commercial records, fulfilment, actions, and support surfaces became one repeatable workflow.",
    highlights: [
      {
        title: "Client journey",
        detail: "Leads, meetings, onboarding, delivery stages, portal previews, access codes, and live support were connected around one client record.",
      },
      {
        title: "Commercial trail",
        detail: "Invoices, income, expenses, products, plans, agreements, files, and billing history gained dedicated operating surfaces.",
      },
      {
        title: "Daily operations",
        detail: "Actions, recurring work, reminders, SOPs, inbox activity, and role-based access established the working portal foundation.",
      },
    ],
  },
];

export const LATEST_RELEASE = PRODUCT_RELEASES[0];

export function formatReleaseDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
