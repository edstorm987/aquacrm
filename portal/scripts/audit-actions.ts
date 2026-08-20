/**
 * What state Actions is actually in — measured, not remembered.
 *
 * For every alert the checks currently raise: is it classified, does it carry
 * a destination and a focus, does it have a resolution plan, and is its
 * evidence built from the real records or the generic fallback?
 *
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/audit-actions.ts
 *
 * Reads the local `.data` sandbox. Read-only — it raises alerts and asks for
 * their plans, it does not accept, resolve or write anything.
 */
async function main() {
  process.env.PORTAL_BACKEND = process.env.PORTAL_BACKEND ?? "file";

  const { ensureHydrated, getState } = await import("../src/server/storage");
  await ensureHydrated();

  const state = getState() as Record<string, Record<string, { id?: string; agencyId?: string }>>;
  const agencyId = Object.values(state.agencies ?? {})[0]?.id
    ?? Object.values(state.tenants ?? {})[0]?.id
    ?? "";
  console.log("agency:", agencyId, "| clients:", Object.keys(state.clients ?? {}).length);

  const { listOperationalAlerts } = await import("../src/lib/server/operationalAlerts");
  const { resolutionPlanFor, resolutionEvidenceFor } = await import("../src/lib/server/resolutionPlans");

  const alerts = await listOperationalAlerts(agencyId);
  console.log("alerts raised:", alerts.length, "\n");

  const rows: Record<string, string | number>[] = [];
  for (const alert of alerts) {
    const plan = await resolutionPlanFor(agencyId, alert.id);
    const evidence = await resolutionEvidenceFor(agencyId, alert.id);
    rows.push({
      id: alert.id.slice(0, 44),
      kind: alert.kind ?? "—",
      focus: alert.focus ?? "—",
      resolve: alert.href.includes("resolve=") ? "y" : "NO",
      clears: alert.clearsWhen ? "y" : "NO",
      steps: plan?.steps.length ?? 0,
      evidence: evidence ? (evidence.unavailable ? "unavailable" : `${evidence.records.length} rec`) : "NONE",
      evSteps: evidence?.steps?.length ?? 0,
    });
  }
  console.table(rows);

  const tally = (key: string) => rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key]);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nby kind           :", tally("kind"));
  console.log("plan step counts  :", tally("steps"));
  console.log("evidence          :", tally("evidence"));
  console.log("missing resolve=  :", rows.filter(row => row.resolve === "NO").length);
  console.log("missing clearsWhen:", rows.filter(row => row.clears === "NO").length);
  console.log("no focus          :", rows.filter(row => row.focus === "—").length);
  console.log("no evidence steps :", rows.filter(row => row.evSteps === 0).length);

  const tasks = Object.values(state.tasks ?? {}) as Array<{ agencyId: string; origin?: string; checklist?: unknown[] }>;
  const mine = tasks.filter(task => task.agencyId === agencyId);
  console.log("\ntasks:", mine.length, "| with a checklist:", mine.filter(task => task.checklist?.length).length);
  console.log("task origins      :", mine.reduce<Record<string, number>>((acc, task) => {
    const origin = task.origin ?? "manual";
    acc[origin] = (acc[origin] ?? 0) + 1;
    return acc;
  }, {}));
}

void main();
