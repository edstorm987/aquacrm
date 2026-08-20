/**
 * Marketing view + channel routing.
 *
 * Lives beside the page rather than inside it so the resolver can be tested
 * directly — a `page.tsx` should only export what Next expects.
 *
 * ## Two consolidations, one rule
 *
 * **First cut (2026-08-19)** — the five channel tabs (social · websites ·
 * Google Ads · Google Business · reputation) became one **Channels** view with
 * an in-view switcher: they were always the same `MarketingChannelsWorkspace`
 * with a different `kind` filter.
 *
 * **Second cut (2026-08-20, Ed's call)** — ten views became five:
 *
 * | Tab           | Carries                                        |
 * | ------------- | ---------------------------------------------- |
 * | `pulse`       | the data spine, the marketing KPIs, the radar   |
 * | `demand`      | the live funnel, campaigns, lead sources        |
 * | `funnels`     | the funnel builder (build the journey)         |
 * | `customers`   | customer profiles + audience evidence          |
 * | `channels`    | the five channels (funnel builder resolves here too) |
 * | `automations` | internal automations                           |
 *
 * Client services is no longer a tab: it is a header link, but `?view=client-
 * services` still renders it.
 *
 * The rule both cuts obey: **no retired `?view=` value may die.** Ed has links,
 * bookmarks and docs pointing at the old tabs, and a dead link is a worse
 * outcome than an extra tab. Every retired value resolves onto its new home —
 * see {@link RETIRED_MARKETING_VIEWS} and {@link resolveMarketingView} — and
 * the section it used to be lands *first* inside that view, so a `?view=sources`
 * bookmark still opens on lead sources rather than three screens above them.
 */

/** The six tabs, plus the demoted-but-still-addressable client services view. */
export type MarketingView =
  | "pulse"
  | "demand"
  | "funnels"
  | "customers"
  | "channels"
  | "automations"
  | "client-services";

export type MarketingChannel =
  | "social"
  | "website"
  | "funnels"
  | "google-ads"
  | "google-business"
  | "reputation";

/** A block inside a merged view. The retired tabs became these. */
export type MarketingSection = "pulse" | "radar" | "funnel" | "campaigns" | "sources";

/** The tabs in the bar, in order. Funnels sits right after Demand — Ed calls
 *  the funnel builder vital, so it is a first-class destination, not two levels
 *  deep inside Channels. */
export const MARKETING_TAB_VIEWS: readonly MarketingView[] = [
  "pulse", "demand", "funnels", "customers", "channels", "automations",
];

/** Everything `?view=` may legally name, tabs plus the demoted view. */
export const MARKETING_VIEWS: readonly MarketingView[] = [
  ...MARKETING_TAB_VIEWS, "client-services",
];

export const MARKETING_CHANNELS: readonly MarketingChannel[] = [
  "social", "website", "funnels", "google-ads", "google-business", "reputation",
];

/** The view you get with no `?view=` at all. */
export const DEFAULT_MARKETING_VIEW: MarketingView = "pulse";

/**
 * Which blocks each merged view carries, in their default order. A view absent
 * here is a single block and has no sections.
 */
export const MARKETING_VIEW_SECTIONS: Partial<Record<MarketingView, readonly MarketingSection[]>> = {
  pulse: ["pulse", "radar"],
  demand: ["funnel", "campaigns", "sources"],
};

/**
 * Every `?view=` value retired by a consolidation, and where it now lands.
 *
 * Kept as data rather than as `if` arms so a test can walk it: each entry is a
 * link somewhere in Ed's bookmarks, the docs, or another workspace that links
 * into marketing, and none of them may fall back to the default view.
 */
