import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Marketing data spine — the read model behind the marketing workspace.
 *
 * These are behavioural tests of the pure shaping functions (no radar build, no
 * live Supabase): they pin the contract that matters for "marketing knows its
 * data" — a family the tag never reported is `null`/"unmeasured" and never a
 * fabricated zero, the worst lens in a family wins the status, and enquiries
 * that were not read report `available: false` rather than "none arrived".
 */

const NOW = 1_760_000_000_000;
const DAY = 86_400_000;

/** A radar check fixture; the spine only reads the fields named here. */
function check(familyId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `chk_${familyId}_${String(overrides.lens ?? "signal")}`,
    ruleId: `radar:marketing:${familyId}:${String(overrides.lens ?? "signal")}`,
    domain: "marketing",
    familyId,
    familyLabel: familyId,
    lens: "signal",
    lensLabel: "Signal",
    scope: "agency",
    status: "pass",
    title: `${familyId} title`,
    detail: `${familyId} detail`,
    evidence: [`${familyId} evidence`],
    href: `/portal/agency/marketing?family=${familyId}`,
    sourceId: familyId,
    measuredAt: NOW,
    ...overrides,
  };
}

const DOMAIN = {
  domain: "marketing", totalChecks: 144, passedChecks: 90, firingChecks: 4, watchChecks: 2,
  blindChecks: 8, coveragePercent: 62, confidencePercent: 55, readinessPercent: 48, lastSignalAt: NOW - 3_600_000,
};

const SUMMARY = { monitoredProperties: 3, connectedSources: 5, totalSources: 8 };

