# Plan — Marketing workspace overhaul

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: PHASES 1–4 + 6 SHIPPED; only Phase 5's people-map is open (waiting on a PostHog read-back — a dependency, not a decision).** _(Was labelled "BLOCKED … collapse the 10 views to ~5? — is Ed's" after Ed made that call and the cut shipped.)_ **Phase 6 is DONE:** two consolidations landed — the five channel tabs → one Channels view (2026-08-19), then **ten views → five** (2026-08-20, Ed's call): `pulse` · `demand` · `customers` · `channels` · `automations`, with `client-services` demoted to a header link that `?view=` still resolves. Every retired `?view=` still lands on its new home — `RETIRED_MARKETING_VIEWS` ([`_marketingViews.ts:88`](../../../src/app/portal/agency/marketing/_marketingViews.ts)) and `resolveMarketingView` ([`:132`](../../../src/app/portal/agency/marketing/_marketingViews.ts)).

> ⚠️ **This correction turns one test red, and the test is the thing that is wrong.** `scripts/smoke-dev-tasks-parse.test.ts:65–68` uses THIS LIVE DOC as a fixture: it asserts `marketing-workspace-overhaul#6` still matches `/BLOCKED on Ed/i` and is not done. That pin was written when phase 6 really was blocked; the cut has since shipped, so **no honest version of this doc can pass it.** The test's actual intent — a parser guard that a "built"-type word inside a ⛔ paragraph must not read as done — is already covered independently by the synthetic-fixture test at `:45–53`, which uses an inline string rather than a live plan. **Fix: repoint lines 65–68 at a plan that is genuinely still blocked on Ed, or drop them in favour of the synthetic case. Source change — commander's call. Do NOT "fix" it by re-blocking this doc.**
half complete… needs a whole upgrade — funnels, marketing radar, customer
intelligence + profiles, tracking from enquiries + Aqua Tag polling so it knows
its data, its own KPIs and functionality."* Turn a sprawling, half-fed set of
tabs into a real **marketing command surface** with real data.

## Audit — where we are (verified)
`agency/marketing/page.tsx` (895L) has **12 views**: overview · client-services ·
campaigns · **customer-profiles** · social · website · **funnels** · google-ads ·
google-business · reputation · **sources** · automations. Big components:
`_FunnelsWorkspace` (897L), `_CustomerProfilesWorkspace` (440L),
`_MarketingChannelsWorkspace` (403L).

**So it's not short on surface — it's short on landing + feeding:**
- **Marketing radar exists but isn't surfaced here** — the Radar `marketing` domain (traffic-24h/7d, traffic-change/surges/drops, form-submissions, conversions, conversion-rate, campaign-attribution, unattributed-leads, search-visibility) is computed, but there's no "marketing radar" view in the workspace.
- **Marketing KPIs exist but no KPI view here** — traffic-7d, forms-7d, website-conversion, campaign-roas, marketing-spend, audience-confidence, active-campaigns live in command intelligence, not as a marketing KPI/graph surface.
- **Customer profiles + the people-map are here but thin** — `_CustomerProfilesWorkspace` exists; the demographics/people-map Ed loves needs the upgrade (scope + configure).
- **Data feed is partial** — some tag/enquiry/telemetry references exist, but marketing doesn't fully *know its data* — it should poll the Aqua Tag + enquiries so it's real, not assumed.
- 12 views **don't cohere** into a command surface.

## Goals
1. **Its own KPIs + graph** — a marketing KPI view (traffic/forms/conversion/ROAS/spend/sources/audience) with the explorer/graph.
2. **Marketing radar** — surface the Radar marketing domain as a marketing-scoped watch (drops/surges/conversion/attribution/unattributed).
3. **Customer intelligence + profiles** — the people-map/demographics + profiles, scoped + configurable.
4. **Funnels** — a real funnel (pageviews → forms → leads → meetings → won) fed by live data.
5. **Real tracking** — poll the Aqua Tag + enquiries so marketing *knows* its data (not assumptions). ✅ **Done 2026-08-19**, including knowing what it *cannot* see: `shapeMarketingSources` reports each of the tag's seven injectable tools as **reading back** (a server-side sync exists and has run — today only Search Console), **sending only** (on the sites, but nothing pulls its data back — this is PostHog today), or **not on any site**. Surfaced on `?view=radar`.
6. **Cohere** — fewer, sharper surfaces; the 12 views consolidated around the above.