export const RETIRED_MARKETING_VIEWS: Readonly<Record<string, {
  view: MarketingView;
  channel?: MarketingChannel;
  section?: MarketingSection;
}>> = {
  // ── Second cut: 10 → 5 ──
  overview: { view: "pulse", section: "pulse" },
  radar: { view: "pulse", section: "radar" },
  campaigns: { view: "demand", section: "campaigns" },
  sources: { view: "demand", section: "sources" },
  // `funnels` is no longer retired: it is a first-class top-level tab again, so
  // `?view=funnels` resolves onto itself (see MARKETING_TAB_VIEWS) rather than
  // redirecting into Channels. The Channels → Funnels channel path
  // (`?view=channels&channel=funnels`) still resolves independently.
  "customer-profiles": { view: "customers" },
  // ── First cut: the five channel tabs (still resolved by name below too) ──
  social: { view: "channels", channel: "social" },
  website: { view: "channels", channel: "website" },
  "google-ads": { view: "channels", channel: "google-ads" },
  "google-business": { view: "channels", channel: "google-business" },
  reputation: { view: "channels", channel: "reputation" },
};

export function isMarketingView(value: string | undefined): value is MarketingView {
  return MARKETING_VIEWS.includes(value as MarketingView);
}

export function isMarketingChannel(value: string | undefined): value is MarketingChannel {
  return MARKETING_CHANNELS.includes(value as MarketingChannel);
}

export function isMarketingSection(value: string | undefined): value is MarketingSection {
  return value === "pulse" || value === "radar" || value === "funnel" || value === "campaigns" || value === "sources";
}

/** The sections of a view, with `section` pulled to the front. */
export function orderedMarketingSections(view: MarketingView, section: MarketingSection | null): readonly MarketingSection[] {
  const sections = MARKETING_VIEW_SECTIONS[view] ?? [];
  if (!section || !sections.includes(section)) return sections;
  return [section, ...sections.filter(other => other !== section)];
}

/**
 * Resolve the requested view, keeping every retired link working: `?view=social`
 * opens Channels on Social, `?view=sources` opens Demand *on* lead sources, and
 * `?view=overview` opens the Pulse that absorbed it — never a silent fallback.
 */
export function resolveMarketingView(
  requestedView: string | undefined,
  requestedChannel: string | undefined,
  requestedSection?: string | undefined,
): { view: MarketingView; channel: MarketingChannel; section: MarketingSection | null } {
  const retired = requestedView ? RETIRED_MARKETING_VIEWS[requestedView] : undefined;
  const view = retired?.view ?? (isMarketingView(requestedView) ? requestedView : DEFAULT_MARKETING_VIEW);

  // The retired view's own section wins over `?section=`: it *is* the request.
  const requested = retired?.section ?? (isMarketingSection(requestedSection) ? requestedSection : null);
  const sections = MARKETING_VIEW_SECTIONS[view] ?? [];
  const section = requested && sections.includes(requested) ? requested : sections[0] ?? null;

  const channel = retired?.channel
    ?? (isMarketingChannel(requestedChannel) ? requestedChannel : "social");

  return { view, channel, section };
}

/** A link to a marketing view, preserving the brand scope. */
export function marketingHref(view: MarketingView, brandScope: string, section?: MarketingSection): string {
  const params = new URLSearchParams();
  if (view !== DEFAULT_MARKETING_VIEW) params.set("view", view);
  if (section && (MARKETING_VIEW_SECTIONS[view] ?? []).includes(section)) params.set("section", section);
  if (brandScope !== "all") params.set("brand", brandScope);
  const query = params.toString();
  return `/portal/agency/marketing${query ? `?${query}` : ""}`;
}

/** A link straight to one section, anchored so the browser lands on it. */
export function marketingSectionHref(view: MarketingView, section: MarketingSection, brandScope: string): string {
  return `${marketingHref(view, brandScope, section)}#${marketingSectionAnchor(section)}`;
}

/** The DOM id a section renders under, so links and headings cannot drift. */
export function marketingSectionAnchor(section: MarketingSection): string {
  return `marketing-${section}`;
}

/** A link straight to one channel inside the consolidated Channels view. */
export function marketingChannelHref(channel: MarketingChannel, brandScope: string): string {
  const params = new URLSearchParams({ view: "channels", channel });
  if (brandScope !== "all") params.set("brand", brandScope);
  return `/portal/agency/marketing?${params.toString()}`;
}