async function spineModule() {
  return import("../src/lib/server/marketingIntelligence");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape = async (input: Record<string, unknown>) => (await spineModule()).shapeMarketingSpine({
  domain: DOMAIN, summary: SUMMARY, sources: [], enquiries: null, generatedAt: NOW, now: NOW, ...input,
} as any);

test("the spine lifts a family's reading verbatim and takes the worst lens's status", async () => {
  const spine = await shape({
    checks: [
      check("traffic-7d", { lens: "threshold", value: 1_240, previousValue: 980, lastSeenAt: NOW - 60_000 }),
      check("traffic-7d", { lens: "trend", status: "warning", title: "Traffic is falling", detail: "Down against baseline" }),
      check("traffic-24h", { value: 210 }),
      check("traffic-change", { value: -18.4 }),
      check("form-submissions", { value: 12 }),
      check("conversions", { value: 4 }),
      check("conversion-rate", { value: 0.32 }),
    ],
  });
  assert.equal(spine.available, true);
  assert.equal(spine.traffic.last7d, 1_240, "the value comes from whichever lens carried a reading");
  assert.equal(spine.traffic.previous7d, 980);
  assert.equal(spine.traffic.last24h, 210);
  assert.equal(spine.traffic.changePercent, -18.4);
  assert.equal(spine.forms7d, 12);
  assert.equal(spine.conversions7d, 4);
  assert.equal(spine.conversionRatePercent, 0.32);

  const traffic7d = spine.measures.find(measure => measure.id === "traffic-7d");
  assert.equal(traffic7d?.status, "warning", "the family reports its worst news, not a lucky lens");
  assert.equal(traffic7d?.title, "Traffic is falling", "the firing lens's own words survive");
  assert.equal(traffic7d?.measured, true);
  assert.equal(traffic7d?.lastSignalAt, NOW - 60_000);
});

test("a family the tag never reported is unmeasured — null, never a fabricated zero", async () => {
  const { MARKETING_MEASURE_IDS } = await spineModule();
  const spine = await shape({ checks: [check("traffic-7d", { value: 5 })] });
  assert.equal(spine.measures.length, MARKETING_MEASURE_IDS.length, "every marketing family is registered");

  const forms = spine.measures.find(measure => measure.id === "form-submissions");
  assert.equal(forms?.value, null, "no reading means null, so the UI can show a dash");
  assert.notEqual(forms?.value, 0, "an unmeasured family must never read as zero");
  assert.equal(forms?.status, "unmeasured");
  assert.equal(forms?.measured, false);
  assert.equal(spine.forms7d, null);
  assert.equal(spine.conversionRatePercent, null);
  assert.ok(!spine.attention.some(measure => measure.status === "unmeasured"), "unmeasured is not 'attention'");
});

test("attention lists only firing marketing checks, most severe first", async () => {
  const spine = await shape({
    checks: [
      check("traffic-drops", { status: "critical" }),
      check("conversion-rate", { status: "watch", value: 0.1 }),
      check("unattributed-leads", { status: "warning" }),
      check("traffic-24h", { status: "pass", value: 100 }),
      check("search-visibility", { status: "blind" }),
    ],
  });
  assert.deepEqual(spine.attention.map(measure => measure.id), ["traffic-drops", "unattributed-leads", "conversion-rate"]);
  assert.ok(!spine.attention.some(measure => measure.status === "pass" || measure.status === "blind"), "only firing checks are actionable");
});

test("tag coverage counts registered sites, routing and reporting properties", async () => {
  const spine = await shape({
    checks: [check("traffic-7d", { value: 400, lastSeenAt: NOW - 120_000 })],
    sources: [
      { id: "ws_1", agencyId: "agency", host: "aquaoasis.co.uk", label: "Aqua Oasis", createdAt: NOW },
      { id: "ws_2", agencyId: "agency", host: "cedar-dental.com", label: "Cedar", destinationClientId: "client_1", createdAt: NOW },
      { id: "ws_3", agencyId: "agency", host: "milesy.media", label: "Milesy", destinationCompanyId: "company_1", createdAt: NOW },
    ],
  });
  assert.equal(spine.tag.registeredSources, 3);
  assert.equal(spine.tag.routedSources, 2, "a source routed to a client or trading company counts as routed");
  assert.equal(spine.tag.monitoredProperties, 3);
  assert.equal(spine.tag.connectedSources, 5);
  assert.equal(spine.tag.connected, true, "monitored properties plus a real signal means the tag is reporting");
  assert.equal(spine.tag.lastSignalAt, NOW - 120_000);
});

test("enquiries that were not read report unavailable — never 'zero enquiries'", async () => {
  const spine = await shape({ checks: [check("traffic-7d", { value: 1 })], enquiries: null });
  assert.equal(spine.enquiries.available, false, "a demo session supplies none; that is not evidence of none");
  assert.equal(spine.enquiries.total, 0);
  assert.equal(spine.enquiries.attributionPercent, null);
  assert.deepEqual(spine.enquiries.bySource, []);
});

test("the enquiry feed windows, attributes and groups real submissions", async () => {
  const { shapeMarketingEnquiries } = await spineModule();
  const feed = shapeMarketingEnquiries([
    { submittedAt: NOW - DAY, source: "google-ads", campaign: "spring-offer", brand: "aqua-oasis", brandName: "Aqua Oasis" },
    { submittedAt: NOW - 3 * DAY, source: "google-ads", campaign: "spring-offer", brand: "aqua-oasis", brandName: "Aqua Oasis" },
    { submittedAt: NOW - 12 * DAY, source: "website:milesy-media", brand: "milesy-media" },
    { submittedAt: NOW - 40 * DAY, source: "referral", brand: "aqua-oasis", brandName: "Aqua Oasis" },
  ], NOW);

  assert.equal(feed.available, true);
  assert.equal(feed.total, 4);
  assert.equal(feed.last7d, 2, "only submissions inside seven days");
  assert.equal(feed.last30d, 3, "the 40-day-old enquiry falls outside the month");
  assert.equal(feed.attributed, 3, "a campaign or a real source counts as attributed");
  assert.equal(feed.unattributed, 1, "the generic website:<brand> fallback is not attribution");
  assert.equal(feed.attributionPercent, 75);
  assert.equal(feed.latestAt, NOW - DAY);

  assert.deepEqual(feed.bySource.map(row => [row.key, row.total]), [["google-ads", 2], ["referral", 1], ["unattributed", 1]]);
  assert.equal(feed.bySource[0].last7d, 2);
  assert.deepEqual(feed.byCampaign.map(row => row.key), ["spring-offer"]);
  assert.deepEqual(feed.byBrand.map(row => [row.label, row.total]), [["Aqua Oasis", 3], ["milesy-media", 1]]);
});

test("an unbuildable radar degrades to an honest empty spine, it does not throw", async () => {
  const { emptyMarketingSpine, MARKETING_MEASURE_IDS } = await spineModule();
  const spine = emptyMarketingSpine(NOW);
  assert.equal(spine.available, false);
  assert.equal(spine.measures.length, MARKETING_MEASURE_IDS.length);
  assert.ok(spine.measures.every(measure => measure.value === null && measure.status === "unmeasured"));
  assert.equal(spine.traffic.last7d, null);
  assert.equal(spine.tag.connected, false);
  assert.equal(spine.enquiries.available, false);
  assert.equal(spine.health, null);
});

test("the marketing workspace consumes the spine instead of assuming its numbers", async () => {
  const page = readFileSync(new URL("../src/app/portal/agency/marketing/page.tsx", import.meta.url), "utf8");
  assert.match(page, /marketingDataSpine/, "the page builds the spine");
  assert.match(page, /listWebsiteEnquiries/, "enquiries feed the spine");
  assert.match(page, /!session\.isDemo \? await listWebsiteEnquiries/, "a demo session reads no enquiries");
  assert.match(page, /<MarketingDataSpinePanel/, "the overview surfaces the live spine");
  assert.match(page, /<MarketingEnquirySources/, "sources shows where real enquiries came from");
  assert.ok(!/websiteViews/.test(page), "the agency-website-only pageview count is gone — one traffic number, not two");

  const spine = readFileSync(new URL("../src/lib/server/marketingIntelligence.ts", import.meta.url), "utf8");
  assert.match(spine, /getCachedBusinessIssueRadar/, "it reads the cached radar rather than rebuilding it");
  assert.ok(!/buildBusinessIssueRadar\(/.test(spine), "the spine must never build or edit the radar engine");
  assert.match(spine, /import \{ describeCommandKpis[^}]*\} from "@\/lib\/performance\/kpiRegistry"/, "the KPI registry is consumed, not re-implemented");
  assert.ok(!/function describeCommandKpi\b/.test(spine), "no local copy of the registry projection");
  assert.ok(!/applyKpiTargetOverride|clearKpiTargetOverride/.test(spine), "marketing reads KPI targets, it never writes them");
});

// ── Phase 2–4: pulse, funnel and the command surfaces ────────────────────────

/** A registry descriptor fixture; only the fields the pulse reads are set. */
function descriptor(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label: `${id} label`,
    shortLabel: id,
    category: "marketing",
    kind: "command",
    format: "number",
    unit: "pageviews",
    formulaText: `${id} formula`,
    source: `marketing:${id}`,
    basis: "tag telemetry",
    window: "rolling 7 days",
    direction: "higher",
    target: 100,
    baseline: 0,
    cadence: "weekly",
    planSource: "Guardrail",
    value: 120,
    display: "120",
    status: "healthy",
    href: `/portal/agency/marketing?kpi=${id}`,
    detail: `${id} detail`,
    measuredAt: NOW,
    series: [{ at: NOW - 2 * DAY, value: 90 }, { at: NOW - DAY, value: 105 }, { at: NOW, value: 120 }],
    ...overrides,
  };
}