## The data spine (this is the fix for "half-fed")
Marketing should run off the **Aqua Tag + enquiries** as its source of truth
(same backbone as everything else): the tag's telemetry (traffic, forms,
conversions) + `brand_enquiries` (leads, sources, campaigns) → feed the KPIs,
funnels, radar, and profiles. **Ties directly to the [Aqua Tag system](aqua-tag-system.md)**
(the data producer) and the [KPI overhaul](kpi-intelligence-overhaul.md) (the
metric registry + explorer + customer intelligence).

## The target shape — a marketing command surface
- **Marketing pulse** — the marketing KPIs vs target with deviation (the [KPI explorer](kpi-intelligence-overhaul.md), *marketing-scoped* — reuse, don't rebuild).
- **Marketing radar** — the Radar marketing domain surfaced here: what's dropping/surging, conversion/attribution problems, unattributed leads → actionable.
- **Funnels** — a live funnel from the real pageview→form→lead→meeting→won data (the commercial-intelligence `lineage` already computes this funnel — surface it).
- **Customer intelligence** — the people-map + demographics + profiles, **per-business or ecosystem**, configurable dimensions (reuse the [KPI overhaul](kpi-intelligence-overhaul.md) Part D).
- **Channels / campaigns / sources** — kept, fed with real attribution from the tag/enquiries. ✅ **Campaigns + sources done 2026-08-19** (`attributeEnquiriesToCampaigns` — key match stated as fact, name match flagged as a suggestion to confirm, unmatched campaign names reported as gaps; real enquiry sources on `?view=sources`). Channel *assets* (social/ads/reputation) still run on plugin records — they have no tag-side signal to attribute from yet.

## Phases (simple-first)
1. ✅ **Wire the data spine** — SHIPPED 2026-08-19. `lib/server/marketingIntelligence.ts` (`marketingDataSpine`) reshapes the 12 Radar `marketing` families + the `websiteSources` tag registry + live `brand_enquiries`. Surfaced as the overview's **Live data spine** panel and real enquiry sources on `?view=sources`. Unmeasured reads `null`/"—", never a fabricated 0; a demo session's missing enquiries report `available: false`, never "none arrived". The agency-website-only `websiteViews` counter was removed (one traffic number, not two).
2. ✅ **Marketing KPI view** — SHIPPED 2026-08-19 as **`?view=pulse`**: the 9 marketing-domain KPI descriptors from the registry (`describeCommandKpis`, read-only) with direction-aware deviation vs target and the registry's retained series as a sparkline. ⚠ **The open decision is now narrower:** this is the *fixed marketing set*. Whether to also give marketing the **full explorer** (search/overlay/plot any KPI) is still Ed's call — the substrate is the same registry either way, so it's additive, not a rework.
3. ✅ **Marketing radar** — SHIPPED 2026-08-19 as **`?view=radar`**: firing marketing signals most-severe-first, then all 12 families watched, with coverage/confidence and tag reach. Read-only over `getCachedBusinessIssueRadar` — no Radar engine edit.
4. ✅ **Funnels** — SHIPPED 2026-08-19. `MarketingFunnelBoard` above the existing funnel tooling on `?view=funnels`: pageviews → forms → leads → contacted → meetings → proposals → won → active clients from `commercialIntelligence.lineage`, per-stage conversion, and an honest "not measured" top of funnel when the tag is silent.
5. ⚠ **Customer intelligence + profiles** — **MOSTLY ALREADY DONE, by the KPI worker's Phase 7** (verified in source 2026-08-19, not by this worker): `lib/customerProfileScope.ts` (`scopeProfiles`, `summariseProfileDimension`) drives a **company ↔ "All companies (ecosystem)" scope selector** plus a configurable "breakdown by …" panel in `_CustomerProfilesWorkspace.tsx`. So the decision below was effectively answered — **both, via a toggle** — and built. **What genuinely remains:** the people-map/demographics upgrade — real geography. **Ed's answer (2026-08-19): the sources are the tag's own tools — Search Console (already going through the tag) and PostHog (Ed will integrate).** So this is not a purchase decision: `posthog` and `gsc-verification` are already first-class Aqua Tag injection providers, and Search Console **already reads back** (`api/portal/performance/search-console` → `fetchGoogleSearchConsoleEvents` → `type:"search"` telemetry → the Radar `search-visibility` family, which the marketing radar now surfaces). **The one missing piece is a PostHog read-back** — injection sends data *out*; nothing pulls its geography/demographics back in. When that lands, the people-map has a real source. The marketing surface is already prepared: `shapeMarketingSources` reports every provider as *reading back* / *sending only* / *not on any site*, and enabling PostHog is a one-line addition to `READ_BACK_PROVIDERS`.
6. ✅ **Cohere** — SHIPPED. Ed's call was *consolidate*. Two cuts: the five channel tabs merged into one **Channels** view with an in-view switcher (2026-08-19), then **ten views → five** (2026-08-20): `pulse` (data spine + marketing KPIs + radar) · `demand` (funnel + campaigns + lead sources) · `customers` · `channels` (five channels + the funnel builder) · `automations`. `client-services` is a header link, still addressable by `?view=`. The rule both cuts obey — **no retired `?view=` may die** — is held as data, not `if` arms, so a test can walk it: `RETIRED_MARKETING_VIEWS` ([`_marketingViews.ts:88–106`](../../../src/app/portal/agency/marketing/_marketingViews.ts)), and the retired view's own section is pulled to the front by `orderedMarketingSections` ([`:120`](../../../src/app/portal/agency/marketing/_marketingViews.ts)) so a `?view=sources` bookmark opens *on* lead sources.

**Also built** (2026-08-19, decision-free work inside the plan's target shape): **brand scoping of the enquiry half** through the tag routing registry (`destinationCompanyId`, never a slug match — different id spaces); the **data-source roster** (reading-back vs sending-only vs absent); the **website view now links to Performance** rather than growing a second per-site traffic table (the duplication this workspace is already flagged for); **real campaign attribution** on `?view=campaigns` (`attributeEnquiriesToCampaigns`, guess-then-confirm) and **real demand evidence** on `?view=customer-profiles` (enquiries by brand + source over 30 days, to validate an audience against what actually arrived).

**Built so far** (2026-08-19, phases 1–4): `src/lib/server/marketingIntelligence.ts` (the read model), `src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx` (pulse · radar · funnel board), wiring in `marketing/page.tsx`, tests in `scripts/smoke-marketing-intelligence.test.ts`. **Not browser-verified** — see [status.md](../status.md).

## Reuse (mostly consume + surface + feed — not rebuild)
Radar **marketing** domain (already computed) · the [KPI overhaul](kpi-intelligence-overhaul.md) registry/explorer + customer intelligence · `commercialIntelligence.lineage` (the funnel is already computed) · `_FunnelsWorkspace` / `_CustomerProfilesWorkspace` (upgrade) · Aqua Tag telemetry + `brand_enquiries` (the data spine) · agency-marketing plugin (campaigns/leads/templates).

## Decisions (Ed) — one still open; phase 5 waits on a dependency, not a decision
- ~~**Consolidate the views** — down to ~5, or keep all 14?~~ **Answered by Ed + shipped 2026-08-20: consolidate.** Ten views became five (`pulse` · `demand` · `customers` · `channels` · `automations`); radar became a *section* of pulse rather than a tab, and funnels a *channel*. No retired link died.
- **Marketing-scoped KPIs** — the fixed marketing set (**built**, `?view=pulse`) is enough, or should marketing also get the full explorer (search/overlay/plot any KPI) scoped to marketing? Additive either way.
- ~~**Customer intelligence** — per-business, ecosystem, or both (toggle)?~~ **Answered + shipped** by the KPI overhaul's Phase 7 (both, via a scope selector).
- ~~**Real geography for the people-map?**~~ **Answered by Ed 2026-08-19: Search Console through the tag (already reading back) + PostHog, which Ed will integrate.** Not a decision any more — a dependency. The people-map waits on the **PostHog read-back**; everything else is in place.

## Non-goals (v1)
- Not a rebuild — reuse the radar/KPI/customer-intelligence engines, scoped to marketing.
- Not fabricating data — real from the tag/enquiries, honest fallbacks.

## Ties
The [Aqua Tag system](aqua-tag-system.md) (data producer), the [KPI overhaul](kpi-intelligence-overhaul.md)
(KPIs + explorer + customer intelligence — marketing is a scoped consumer), Radar
(marketing domain), and the commercial-intelligence funnel/lineage.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/server/marketingIntelligence.ts`
- `src/app/portal/agency/marketing/page.tsx`
- `src/app/portal/agency/marketing/_marketingViews.ts`
- `src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx`
- `src/app/portal/agency/marketing/_FunnelsWorkspace.tsx`
- `src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx`
- `src/app/portal/agency/marketing/_MarketingChannelsWorkspace.tsx`
- `src/lib/people/customerProfileScope.ts`
- `scripts/smoke-marketing-intelligence.test.ts`
- `scripts/smoke-marketing-customer-profiles.test.ts`
- `scripts/verify-marketing-runtime.ts`
- `docs/development/plans/marketing-workspace-overhaul.md`
