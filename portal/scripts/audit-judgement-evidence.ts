/**
 * The judgement path, exercised against real Radar data.
 *
 * Radar alerts are the ones nothing can resolve: no button returns a metric to
 * its median. Their whole value is the evidence — the figure that moved, its
 * history, and a plain-English reading of whether the movement means anything.
 * This checks that is what actually comes back, rather than a statistical
 * sentence with no numbers behind it.
 *
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/audit-judgement-evidence.ts
 *
 * Read-only.
 */
async function main() {
  process.env.PORTAL_BACKEND = process.env.PORTAL_BACKEND ?? "file";

  const { ensureHydrated, getState } = await import("../src/server/storage");
  await ensureHydrated();
  const state = getState() as Record<string, Record<string, { id?: string }>>;
  const agencyId = Object.values(state.agencies ?? {})[0]?.id ?? "";

  const { getCachedBusinessIssueRadar } = await import("../src/lib/server/businessIssueRadar");
  const { radarEvidenceFor } = await import("../src/lib/server/resolutionPlans");
  const { plainMeaningFor, clearanceFor } = await import("../src/lib/inbox/resolutionExplain");

  const radar = await getCachedBusinessIssueRadar(agencyId);
  const issues = [...(radar.issues ?? []), ...(radar.incidents ?? [])] as Array<Record<string, string>>;
  console.log(`radar issues: ${issues.length}\n`);

  const rows: Record<string, string | number>[] = [];
  for (const issue of issues.slice(0, 25)) {
    const alertId = `recommended-radar:${issue.id}`;
    const evidence = await radarEvidenceFor(agencyId, alertId).catch(error => {
      console.log(`  ${alertId} threw: ${error instanceof Error ? error.message : error}`);
      return null;
    });
    const record = evidence?.records?.[0];
    const plain = plainMeaningFor(issue.title ?? "", issue.detail ?? "", issue.evidence ?? "");
    rows.push({
      issue: (issue.title ?? issue.id ?? "?").slice(0, 40),
      kind: clearanceFor(alertId).kind,
      evidence: evidence ? (evidence.unavailable ? "unavailable" : `${evidence.records.length} rec`) : "NONE",
      series: record?.series ? `${record.series.points.length} pts` : "NONE",
      median: record?.series?.median ?? "—",
      figures: record?.fields?.length ?? 0,
      plain: plain.plainMeaning ? "y" : "—",
      warns: plain.caution ? "y" : "—",
    });
  }
  console.table(rows);

  const noSeries = rows.filter(row => row.series === "NONE");
  const noPlain = rows.filter(row => row.plain === "—");
  console.log(`\nissues checked   : ${rows.length}`);
  console.log(`no graph         : ${noSeries.length}${noSeries.length ? ` → ${noSeries.map(r => r.issue).join(" | ")}` : ""}`);
  console.log(`no plain reading : ${noPlain.length}${noPlain.length ? ` → ${noPlain.map(r => r.issue).join(" | ")}` : ""}`);
}

void main();