test("the pulse takes only the marketing KPIs and never recomputes their values", async () => {
  const { shapeMarketingPulse } = await spineModule();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pulse = shapeMarketingPulse([
    descriptor("traffic-7d"),
    descriptor("revenue-target", { category: "finance" }),
    descriptor("campaign-roas", { format: "number", value: 2, target: 3, display: "2.00x" }),
  ] as any);

  assert.deepEqual(pulse.map(metric => metric.id), ["traffic-7d", "campaign-roas"], "finance KPIs are not marketing's");
  assert.equal(pulse[0].display, "120", "the registry's own display string survives");
  assert.equal(pulse[0].value, 120, "no recompute — the registry value is passed through");
  assert.deepEqual(pulse[0].series.map(point => point.value), [90, 105, 120], "the plottable series is verbatim");
  assert.equal(pulse[0].formulaText, "traffic-7d formula");
});

test("deviation is direction-aware, so a positive number always means good news", async () => {
  const { shapeMarketingPulse } = await spineModule();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [higher, lower, untargeted, unmeasured] = shapeMarketingPulse([
    descriptor("traffic-7d", { value: 120, target: 100, direction: "higher" }),
    descriptor("marketing-spend", { value: 120, target: 100, direction: "lower" }),
    descriptor("audience-confidence", { value: 40, target: null }),
    descriptor("conversion-rate", { value: null, target: 1 }),
  ] as any);

  assert.equal(higher.deviationPercent, 20, "20% above a higher-is-better target reads as +20");
  assert.equal(higher.onTrack, true);
  assert.equal(lower.deviationPercent, -20, "20% over a spend cap is bad news, so it reads negative");
  assert.equal(lower.onTrack, false, "overspending a lower-is-better target is off track");
  assert.equal(untargeted.deviationPercent, null, "no target means no deviation to claim");
  assert.equal(untargeted.onTrack, null);
  assert.equal(unmeasured.deviationPercent, null, "an unmeasured KPI is not silently zero");
  assert.equal(unmeasured.onTrack, null);
});

