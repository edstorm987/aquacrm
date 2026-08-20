# `src/app/portal/agency/marketing/_marketingViews.ts`

← [File index](../../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** Marketing view + channel routing. Lives beside the page rather than inside it so the resolver can be tested directly — a `page.tsx` should only export what Next expects. ## Two consolidations, one rule **First cut (2026-08-19)** — the five channel tabs (social · websites · Google Ads · Google Business · reputation) became one **Channels** view with an in-view switcher: they were always the same `MarketingChannelsWorkspace` with a different `kind` filter. **Second cut (2026-08-20, Ed's call)** — ten views became five: | Tab           | Carries                                        | | ------------- | ---------------------------------------------- | | `pulse`       | the data spine, the marketing KPIs, the radar   | | `demand`      | the live funnel, campaigns, lead sources        | | `customers`   | customer profiles + audience evidence          | | `channels`    | the five channels **plus the funnel builder**  | | `automations` | internal automations                           | Client services is no longer a tab: it is a header link, but `?view=client- services` still renders it. The rule both cuts obey: **no retired `?view=` value may die.** Ed has links, bookmarks and docs pointing at the old tabs, and a dead link is a worse outcome than an extra tab. Every retired value resolves onto its new home — see {@link RETIRED_MARKETING_VIEWS} and {@link resolveMarketingView} — and the section it used to be lands *first* inside that view, so a `?view=sources` bookmark still opens on lead sources rather than three screens above them. The five tabs, plus the demoted-but-still-addressable client services view.

## Exports (18)

- `type MarketingView`
- `type MarketingChannel`
- `type MarketingSection`
- `MARKETING_TAB_VIEWS: readonly MarketingView[]`
- `MARKETING_VIEWS: readonly MarketingView[]`
- `MARKETING_CHANNELS: readonly MarketingChannel[]`
- `DEFAULT_MARKETING_VIEW: MarketingView`
- `MARKETING_VIEW_SECTIONS: Partial<Record<MarketingView, readonly MarketingSection[]>>`
- `RETIRED_MARKETING_VIEWS: Readonly<Record<string, { view: MarketingView; channel?: MarketingChannel; section?: MarketingSection; }>>`
- `isMarketingView(value: string | undefined): value is MarketingView`
- `isMarketingChannel(value: string | undefined): value is MarketingChannel`
- `isMarketingSection(value: string | undefined): value is MarketingSection`
- `orderedMarketingSections(view: MarketingView, section: MarketingSection | null): readonly MarketingSection[]`
- `resolveMarketingView(requestedView: string | undefined, requestedChannel: string | undefined, requestedSection?: string | undefined): { view: MarketingView; channel: MarketingChannel; section: MarketingSection | null }`
- `marketingHref(view: MarketingView, brandScope: string, section?: MarketingSection): string`
- `marketingSectionHref(view: MarketingView, section: MarketingSection, brandScope: string): string`
- `marketingSectionAnchor(section: MarketingSection): string`
- `marketingChannelHref(channel: MarketingChannel, brandScope: string): string`

## Used by (1)

- [`src/app/portal/agency/marketing/page.tsx`](./page.md)

