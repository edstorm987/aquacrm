// T4 R004 — AquaOasis Demo content pack
//
// Seeds demo data INTO the AquaOasis Demo agency that T1 R026 (chapter
// #133) provisioned. T1's `lib/server/aquaOasisSeed.ts` creates the
// agency record + brand kit + plugin installs. THIS module fills those
// installs with realistic-looking demo data so when Ed flips the Topbar
// agency switcher to AquaOasis, the plugin pages aren't empty.
//
// Placed under `src/app/(seeds)/` rather than `src/lib/server/` because
// the latter is T1 territory (router HARD BOUNDARY). The (seeds) route
// group means Next.js does NOT route this folder — it's a code-only
// container we own.
//
// Wire-up: Q-ASSUMED — T1 will import `seedAquaOasisDemoContent` and
// call it from `aquaOasisSeed.ts` (or founder seed runner) AFTER the
// agency record + plugin installs land. Module is pure data + a
// port-driven runner, so T1 wires storage adapters into `ports`.
// Idempotent via the `aquaoasis-demo-content/seeded` metadata flag —
// caller passes a `markerStore` port that T1 maps to whatever
// install-metadata or agency-metadata bag they prefer.
//
// Honesty contract (chapter #68): every record carries a clearly
// marked DEMO-* slug + `demo: true` flag so no number can be confused
// with real client data downstream.
//
// Feature flag: `seedAquaOasisContent` defaults to `true` outside
// production; in production the demo content stays out of the seeded
// agency record (so a prod tenant flip doesn't spawn fake data).

export const AQUA_OASIS_AGENCY_SLUG = "aquaoasis-demo";
export const AQUA_OASIS_DEMO_MARKER_KEY = "aquaoasis-demo-content/seeded";

export const seedAquaOasisContent: boolean =
  typeof process !== "undefined"
    ? process.env.NODE_ENV !== "production"
    : true;

// ─── Demo brand-kit flavours (3 distinct, each tied to one client) ───

export interface DemoBrandKit {
  readonly id: "heritage" | "coastal" | "studio-pastel";
  readonly name: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
  readonly fontHeading: string;
  readonly fontBody: string;
  readonly borderRadius: string;
}

export const DEMO_BRAND_KITS: readonly DemoBrandKit[] = [
  {
    id: "heritage",
    name: "Heritage cream",
    primaryColor: "#3F4A36",
    secondaryColor: "#F4ECDC",
    accentColor: "#C9A76A",
    fontHeading: "\"Playfair Display\", serif",
    fontBody: "\"Inter\", system-ui, sans-serif",
    borderRadius: "8px",
  },
  {
    id: "coastal",
    name: "Coastal teal",
    primaryColor: "#0E7490",
    secondaryColor: "#E0F2FE",
    accentColor: "#0891B2",
    fontHeading: "\"Cormorant Garamond\", serif",
    fontBody: "\"Inter\", system-ui, sans-serif",
    borderRadius: "10px",
  },
  {
    id: "studio-pastel",
    name: "Studio pastel",
    primaryColor: "#7C3AED",
    secondaryColor: "#FAF5FF",
    accentColor: "#F472B6",
    fontHeading: "\"DM Serif Display\", serif",
    fontBody: "\"DM Sans\", system-ui, sans-serif",
    borderRadius: "12px",
  },
];

// ─── Demo clients ────────────────────────────────────────────────────

export interface DemoClient {
  readonly slug: string;
  readonly name: string;
  readonly tagline: string;
  readonly brandKit: DemoBrandKit["id"];
  readonly demo: true;
}

export const DEMO_CLIENTS: readonly DemoClient[] = [
  {
    slug: "DEMO-marin-osteopathy",
    name: "Marin Osteopathy",
    tagline: "Hands-on osteopathic care for active adults.",
    brandKit: "heritage",
    demo: true,
  },
  {
    slug: "DEMO-tidewater-therapy",
    name: "Tidewater Therapy",
    tagline: "Coastal-clinic wellness — physio, massage, breathwork.",
    brandKit: "coastal",
    demo: true,
  },
  {
    slug: "DEMO-soft-light-studio",
    name: "Soft Light Studio",
    tagline: "Trauma-informed somatic coaching, online + in-studio.",
    brandKit: "studio-pastel",
    demo: true,
  },
];