const LINEAGE = { pageviews: 1_000, forms: 50, leads: 40, contacted: 30, meetings: 12, proposals: 6, won: 3, activeClients: 3, churnedClients: 1 };

test("the funnel surfaces the lineage the commercial engine already computed", async () => {
  const { shapeMarketingFunnel } = await spineModule();
  const funnel = shapeMarketingFunnel(LINEAGE, { trafficMeasured: true, formsMeasured: true });

  assert.deepEqual(funnel.map(stage => stage.id), ["pageviews", "forms", "leads", "contacted", "meetings", "proposals", "won", "active-clients"]);
  assert.equal(funnel[0].value, 1_000);
  assert.equal(funnel[0].conversionPercent, null, "the top of the funnel converts from nothing");
  assert.equal(funnel[1].conversionPercent, 5, "50 forms from 1,000 pageviews is 5%");
  assert.equal(funnel[1].dropFromPrevious, 950);
  assert.equal(funnel[4].conversionPercent, 40, "12 meetings from 30 contacted is 40%");
  assert.ok(funnel.every(stage => stage.measured), "CRM stages are always measured");
});

test("an unmeasured top of funnel says so instead of claiming nobody visited", async () => {
  const { shapeMarketingFunnel } = await spineModule();
  const funnel = shapeMarketingFunnel({ ...LINEAGE, pageviews: 0, forms: 0 }, { trafficMeasured: false, formsMeasured: false });

  assert.equal(funnel[0].value, null, "no tag signal means no pageview claim");
  assert.equal(funnel[0].measured, false);
  assert.equal(funnel[1].value, null);
  assert.equal(funnel[2].conversionPercent, null, "leads cannot convert from an unmeasured form count");
  assert.equal(funnel[3].conversionPercent, 75, "the CRM half of the funnel still converts normally");
});

test("the marketing workspace surfaces pulse, radar and the live funnel", async () => {
  const page = readFileSync(new URL("../src/app/portal/agency/marketing/page.tsx", import.meta.url), "utf8");
  assert.match(page, /marketingCommandModel/, "one model build feeds pulse, radar and funnel");
  assert.match(page, /view === "pulse"/, "the pulse view is routed");
  // P6: radar is no longer its own tab — it is a block inside Pulse.
  assert.match(page, /radar: model \? <MarketingRadarWorkspace/, "the marketing radar is routed inside Pulse");
  assert.match(page, /funnel: model \? <MarketingFunnelBoard/, "the live funnel is routed inside Demand");
  const views = readFileSync(new URL("../src/app/portal/agency/marketing/_marketingViews.ts", import.meta.url), "utf8");
  assert.match(views, /"pulse", "demand", "customers", "channels", "automations"/, "the five tabs are the accepted view names");
  assert.match(views, /radar: \{ view: "pulse", section: "radar" \}/, "?view=radar still resolves");

  const surfaces = readFileSync(new URL("../src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx", import.meta.url), "utf8");
  assert.ok(!/use client/.test(surfaces), "these are server components — no client bundle cost");
  assert.ok(!/Math\.random|fabricat/i.test(surfaces), "nothing is invented for display");
});

// ── Real campaign attribution (guess, then human-confirm) ────────────────────

const FEED_ENQUIRIES = [
  { submittedAt: NOW - DAY, source: "google-ads", campaign: "spring-offer" },
  { submittedAt: NOW - 2 * DAY, source: "google-ads", campaign: "spring-offer" },
  { submittedAt: NOW - 10 * DAY, source: "newsletter", campaign: "Winter Push" },
  { submittedAt: NOW - 5 * DAY, source: "referral" },
  { submittedAt: NOW - 6 * DAY, source: "website:aqua-oasis" },
  { submittedAt: NOW - 8 * DAY, source: "meta-ads", campaign: "ghost-campaign" },
];

async function feedFixture() {
  const { shapeMarketingEnquiries } = await spineModule();
  return shapeMarketingEnquiries(FEED_ENQUIRIES, NOW);
}

