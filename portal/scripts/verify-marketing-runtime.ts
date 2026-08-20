/**
 * Runtime verification harness — the marketing data spine, actually run.
 *
 * The smoke suite proves the *shaping* logic; it does not prove the spine can be
 * built at all, because every test there feeds it synthetic checks. This drives
 * the real path end to end in-process: a fresh agency, a real Radar build, a
 * real command-intelligence snapshot, the real aqua-tag registry and injection
 * reads — the things that would throw on a page render but pass a static test.
 *
 * Read-only diagnostic, like the `audit-*` scripts — not a pass/fail suite test,
 * because it calls `ensureHydrated({ fresh: true })` and the suite runs files
 * concurrently in one process (a state wipe there would pollute other files).
 *
 *   PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' \
 *     npx tsx scripts/verify-marketing-runtime.ts
 */

import * as storage from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createTradingCompany } from "../src/server/tradingCompanies";
import { addWebsiteSource } from "../src/server/websiteSources";
import { addInjection } from "../src/server/websiteInjections";
import {
  attributeEnquiriesToCampaigns,
  marketingCommandModel,
  marketingDataSpine,
} from "../src/lib/server/marketingIntelligence";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const DAY = 86_400_000;

const checks: Array<{ ok: boolean; label: string; detail: string }> = [];
function check(ok: boolean, label: string, detail = "") {
  checks.push({ ok, label, detail });
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\nMarketing data spine — runtime verification\n");

  await storage.ensureHydrated({ fresh: true });
  const agency = createAgency({ name: "Marketing Runtime Co", ownerEmail: "owner@example.com" });
  const company = createTradingCompany(agency.id, { name: "Aqua Oasis" }, "user_runtime");

  // A tagged site routed to that trading company, plus one routed nowhere.
  const routed = addWebsiteSource({ agencyId: agency.id, host: "aquaoasis.co.uk", label: "Aqua Oasis", destinationCompanyId: company.id, createdBy: "user_runtime" });
  addWebsiteSource({ agencyId: agency.id, host: "milesy.media", label: "Milesy", createdBy: "user_runtime" });
  addInjection({ agencyId: agency.id, websiteSourceId: routed.id, kind: "posthog", value: "phc_abcdefghijklmnop" });
  addInjection({ agencyId: agency.id, websiteSourceId: routed.id, kind: "gsc-verification", value: "verify-token-abcdefghij" });

  const enquiries = [
    { submittedAt: NOW - DAY, source: "google-ads", campaign: "spring-offer", siteHost: "aquaoasis.co.uk", brand: "aquaoasis-web", brandName: "Aqua Oasis" },
    { submittedAt: NOW - 2 * DAY, source: "website:aquaoasis-web", siteHost: "www.aquaoasis.co.uk", brand: "aquaoasis-web", brandName: "Aqua Oasis" },
    { submittedAt: NOW - 3 * DAY, source: "newsletter", siteHost: "milesy.media", brand: "milesymedia", brandName: "Milesy Media" },
  ];

  // ── 1. The spine actually builds against a real radar ──────────────────────
  console.log("1. Spine builds against a real Radar");
  const spine = await marketingDataSpine(agency.id, { enquiries, now: NOW });
  check(spine.available, "the Radar built and the marketing domain was found", `${spine.measures.length} families`);
  check(spine.measures.length === 12, "all 12 marketing families are registered");
  check(spine.health !== null, "a domain summary came back", spine.health ? `coverage ${spine.health.coveragePercent}%` : "none");
  check(
    spine.measures.every(measure => measure.value !== null || measure.status !== "pass"),
    "no family reports a passing value it never measured",
  );
  const unmeasured = spine.measures.filter(measure => !measure.measured);
  check(
    unmeasured.every(measure => measure.value === null),
    "every unmeasured family carries null, not a fabricated zero",
    `${unmeasured.length} unmeasured`,
  );

  // ── 2. The tag registry + injections are read for real ─────────────────────
  console.log("\n2. Aqua Tag registry read");
  check(spine.tag.registeredSources === 2, "both registered sites are counted", `${spine.tag.registeredSources}`);
  check(spine.tag.routedSources === 1, "only the routed site counts as routed");
  const posthog = spine.sources.find(source => source.kind === "posthog");
  const gsc = spine.sources.find(source => source.kind === "gsc-verification");
  check(posthog?.injectedSites === 1, "PostHog is seen on the site it was injected on");
  check(posthog?.state === "connected-outbound", "PostHog is reported as sending-only", "no read-back exists yet");
  check(gsc?.state === "connected-outbound", "Search Console is sending-only until a sync has run", `lastSyncAt ${gsc?.lastSyncAt ?? "none"}`);
  check(
    spine.sources.filter(source => source.state === "not-connected").length === 5,
    "the five uninjected providers are reported as absent",
  );

  // ── 3. Enquiries, agency-wide and brand-scoped ─────────────────────────────
  console.log("\n3. Enquiries");
  check(spine.enquiries.available && spine.enquiries.total === 3, "all three enquiries are read agency-wide");
  check(spine.enquiries.attributed === 2, "the website:<brand> fallback is not counted as attributed");

  const scoped = await marketingDataSpine(agency.id, { enquiries, companyId: company.id, now: NOW });
  check(scoped.enquiries.scopedToCompanyId === company.id, "the brand scope is stated");
  check(scoped.enquiries.total === 2, "only the two enquiries from the routed host survive scoping", `got ${scoped.enquiries.total}`);
  check(scoped.traffic.last7d === spine.traffic.last7d, "traffic is unchanged by a brand scope — it is agency-wide by design");

  // ── 4. The command model: KPI registry + lineage funnel ────────────────────
  console.log("\n4. Command model (KPI registry + lineage funnel)");
  const model = await marketingCommandModel(agency.id, { enquiries, now: NOW });
  check(model.available, "the command-intelligence snapshot built");
  check(model.pulse.length > 0, "the KPI registry returned marketing KPIs", `${model.pulse.length} KPIs`);
  check(
    model.pulse.every(metric => metric.id && metric.display),
    "every pulse metric carries the registry's own id and display string",
  );
  check(
    model.pulse.every(metric => metric.onTrack === null || typeof metric.onTrack === "boolean"),
    "on-track is a real verdict or an honest null",
  );
  // The second fabricated-zero path: KPIs arrive pre-collapsed (`?? 0`) from the
  // command-intelligence builder, so the spine's guard cannot see the missing null.
  const collapsed = model.pulse.filter(metric => !metric.measured && metric.value === 0);
  check(
    collapsed.every(metric => metric.status === "learning" || metric.status === "blind"),
    "every zero-valued KPI that is not a reading is flagged unmeasured",
    collapsed.length ? collapsed.map(metric => `${metric.id}(${metric.status})`).join(", ") : "none on this fixture",
  );
  check(
    model.pulse.filter(metric => metric.measured).every(metric => ["healthy", "warning", "critical"].includes(metric.status)),
    "only assessed KPIs are presented as measured",
  );
  check(model.funnel.length === 8, "the lineage funnel has all eight stages", `${model.funnel.map(stage => stage.id).join(" → ")}`);
  // The check that caught the fabricated-zero bug: an agency with no monitored
  // properties must NOT report "0 pageviews" — the Radar emits 0/"learning" there.
  const trafficMeasure = model.spine.measures.find(measure => measure.id === "traffic-7d");
  check(
    model.spine.tag.monitoredProperties > 0 || model.funnel[0].value === null,
    "with nothing monitored, the top of the funnel is unknown rather than zero",
    `properties ${model.spine.tag.monitoredProperties} · pageviews ${model.funnel[0].value ?? "—"} · traffic-7d status ${trafficMeasure?.status}`,
  );
  check(
    model.spine.measures.filter(measure => measure.measured).every(measure => ["pass", "critical", "warning", "watch"].includes(measure.status)),
    "every measured family was actually assessed — no learning/blind zero counts as a reading",
  );

  // ── 5. Campaign attribution over the real feed ─────────────────────────────
  console.log("\n5. Campaign attribution");
  const attribution = attributeEnquiriesToCampaigns(
    [{ id: "camp_1", name: "Spring promotion", sourceKey: "spring-offer" }],
    model.spine.enquiries,
  );
  check(attribution.available, "attribution ran over the real enquiry feed");
  const spring = attribution.campaigns.find(row => row.campaignId === "camp_1");
  check(spring?.confident === true && spring.enquiries === 1, "the source-key match is exact and counted", `${spring?.enquiries ?? 0} enquiries`);

  // ── 6. Honest degradation for an agency that does not exist ────────────────
  console.log("\n6. Degradation");
  const missing = await marketingDataSpine("agency_does_not_exist", { enquiries: null, now: NOW });
  check(missing.measures.length === 12, "an unknown agency still returns a complete, honest shape");
  check(missing.enquiries.available === false, "enquiries that were not read report unavailable");

  const failed = checks.filter(entry => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} runtime checks passed.`);
  if (failed.length) {
    console.log("\nFailed:");
    for (const entry of failed) console.log(`  ✗ ${entry.label}${entry.detail ? ` — ${entry.detail}` : ""}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("\nRuntime verification threw:", error);
  process.exitCode = 1;
});