// ─── Per-client contacts (5 each = 15 total) ─────────────────────────

export interface DemoContact {
  readonly clientSlug: string;
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly stage: "new" | "warm" | "active" | "dormant";
  readonly demo: true;
}

const CONTACT_FIRST = ["Lila", "Aaron", "Priya", "Ravi", "Neve", "Owen", "Cora", "Felix", "Maya", "Idris", "Saoirse", "Theo", "Jude", "Anaya", "Soren"];
const CONTACT_LAST  = ["Brooks", "Patel", "Okafor", "Nguyen", "Holm", "Reyes", "Iverson", "Aoki", "Sato", "Diaz", "Klein", "Onishi", "Tahir", "Mendes", "Park"];
const STAGES: readonly DemoContact["stage"][] = ["new", "warm", "active", "active", "dormant"];

export const DEMO_CONTACTS: readonly DemoContact[] = DEMO_CLIENTS.flatMap((c, ci) =>
  Array.from({ length: 5 }, (_, i) => {
    const idx = ci * 5 + i;
    const first = CONTACT_FIRST[idx % CONTACT_FIRST.length];
    const last = CONTACT_LAST[idx % CONTACT_LAST.length];
    return {
      clientSlug: c.slug,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.test`,
      phone: `+1-555-01${String(20 + idx).padStart(2, "0")}`,
      stage: STAGES[i],
      demo: true,
    } as const;
  }),
);

// ─── Per-client bookings (10 each = 30 total, spread next 30 days) ──

export interface DemoBooking {
  readonly clientSlug: string;
  readonly contactEmail: string;
  readonly title: string;
  readonly startsAt: string; // ISO
  readonly durationMin: number;
  readonly status: "confirmed" | "pending" | "completed";
  readonly demo: true;
}

const BOOKING_TITLES = [
  "Initial assessment",
  "Follow-up · 30 min",
  "Deep tissue · 60 min",
  "Breathwork session",
  "Movement screening",
  "Postural reset",
  "Recovery session",
  "Coaching call",
  "Group studio class",
  "Maintenance visit",
];

function dayOffsetIso(daysFromBase: number, hour: number, minute = 0): string {
  // Deterministic from a fixed reference (2026-05-08T00:00:00Z) so the
  // demo data renders identically across boots for the same agency.
  const base = Date.UTC(2026, 4, 8, 0, 0, 0); // 2026-05-08
  const ms = base + daysFromBase * 86_400_000 + hour * 3_600_000 + minute * 60_000;
  return new Date(ms).toISOString();
}

export const DEMO_BOOKINGS: readonly DemoBooking[] = DEMO_CLIENTS.flatMap((c, ci) =>
  Array.from({ length: 10 }, (_, i) => {
    const dayOffset = (ci * 3 + i * 3) % 30;          // spread across next 30 days
    const hour = 9 + ((ci + i) % 8);                  // 9am–4pm slots
    const titleIdx = (ci * 5 + i) % BOOKING_TITLES.length;
    const contact = DEMO_CONTACTS[ci * 5 + (i % 5)];
    const status: DemoBooking["status"] =
      dayOffset < 3 ? "completed" : dayOffset < 7 ? "confirmed" : "pending";
    return {
      clientSlug: c.slug,
      contactEmail: contact.email,
      title: BOOKING_TITLES[titleIdx],
      startsAt: dayOffsetIso(dayOffset, hour),
      durationMin: 30 + (i % 3) * 15,
      status,
      demo: true,
    } as const;
  }),
);

// ─── Per-client marketing leads (3 each = 9 total) ───────────────────

export interface DemoLead {
  readonly clientSlug: string;
  readonly source: "facebook-ads" | "google-organic" | "referral" | "instagram";
  readonly email: string;
  readonly capturedAt: string;
  readonly note: string;
  readonly demo: true;
}

const LEAD_SOURCES: readonly DemoLead["source"][] = [
  "facebook-ads",
  "google-organic",
  "referral",
  "instagram",
];

export const DEMO_LEADS: readonly DemoLead[] = DEMO_CLIENTS.flatMap((c, ci) =>
  Array.from({ length: 3 }, (_, i) => {
    const idx = ci * 3 + i;
    return {
      clientSlug: c.slug,
      source: LEAD_SOURCES[idx % LEAD_SOURCES.length],
      email: `lead${idx + 1}@${c.slug.replace("DEMO-", "").toLowerCase()}.test`,
      capturedAt: dayOffsetIso(-(idx + 1), 14),
      note: `Demo lead #${idx + 1} — ${c.name}`,
      demo: true,
    } as const;
  }),
);