test("an exact source-key match is stated as fact; a name match is only a suggestion", async () => {
  const { attributeEnquiriesToCampaigns } = await spineModule();
  const result = attributeEnquiriesToCampaigns(
    [
      { id: "camp_1", name: "Spring promotion", sourceKey: "spring-offer" },
      { id: "camp_2", name: "Winter push" },
    ],
    await feedFixture(),
  );

  const keyed = result.campaigns.find(row => row.campaignId === "camp_1");
  assert.equal(keyed?.matchedOn, "key");
  assert.equal(keyed?.confident, true, "a source-key match is proven, not guessed");
  assert.equal(keyed?.enquiries, 2);
  assert.equal(keyed?.last7d, 2);

  const named = result.campaigns.find(row => row.campaignId === "camp_2");
  assert.equal(named?.matchedOn, "name", "\"Winter push\" matches \"Winter Push\" case- and punctuation-insensitively");
  assert.equal(named?.confident, false, "a name match is a guess for Ed to confirm, never asserted");
  assert.equal(named?.enquiries, 1);
});

test("a campaign nothing arrived for reads zero, and is not quietly given someone else's enquiries", async () => {
  const { attributeEnquiriesToCampaigns } = await spineModule();
  const result = attributeEnquiriesToCampaigns(
    [
      { id: "camp_1", name: "Spring promotion", sourceKey: "spring-offer" },
      { id: "camp_2", name: "Spring promotion", sourceKey: "spring-offer" },
    ],
    await feedFixture(),
  );
  const totals = result.campaigns.map(row => row.enquiries).sort();
  assert.deepEqual(totals, [0, 2], "one group is claimed once — a duplicate campaign does not double-count it");
});

test("campaign names arriving on real enquiries with no record behind them surface as gaps", async () => {
  const { attributeEnquiriesToCampaigns } = await spineModule();
  const result = attributeEnquiriesToCampaigns([{ id: "camp_1", name: "Spring promotion", sourceKey: "spring-offer" }], await feedFixture());

  assert.deepEqual(
    result.gaps.map(gap => gap.key).sort((a, b) => a.localeCompare(b)),
    ["ghost-campaign", "Winter Push"],
    "unclaimed campaign groups are reported, not absorbed",
  );
  assert.ok(result.gaps.every(gap => gap.enquiries > 0));
  assert.equal(result.unattributed, 1, "only the website:<brand> fallback enquiry is truly unattributed");
});

test("attribution reports unavailable rather than empty when enquiries were not read", async () => {
  const { attributeEnquiriesToCampaigns, shapeMarketingEnquiries } = await spineModule();
  const result = attributeEnquiriesToCampaigns([{ id: "camp_1", name: "Spring promotion" }], shapeMarketingEnquiries(null, NOW));
  assert.equal(result.available, false);
  assert.deepEqual(result.campaigns, [], "no enquiries read means no claim about any campaign");
  assert.deepEqual(result.gaps, []);
});

test("campaigns and customer profiles are fed by the spine too", async () => {
  const page = readFileSync(new URL("../src/app/portal/agency/marketing/page.tsx", import.meta.url), "utf8");
  // P6: campaigns is a block inside Demand (model-fed), profiles are Customers (spine-fed).
  assert.match(page, /const modelViews = view === "pulse" \|\| view === "demand";/, "Demand reads the model, which carries the spine");
  assert.match(page, /const spineViews = view === "customers";/, "Customers reads the spine");
  assert.match(page, /<MarketingCampaignAttributionPanel/, "campaigns show real enquiry attribution");
  assert.match(page, /<MarketingAudienceEvidencePanel/, "profiles can be checked against real demand");

  const surfaces = readFileSync(new URL("../src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx", import.meta.url), "utf8");
  assert.match(surfaces, /Suggested match/, "a guessed match is labelled as one");
  assert.ok(!/onClick|useState/.test(surfaces), "these panels report; they never write a match back");
});

// ── What marketing is plugged into (sending out vs reading back) ─────────────

test("a tool on the sites is 'sending only' until something reads it back", async () => {
  const { shapeMarketingSources } = await spineModule();
  const [posthog] = shapeMarketingSources([
    { kind: "posthog", label: "PostHog", injectedSites: 3, totalSites: 3 },
  ]);
  assert.equal(posthog.state, "connected-outbound", "injection sends data out; it does not bring any back");
  assert.equal(posthog.readsBack, false, "no server-side PostHog sync exists yet");
  assert.equal(posthog.feeds, null);
  assert.equal(posthog.injectedSites, 3, "it is genuinely on every site — that half is real");
});

