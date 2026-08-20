// The four hand-written brand fronts. These are the only ids `getAuthBrand`
// will ever return, and the only ones with bespoke copy + CSS.
export type StaticAuthBrandId = "milesymedia" | "aqua" | "aquacrm" | "zimante";

// A brand id can now also be a real agency's slug (see `resolveAuthBrand`
// at the foot of this file). The union is kept as a hint so the four static
// ids still autocomplete and still narrow in `brand.id === "aqua"` checks.
export type AuthBrandId = StaticAuthBrandId | (string & {});

export interface AuthBrand {
  id: AuthBrandId;
  name: string;
  mark: string;
  eyebrow: string;
  headline: string;
  tagline: string;
  points: string[];
  homeUrl: string;
}

export function getAuthBrand(value: string | undefined): AuthBrand {
  // AquaCRM is the identity of this application. Public brand fronts pass
  // their brand explicitly; missing or stale values must never fall through
  // to an unrelated client brand.
  if (!value || !["milesymedia", "aqua", "aquacrm", "zimante"].includes(value)) {
    value = "aquacrm";
  }

  if (value === "aquacrm") {
    return {
      id: "aquacrm",
      name: "AquaCRM",
      mark: "A",
      eyebrow: "Secure client access",
      headline: "Your private workspace.",
      tagline:
        "Use the access issued for your project or client account.",
      points: [
        "Project, files and approvals.",
        "Billing, support and updates.",
      ],
      homeUrl:
        process.env.NEXT_PUBLIC_AQUACRM_WEBSITE_URL ??
        "/",
    };
  }

  if (value === "aqua") {
    return {
      id: "aqua",
      name: "AquaOasis-Web",
      mark: "A",
      eyebrow: "Client workspace",
      headline: "One clear place for everything we are building.",
      tagline:
        "Follow progress, review decisions and keep your website, software, billing and support connected.",
      points: [
        "See progress and what needs your attention.",
        "Review files, feedback and approvals.",
        "Keep billing and support in one history.",
      ],
      homeUrl:
        process.env.NEXT_PUBLIC_AQUAOASIS_URL ?? "https://aquaoasis-web.com",
    };
  }

  if (value === "zimante") {
    return {
      id: "zimante",
      name: "Zimante Group",
      mark: "Z",
      eyebrow: "Private group workspace",
      headline: "Every company. One joined-up project home.",
      tagline:
        "Follow combined work without chasing separate conversations, files or decisions.",
      points: [
        "Shared progress across the group.",
        "Clear decisions and responsibilities.",
        "One connected support history.",
      ],
      homeUrl:
        process.env.NEXT_PUBLIC_ZIMANTE_URL ?? "https://zimante-group.com",
    };
  }

  return {
    id: "milesymedia",
    name: "Milesymedia",
    mark: "M",
    eyebrow: "Client portal",
    headline: "Everything we are building together.",
    tagline:
      "Your secure Milesymedia home for the project, decisions, files, billing and support.",
    points: [
      "See progress and what needs your attention.",
      "Review files, ideas, feedback and approvals.",
      "Keep project history, billing and support together.",
    ],
    homeUrl:
      process.env.NEXT_PUBLIC_MILESYMEDIA_WEBSITE_URL ??
      "https://milesymedia.com",
  };
}

// ─── Dynamic brand fronts (multi-company) ─────────────────────────────────
//
// The four brands above are hand-written fronts. Ed now runs several real
// companies out of ONE AquaCRM, and each of their websites needs to hand a
// visitor to `/login?brand=<their-slug>` and have the sign-in page wear that
// company's name.
//
// The lookup below resolves a `?brand=` value against REAL agency records —
// but it keeps the original guard exactly as it was: anything that does not
// match a known static front *or* an active agency falls back to AquaCRM.
// A stale, guessed or hostile `?brand=` therefore still shows the neutral
// AquaCRM front and never a different client's name. That fallback is the
// whole point of this function; do not "helpfully" fuzzy-match here.

export const KNOWN_AUTH_BRAND_IDS: readonly StaticAuthBrandId[] = [
  "milesymedia",
  "aqua",
  "aquacrm",
  "zimante",
];

export function isKnownAuthBrandId(value: string): value is StaticAuthBrandId {
  return (KNOWN_AUTH_BRAND_IDS as readonly string[]).includes(value);
}

/**
 * The slice of an `Agency` this module needs. Declared structurally so
 * `authBrand.ts` stays free of any server-only import and remains usable
 * from a client component and from a plain unit test.
 */
export interface AuthBrandAgency {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface ResolvedAuthBrand extends AuthBrand {
  /**
   * Set only when the brand resolved to a real agency record. `undefined`
   * for the four static fronts and for the AquaCRM fallback — callers use
   * that difference to decide which agency a sign-in should land in.
   */
  agencyId?: string;
}

function normaliseBrandValue(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Exact, active-only agency lookup for a `?brand=` value. Slug first, then
 * id. Never partial, never case-sensitive-only, never archived/paused.
 *
 * SECURITY: callers that use the result to pick a session's agency MUST pass
 * a list already narrowed to agencies the person is a member of. This
 * function does not know about membership and is not a membership check.
 */
export function matchAuthBrandAgency(
  value: string | undefined | null,
  agencies: readonly AuthBrandAgency[],
): AuthBrandAgency | null {
  const raw = normaliseBrandValue(value);
  if (!raw) return null;
  const active = agencies.filter(a => a.status === "active");
  return (
    active.find(a => normaliseBrandValue(a.slug) === raw) ??
    active.find(a => normaliseBrandValue(a.id) === raw) ??
    null
  );
}

function brandFromAgency(agency: AuthBrandAgency): ResolvedAuthBrand {
  const name = agency.name.trim() || agency.slug;
  return {
    id: agency.slug,
    name,
    mark: (name.charAt(0) || "A").toUpperCase(),
    eyebrow: "Client workspace",
    headline: "Everything we are building together.",
    tagline: `Your secure ${name} home for the project, decisions, files, billing and support.`,
    points: [
      "See progress and what needs your attention.",
      "Review files, feedback and approvals.",
      "Keep billing and support in one history.",
    ],
    // Deliberately relative. An agency record carries no verified website,
    // and putting an unverified value behind the page's "Back to …" link
    // would turn `?brand=` into an open redirect.
    homeUrl: "/",
    agencyId: agency.id,
  };
}

/**
 * Brand front for a `?brand=` value, resolved against real agencies.
 *
 * Order: known static front → active agency (slug, then id) → AquaCRM.
 * The static fronts win so the four hand-written designs keep rendering
 * byte-for-byte as they did before agencies could be matched at all.
 */
export function resolveAuthBrand(
  value: string | undefined | null,
  agencies: readonly AuthBrandAgency[] = [],
): ResolvedAuthBrand {
  const raw = normaliseBrandValue(value);
  if (raw && isKnownAuthBrandId(raw)) return getAuthBrand(raw);
  const agency = matchAuthBrandAgency(raw, agencies);
  if (agency) return brandFromAgency(agency);
  // The guard. Unknown or stale → AquaCRM, never someone else's brand.
  return getAuthBrand(undefined);
}
