// Which native palette blocks have no backend a VISITOR can reach.
//
// Issue #29 — "stop publishing dead interactive blocks". Found again by the
// pre-launch audit on 2026-08-27, and the audit sharpened what the issue says.
//
// ── What is actually wrong ────────────────────────────────────────────────
//
// The original wording was "these blocks use absent paths". Half true. Three
// different things are going on and they need different answers:
//
//   1. The module does not exist AT ALL. `forms`, `reservations`, `newsletter`
//      and `themes` are not among the thirteen modules in `src/built-ins/modules`.
//      Nothing can install them, so these blocks can never work.
//   2. The module exists but never declares the route. The website editor's own
//      blog endpoints are in this group.
//   3. The route exists but is not `public`, so the dispatcher demands a
//      session — and a visitor to a published site is anonymous by definition.
//      Only NINE routes across all thirteen modules are declared public.
//
// The third is the one worth pausing on, because a 401 in a log reads like a
// permissions bug rather than a design gap. `[module]/[...rest]/route.ts` calls
// `requireSession()` unless the resolved route sets `public: true`. A published
// marketing page is the one surface where there is no session to require.
//
// ── Why label rather than delete, and why not just build the backend ──────
//
// Issue #29's own acceptance wording is "connect each block to a real anonymous,
// tenant-aware endpoint **or label/remove it until the backend exists**". There
// is no such endpoint to connect to today, and the two anonymous endpoints that
// DO exist are both wrong homes for it: `/api/public/brand-enquiry` is bound to
// a fixed list of Ed's own trading brands, and `/api/public/form-capture` says
// in its own header that it "enriches rather than duplicates" and that creating
// an enquiry there "would double every count in the inbox". Pointing a client's
// contact form at either would be a worse bug than the one being fixed.
//
// Building the real thing means tenant resolution from the published site,
// spam/rate limiting, notification and inbox integration — and it inherits the
// consent question in issue #2, which is Ed's decision and not mine. So the
// blocks are labelled honestly until that exists.
//
// Deleting them was the other option and is worse: a client whose page already
// contains one would silently lose content on next load. Labelling keeps what
// is there, and stops anybody adding a ninth broken form.
//
// ── This list is checked, not trusted ────────────────────────────────────
//
// `smoke-website-editor-block-backends` re-derives the truth from the module
// route tables and fails BOTH ways: a block listed here whose backend now works
// fails, and a block not listed here that calls an unreachable endpoint fails.
// So when somebody builds the forms module, the test tells them to delete the
// entry rather than leaving a stale warning in front of clients forever.

export interface BlockBackendGap {
  /** Shown to the person building the page. Plain, no issue numbers. */
  reason: string;
  /** Endpoints the block calls that a visitor cannot reach. */
  endpoints: readonly string[];
  /** The module that would have to exist, or be made public, for it to work. */
  needs: string;
}