test("Search Console counts as reading back only once a sync has actually run", async () => {
  const { shapeMarketingSources } = await spineModule();
  const [never] = shapeMarketingSources([
    { kind: "gsc-verification", label: "Google Search Console", injectedSites: 2, totalSites: 3, lastSyncAt: null },
  ]);
  assert.equal(never.readsBack, true, "a read-back path exists for Search Console");
  assert.equal(never.state, "connected-outbound", "but a path that never ran has delivered nothing");
  assert.equal(never.lastSyncAt, null);

  const [synced] = shapeMarketingSources([
    { kind: "gsc-verification", label: "Google Search Console", injectedSites: 2, totalSites: 3, lastSyncAt: NOW - DAY },
  ]);
  assert.equal(synced.state, "reading");
  assert.equal(synced.feeds, "Radar search-visibility", "it names what it actually feeds");
  assert.equal(synced.lastSyncAt, NOW - DAY);
});

test("providers are ranked by what they actually give marketing", async () => {
  const { shapeMarketingSources } = await spineModule();
  const ranked = shapeMarketingSources([
    { kind: "meta-pixel", label: "Meta Pixel", injectedSites: 0, totalSites: 3 },
    { kind: "posthog", label: "PostHog", injectedSites: 2, totalSites: 3 },
    { kind: "gsc-verification", label: "Google Search Console", injectedSites: 1, totalSites: 3, lastSyncAt: NOW },
  ]);
  assert.deepEqual(ranked.map(source => source.kind), ["gsc-verification", "posthog", "meta-pixel"], "reading back first, then sending, then absent");
});

test("the radar view tells the truth about what marketing cannot see", async () => {
  const surfaces = readFileSync(new URL("../src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx", import.meta.url), "utf8");
  assert.match(surfaces, /<MarketingSourceRoster sources=\{spine\.sources\}/, "the roster is surfaced on the marketing radar");
  assert.match(surfaces, /Sending only/, "a tool that only receives data is labelled as such");
  assert.match(surfaces, /no way to read its data back yet/, "the missing half is stated plainly, not implied");

  const spine = readFileSync(new URL("../src/lib/server/marketingIntelligence.ts", import.meta.url), "utf8");
  assert.match(spine, /READ_BACK_PROVIDERS/, "read-back is a declared list, so adding PostHog is a one-line change");
  assert.ok(!/addInjection|updateInjection|removeInjection/.test(spine), "marketing reads the aqua-tag store, it never writes to it");
});

// ── Brand scoping via the tag routing registry (a lookup, not a guess) ───────

const HOSTED_ENQUIRIES = [
  { submittedAt: NOW - DAY, source: "google-ads", siteHost: "aquaoasis.co.uk" },
  { submittedAt: NOW - 2 * DAY, source: "referral", siteHost: "www.aquaoasis.co.uk" },
  { submittedAt: NOW - 3 * DAY, source: "newsletter", siteHost: "milesy.media" },
  { submittedAt: NOW - 4 * DAY, source: "organic", siteHost: "some-unregistered-site.com" },
  { submittedAt: NOW - 5 * DAY, source: "organic" },
];

test("brand scoping follows the routing registry, not a slug guess", async () => {
  const { shapeMarketingEnquiries } = await spineModule();
  const feed = shapeMarketingEnquiries(HOSTED_ENQUIRIES, NOW, {
    companyId: "company_aqua",
    hosts: ["aquaoasis.co.uk"],
  });

  assert.equal(feed.scopedToCompanyId, "company_aqua");
  assert.equal(feed.total, 2, "both aquaoasis enquiries count — www. is the same host");
  assert.ok(!feed.bySource.some(row => row.key === "newsletter"), "another company's site is excluded");
});

test("an enquiry from an unregistered site is reported, never silently dropped", async () => {
  const { shapeMarketingEnquiries } = await spineModule();
  const feed = shapeMarketingEnquiries(HOSTED_ENQUIRIES, NOW, { companyId: "company_aqua", hosts: ["aquaoasis.co.uk"] });
  // The unregistered host and the host-less enquiry can't be placed under any brand.
  assert.equal(feed.unroutedEnquiries, 1, "an enquiry with no host at all cannot be placed");
  assert.equal(feed.total + feed.unroutedEnquiries < HOSTED_ENQUIRIES.length, true, "a rival brand's enquiries are excluded, not counted as unrouted");
});

