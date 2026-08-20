/**
 * Every declared alert family, exercised — not just the ones that happen to
 * fire on today's data.
 *
 * The live audit only proves what the current records raise. A family that
 * never fires here can still be broken: no focus, no clearance, no evidence,
 * a Resolve button pointing nowhere. This walks the whole catalogue and asks
 * the same questions of each.
 *
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/audit-alert-families.ts
 *
 * Read-only. Synthesises alert ids from the declared prefixes; writes nothing.
 */
import { readFileSync } from "node:fs";

async function main() {
  process.env.PORTAL_BACKEND = process.env.PORTAL_BACKEND ?? "file";

  const source = readFileSync("src/lib/inbox/resolutionExplain.ts", "utf-8");
  const declared = [...source.matchAll(/\[\s*"([^"]+)"\s*,\s*\{[^}]*kind:\s*"([a-z-]+)"/g)]
    .map(([, prefix, kind]) => ({ prefix, kind }));
  // Radar families are classified by the fallback, not the table.
  const families = [
    ...declared,
    { prefix: "recommended-radar:incident:", kind: "judgement" },
    { prefix: "incident:", kind: "judgement" },
    { prefix: "radar:", kind: "judgement" },
  ];

  const { ensureHydrated, getState } = await import("../src/server/storage");
  await ensureHydrated();
  const state = getState() as Record<string, Record<string, { id?: string }>>;
  const agencyId = Object.values(state.agencies ?? {})[0]?.id ?? "";

  const { clearanceFor, resolutionKindOf } = await import("../src/lib/inbox/resolutionExplain");
  const { inferResolutionFocus } = await import("../src/lib/inbox/resolutionFocus");
  const { resolutionPlanFor, resolutionEvidenceFor } = await import("../src/lib/server/resolutionPlans");
  const { stepsFor } = await import("../src/lib/inbox/evidenceSteps");

  const rows: Record<string, string | number>[] = [];
  for (const family of families) {
    // A synthetic id in the family's shape. Records will not exist, which is
    // the point: this measures what the operator is told when the underlying
    // row is missing or unreadable, the case that produces empty panels.
    const alertId = `${family.prefix}synthetic_probe`;
    const clearance = clearanceFor(alertId);
    const focus = inferResolutionFocus(alertId);
    const plan = await resolutionPlanFor(agencyId, alertId).catch(() => null);
    const evidence = await resolutionEvidenceFor(agencyId, alertId).catch(() => null);
    const steps = stepsFor(alertId, {});
    rows.push({
      family: family.prefix,
      kind: clearance.kind,
      focus: focus ?? "NONE",
      clears: clearance.clearsWhen ? "y" : "—",
      plan: plan?.steps.length ?? 0,
      evidence: evidence ? (evidence.unavailable ? "unavailable" : `${evidence.records.length} rec`) : "NONE",
      told: steps.length ? `${steps.length} steps` : "NOTHING",
    });
  }
  console.table(rows);

  const noFocus = rows.filter(row => row.focus === "NONE");
  const noSteps = rows.filter(row => row.told === "NOTHING");
  const inAppNoClear = rows.filter(row => row.kind === "in-app" && row.clears === "—");
  console.log(`\nfamilies swept       : ${rows.length}`);
  console.log(`no focus             : ${noFocus.length}${noFocus.length ? ` → ${noFocus.map(r => r.family).join(", ")}` : ""}`);
  console.log(`nothing to do        : ${noSteps.length}${noSteps.length ? ` → ${noSteps.map(r => r.family).join(", ")}` : ""}`);
  console.log(`in-app, no clearance : ${inAppNoClear.length}${inAppNoClear.length ? ` → ${inAppNoClear.map(r => r.family).join(", ")}` : ""}`);
  void resolutionKindOf;
}

void main();