export const BLOCK_BACKEND_GAPS: Readonly<Record<string, BlockBackendGap>> = {
  "contact-form": {
    // Half-true now, and the wording has to say which half (2026-08-27).
    //
    // In an EXPORTED site this block works: `staticExport` renders a real form
    // that posts straight to the client's own Supabase table, with the anon key
    // baked in. What still does not work is submitting from inside the editor's
    // own preview, because the React component posts to `/api/portal/forms/submit`
    // and there is no forms module behind it.
    //
    // It stays listed because that endpoint is still unreachable, which is what
    // the ratchet measures — but "nowhere to go" would now be wrong, and a
    // label that overstates the problem gets ignored just as fast as one that
    // understates it.
    reason: "Works on an exported site once this client's Supabase is connected — but it cannot be submitted from the editor preview.",
    endpoints: ["/api/portal/forms/submit"],
    needs: "forms",
  },
  "form-embed": {
    reason: "The form service this loads from does not exist yet.",
    endpoints: ["/api/portal/forms/public/form/:id", "/api/portal/forms/public/submit/:id"],
    needs: "forms",
  },
  "booking-widget": {
    reason: "Bookings have no backend yet — services, staff and availability cannot load.",
    endpoints: [
      "/api/portal/reservations",
      "/api/portal/reservations/services",
      "/api/portal/reservations/staff",
      "/api/portal/reservations/resources",
    ],
    needs: "reservations",
  },
  "newsletter-signup": {
    reason: "Sign-ups are not stored anywhere yet.",
    endpoints: ["/api/portal/newsletter/subscribe"],
    needs: "newsletter",
  },
  "theme-selector": {
    reason: "Visitor theme switching has no backend yet.",
    endpoints: ["/api/portal/themes/:siteId"],
    needs: "themes",
  },
  "blog-feed": {
    reason: "Posts cannot be listed on a published page yet.",
    endpoints: ["/api/portal/website-editor/blog/posts"],
    needs: "website-editor blog routes",
  },
  "blog-post": {
    reason: "A single post cannot be loaded on a published page yet.",
    endpoints: ["/api/portal/website-editor/blog/posts/by-slug"],
    needs: "website-editor blog routes",
  },
  "product-search": {
    // Caught by the test rather than by me: `product-search` sits in the native
    // palette AND declares `requiresPlugin: "ecommerce"`. That declaration is
    // inert — nothing in the app enforces `requiresPlugin` — so the block is
    // offered whether or not Ecommerce is installed, and its endpoint wants a
    // session either way.
    reason: "Product search needs the Ecommerce plugin, and its search requires a signed-in customer.",
    endpoints: ["/api/portal/ecommerce/products"],
    needs: "ecommerce",
  },
  "donation-button": {
    // Two gaps, not one. The session gap is the one this list was built for.
    // The second was found on 2026-08-31 by reading the handler instead of
    // trusting an earlier comment that claimed it "reads lineItems": it calls
    // `parseCheckoutRequest`, which enforces a strict field allowlist and
    // rejects the block's body outright on `lineItems`, while requiring
    // `version`, `operationId` and product-shaped `items` that a donation does
    // not have. So this block cannot complete a donation for ANY caller, and
    // making it work needs a donation shape in the checkout contract — not a
    // public route.
    reason: "Donations cannot complete: checkout needs the Ecommerce plugin and a signed-in customer, and it rejects this block's request because its checkout contract only accepts product line items.",
    endpoints: ["/api/portal/ecommerce/stripe/checkout"],
    needs: "ecommerce",
  },
} as const;

/** The gap for `type`, or `undefined` when the block is fine. */
export function blockBackendGap(type: string): BlockBackendGap | undefined {
  return BLOCK_BACKEND_GAPS[type];
}

// ── Telling "nothing there" apart from "we could not ask" ────────────────
//
// The blocks contributed by the memberships and affiliates plugins fetch
// their own data, and every one of them used to funnel a failure into the
// SAME branch as a genuinely empty result: a 404, a 401, a 500 and a dropped
// connection all ended as `plans = []` behind a silent `catch`, which the
// page then rendered as "No tiers available right now." or, worse, "No data
// yet — be the first!".
//
// That is the same defect as a missing date rendering as today: a blind spot
// presented as a fact. A visitor cannot tell that the site owner has plans
// they simply cannot be shown, and neither can the site owner previewing it.
//
// The four outcomes below are what a block can honestly distinguish from a
// single fetch, and they need different words on the page:
//
//   ok            — the backend answered; an empty list really is empty.
//   unavailable   — the module is not installed here (404 from the
//                   dispatcher's route resolver).
//   unauthorized  — the route exists but refuses an anonymous visitor
//                   (401/403). This is the block-backend gap of `#29`
//                   showing up at runtime, not an empty catalogue.
//   failed        — anything else, including a network error or bad JSON.
export type BlockFetchOutcome = "ok" | "unavailable" | "unauthorized" | "failed";

/**
 * Classify a storefront block's fetch. Pass the `Response`; pass `null`
 * (or nothing) when the request threw before there was one.
 */
export function classifyBlockFetch(
  res?: { ok?: boolean; status?: number } | null,
): BlockFetchOutcome {
  if (!res) return "failed";
  if (res.ok) return "ok";
  if (res.status === 404 || res.status === 410) return "unavailable";
  if (res.status === 401 || res.status === 403) return "unauthorized";
  return "failed";
}

/** Every block type that cannot serve a visitor today. */
export function blocksWithoutVisitorBackend(): string[] {
  return Object.keys(BLOCK_BACKEND_GAPS).sort();
}