test("with no brand selected nothing is narrowed and nothing is unroutable", async () => {
  const { shapeMarketingEnquiries } = await spineModule();
  const feed = shapeMarketingEnquiries(HOSTED_ENQUIRIES, NOW, null);
  assert.equal(feed.scopedToCompanyId, null);
  assert.equal(feed.total, HOSTED_ENQUIRIES.length, "agency-wide keeps every enquiry");
  assert.equal(feed.unroutedEnquiries, 0, "nothing needs routing when nothing is being narrowed");
});

test("a brand with no registered sites reports zero rather than the whole agency", async () => {
  const { shapeMarketingEnquiries } = await spineModule();
  const feed = shapeMarketingEnquiries(HOSTED_ENQUIRIES, NOW, { companyId: "company_new", hosts: [] });
  assert.equal(feed.total, 0, "no registered site means no enquiries can belong to it");
  assert.equal(feed.scopedToCompanyId, "company_new", "and the scope is still stated, so the zero is explicable");
});

test("the workspace scopes enquiries by brand but never implies scoped traffic", async () => {
  const page = readFileSync(new URL("../src/app/portal/agency/marketing/page.tsx", import.meta.url), "utf8");
  assert.match(page, /companyId: selectedCompanyId/, "the selected brand reaches the spine");
  assert.match(page, /traffic and conversions stay agency-wide/i, "the panel says which half is not scoped");

  const spine = readFileSync(new URL("../src/lib/server/marketingIntelligence.ts", import.meta.url), "utf8");
  assert.match(spine, /destinationCompanyId === companyId/, "scoping reads the routing registry");
  assert.ok(!/brandSlug|tradingBrandDefinition/.test(spine), "brand slugs are a different id space and must not be matched on");
});

// ── The fabricated-zero bug, found by running the real thing ─────────────────

test("a zero from a learning or blind check is not a reading — it is no data", async () => {
  // Caught in runtime verification: on an agency with no monitored properties the
  // Radar still emits value 0 with status "learning" for traffic/forms/conversions.
  // Reporting that as measured would have shown "0 pageviews" — indistinguishable
  // from a tracked site that nobody visited.
  const spine = await shape({
    checks: [
      check("traffic-7d", { status: "learning", value: 0 }),
      check("form-submissions", { status: "blind", value: 0 }),
      check("conversions", { status: "inactive", value: 0 }),
      check("traffic-24h", { status: "pass", value: 0 }),
    ],
  });

  const traffic7d = spine.measures.find(measure => measure.id === "traffic-7d");
  assert.equal(traffic7d?.measured, false, "learning means not enough evidence — its zero is not a measurement");
  assert.equal(traffic7d?.value, null, "so the UI shows a dash, not 0");
  assert.equal(spine.measures.find(measure => measure.id === "form-submissions")?.value, null, "a blind check has no data source at all");
  assert.equal(spine.measures.find(measure => measure.id === "conversions")?.value, null, "an inactive check does not apply");

  const traffic24h = spine.measures.find(measure => measure.id === "traffic-24h");
  assert.equal(traffic24h?.measured, true, "a genuine passing check that measured zero IS a reading");
  assert.equal(traffic24h?.value, 0, "a real, assessed zero must still show as 0 — nobody visited is a fact");
});

test("an unmonitored agency's funnel refuses to claim nobody visited", async () => {
  const { shapeMarketingFunnel } = await spineModule();
  const spine = await shape({ checks: [check("traffic-7d", { status: "learning", value: 0 }), check("form-submissions", { status: "learning", value: 0 })] });
  const trafficMeasured = spine.measures.find(measure => measure.id === "traffic-7d")?.measured ?? false;
  const formsMeasured = spine.measures.find(measure => measure.id === "form-submissions")?.measured ?? false;
  const funnel = shapeMarketingFunnel(
    { pageviews: 0, forms: 0, leads: 4, contacted: 2, meetings: 1, proposals: 1, won: 1, activeClients: 1, churnedClients: 0 },
    { trafficMeasured, formsMeasured },
  );
  assert.equal(funnel[0].value, null, "the top of the funnel is unknown, not zero");
  assert.equal(funnel[2].conversionPercent, null, "leads cannot convert from an unknown form count");
  assert.equal(funnel[3].value, 2, "the CRM half is still real");
});