// ─── Agency-level marketing campaigns (4) ────────────────────────────

export interface DemoAgencyCampaign {
  readonly slug: string;
  readonly name: string;
  readonly objective: "brand-awareness" | "lead-gen" | "rebooking" | "retention";
  readonly channel: "email" | "social" | "paid" | "referral";
  readonly status: "draft" | "scheduled" | "live" | "complete";
  readonly demo: true;
}

export const DEMO_AGENCY_CAMPAIGNS: readonly DemoAgencyCampaign[] = [
  { slug: "DEMO-spring-rebook", name: "Spring rebooking nudge", objective: "rebooking", channel: "email",    status: "live",      demo: true },
  { slug: "DEMO-coastal-launch", name: "Coastal launch series",  objective: "brand-awareness", channel: "social", status: "scheduled", demo: true },
  { slug: "DEMO-referral-perk",  name: "Referral bring-a-friend", objective: "retention",     channel: "referral", status: "live",     demo: true },
  { slug: "DEMO-google-spend",   name: "Google search · evergreen", objective: "lead-gen",    channel: "paid",     status: "draft",    demo: true },
];

// ─── Idempotent runner ──────────────────────────────────────────────

// Soft port contract — caller (T1) wires each method to the right
// storage adapter. All methods are async-or-direct; we await them so
// either signature works. Returning falsy from `markerStore.has` means
// "not seeded yet" → the runner proceeds and stamps the marker on
// success.

export interface SeedPorts {
  readonly markerStore: {
    has(agencySlug: string, key: string): Promise<boolean> | boolean;
    set(agencySlug: string, key: string): Promise<void> | void;
  };
  readonly clientStore:    { upsert(agencySlug: string, client:   DemoClient):           Promise<void> | void };
  readonly contactStore:   { create(agencySlug: string, contact:  DemoContact):          Promise<void> | void };
  readonly bookingStore:   { create(agencySlug: string, booking:  DemoBooking):          Promise<void> | void };
  readonly leadStore:      { create(agencySlug: string, lead:     DemoLead):             Promise<void> | void };
  readonly campaignStore:  { upsert(agencySlug: string, campaign: DemoAgencyCampaign):   Promise<void> | void };
}

export interface SeedResult {
  readonly seeded: boolean;
  readonly counts: {
    clients: number;
    contacts: number;
    bookings: number;
    leads: number;
    campaigns: number;
  };
}

export async function seedAquaOasisDemoContent(ports: SeedPorts): Promise<SeedResult> {
  if (!seedAquaOasisContent) {
    return { seeded: false, counts: { clients: 0, contacts: 0, bookings: 0, leads: 0, campaigns: 0 } };
  }
  const slug = AQUA_OASIS_AGENCY_SLUG;
  if (await ports.markerStore.has(slug, AQUA_OASIS_DEMO_MARKER_KEY)) {
    return { seeded: false, counts: { clients: 0, contacts: 0, bookings: 0, leads: 0, campaigns: 0 } };
  }

  for (const c of DEMO_CLIENTS)            await ports.clientStore.upsert(slug, c);
  for (const c of DEMO_CONTACTS)           await ports.contactStore.create(slug, c);
  for (const b of DEMO_BOOKINGS)           await ports.bookingStore.create(slug, b);
  for (const l of DEMO_LEADS)              await ports.leadStore.create(slug, l);
  for (const k of DEMO_AGENCY_CAMPAIGNS)   await ports.campaignStore.upsert(slug, k);

  await ports.markerStore.set(slug, AQUA_OASIS_DEMO_MARKER_KEY);

  return {
    seeded: true,
    counts: {
      clients: DEMO_CLIENTS.length,
      contacts: DEMO_CONTACTS.length,
      bookings: DEMO_BOOKINGS.length,
      leads: DEMO_LEADS.length,
      campaigns: DEMO_AGENCY_CAMPAIGNS.length,
    },
  };
}