test("a KPI that arrives pre-collapsed to zero is not presented as a reading", async () => {
  // The second path to the same lie: `commandIntelligence` writes
  // `checkValue(...) ?? 0`, so a KPI from an unmonitored agency reaches the
  // registry carrying 0 with status "learning" — the spine's own guard cannot
  // see it, because by then the null is gone.
  const { shapeMarketingPulse } = await spineModule();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pulse = shapeMarketingPulse([
    descriptor("traffic-7d", { value: 0, display: "0", status: "learning" }),
    descriptor("active-campaigns", { value: 0, display: "0", status: "blind" }),
    descriptor("forms-7d", { value: 12, display: "12", status: "healthy" }),
    descriptor("website-conversion", { value: 0, display: "0%", status: "warning" }),
  ] as any);

  const [traffic, campaigns, forms, conversion] = pulse;
  assert.equal(traffic.measured, false, "\"learning\" means the number is not evidence");
  assert.equal(campaigns.measured, false, "\"blind\" means nothing is connected to measure it");
  assert.equal(forms.measured, true, "an assessed KPI carries a real reading");
  assert.equal(conversion.measured, true, "an assessed zero is a fact — 0% conversion is real news");
  assert.equal(conversion.value, 0, "and it keeps its zero");
});

test("the pulse card renders a dash, not the collapsed zero, when unmeasured", async () => {
  const surfaces = readFileSync(new URL("../src/app/portal/agency/marketing/_MarketingCommandSurfaces.tsx", import.meta.url), "utf8");
  assert.match(surfaces, /metric\.measured \? metric\.display : DASH/, "an unmeasured KPI shows a dash");
  assert.match(surfaces, /Nothing is connected to measure this yet/, "blind is explained in plain words");
  assert.match(surfaces, /metric\.measured && metric\.onTrack === false/, "an unmeasured KPI is not counted as behind target");
});

// ── Channel consolidation (Ed's call: merge the five channel tabs) ───────────

test("every pre-consolidation channel link still resolves", async () => {
  const { resolveMarketingView } = await import("../src/app/portal/agency/marketing/_marketingViews");
  // The five tabs that were removed from the main bar. A bookmark must not
  // silently fall back to the overview — it opens Channels on that channel.
  for (const channel of ["social", "website", "google-ads", "google-business", "reputation"] as const) {
    const resolved = resolveMarketingView(channel, undefined);
    assert.equal(resolved.view, "channels", `?view=${channel} must open the Channels view`);
    assert.equal(resolved.channel, channel, `?view=${channel} must select that channel`);
  }
});

test("the new channel form routes, and a junk channel degrades to the first one", async () => {
  const { resolveMarketingView } = await import("../src/app/portal/agency/marketing/_marketingViews");
  assert.deepEqual(resolveMarketingView("channels", "google-ads"), { view: "channels", channel: "google-ads", section: null });
  assert.deepEqual(resolveMarketingView("channels", "not-a-channel"), { view: "channels", channel: "social", section: null });
  assert.deepEqual(resolveMarketingView("channels", undefined), { view: "channels", channel: "social", section: null });
});

test("a non-channel view is unaffected by the consolidation", async () => {
  const { resolveMarketingView } = await import("../src/app/portal/agency/marketing/_marketingViews");
  assert.equal(resolveMarketingView("pulse", undefined).view, "pulse");
  // P6 moved radar inside Pulse; the point still holds — a channel param does not hijack it.
  assert.equal(resolveMarketingView("radar", "social").view, "pulse", "a stray channel param does not hijack another view");
  assert.equal(resolveMarketingView("radar", "social").section, "radar", "and it still opens on radar");
  assert.equal(resolveMarketingView(undefined, undefined).view, "pulse");
  assert.equal(resolveMarketingView("nonsense", undefined).view, "pulse");
});

test("the tab bar carries one Channels tab, not five channel tabs", async () => {
  const page = readFileSync(new URL("../src/app/portal/agency/marketing/page.tsx", import.meta.url), "utf8");
  const tabs = [...page.matchAll(/<MarketingTab href=\{marketingHref\("([a-z-]+)"/g)].map(match => match[1]);
  assert.ok(tabs.includes("channels"), "there is a Channels tab");
  for (const gone of ["social", "website", "google-ads", "google-business", "reputation"]) {
    assert.ok(!tabs.includes(gone), `${gone} is no longer a top-level tab`);
  }
  assert.equal(tabs.length, 5, `P6 cut the bar to five tabs, found ${tabs.length}: ${tabs.join(", ")}`);
  assert.match(page, /<MarketingChannelNavigation/, "the channels are an in-view switcher");
});
