import "server-only";

// The Dev Team landing page needs a small read model, not the complete objects
// produced by every workspace scanner. Keep that fan-out behind one module so
// the page's first server chunk does not eagerly compile the roadmap, findings,
// worker-walk and thoughts graphs. The page imports this module from inside a
// Suspense boundary; these imports then start together while the authenticated
// shell is already free to stream.

export interface DevTeamHomeBlocker {
  label: string;
  detail?: string;
}

export interface DevTeamHomeRoadmapItem {
  id: string;
  title: string;
  target?: string;
  dueInDays?: number;
}

export interface DevTeamHomeWorker {
  name: string;
  status: string;
  phase?: string;
}

export interface DevTeamHomeSnapshot {
  openBlockers: DevTeamHomeBlocker[];
  inFlight: DevTeamHomeRoadmapItem[];
  upcoming: DevTeamHomeRoadmapItem[];
  tasksDone: number;
  tasksTotal: number;
  openFindings: number;
  activeWorkers: DevTeamHomeWorker[];
  waitingThoughts: number;
}

interface SnapshotInputs {
  blockers: Array<{ label: string; detail?: string; resolved: boolean }>;
  roadmap: {
    byHorizon: { now: DevTeamHomeRoadmapItem[] };
    schedule: DevTeamHomeRoadmapItem[];
    items: Array<{ done: number; total: number }>;
  };
  findings: Array<{ status: string }>;
  activeCheckIns: Array<{ name: string; status: string; phase?: string }>;
  waiting: number;
}

/** Pure compaction seam: all of Home's displayed values come from this DTO. */
export function composeDevTeamHomeSnapshot(input: SnapshotInputs): DevTeamHomeSnapshot {
  const activeWorkers = input.activeCheckIns
    .filter(checkIn => !/^(done|complete|routed)/i.test(checkIn.phase ?? checkIn.status ?? ""))
    .map(checkIn => ({
      name: checkIn.name,
      status: checkIn.status,
      phase: checkIn.phase,
    }));

  return {
    openBlockers: input.blockers
      .filter(blocker => !blocker.resolved)
      .map(({ label, detail }) => ({ label, detail })),
    inFlight: input.roadmap.byHorizon.now.map(({ id, title }) => ({ id, title })),
    upcoming: input.roadmap.schedule.slice(0, 5).map(({ id, title, target, dueInDays }) => ({
      id,
      title,
      target,
      dueInDays,
    })),
    tasksDone: input.roadmap.items.reduce((total, item) => total + item.done, 0),
    tasksTotal: input.roadmap.items.reduce((total, item) => total + item.total, 0),
    openFindings: input.findings.filter(finding => finding.status === "open").length,
    activeWorkers,
    waitingThoughts: input.waiting,
  };
}

/**
 * One concurrent request-time fan-out. Existing readers keep their own exact
 * invalidation/TTL contracts; this layer deliberately adds no cross-request
 * cache, so a completed edit is visible on the same schedule as before.
 */
export async function readDevTeamHomeSnapshot(): Promise<DevTeamHomeSnapshot> {
  const [docs, roadmapReader, findingReader, workerReader, thoughtReader] = await Promise.all([
    import("@/lib/server/dev/devDocs"),
    import("@/lib/server/dev/devTeamRoadmap"),
    import("@/lib/server/dev/devTeamFindings"),
    import("@/lib/server/dev/devTeamWorkers"),
    import("@/lib/server/dev/devTeamThoughts"),
  ]);

  const [blockers, roadmap, findings, activeCheckIns, waiting] = await Promise.all([
    docs.scanBlockers(),
    roadmapReader.buildRoadmap(),
    findingReader.listFindings().catch(() => []),
    // Home only displays who is working. Reading the authoritative active
    // check-ins avoids the recursive src/scripts/docs activity walk used by
    // the detailed worker board, which used to hold every Home stream open for
    // roughly five seconds once its short cache expired.
    workerReader.readActiveCheckIns().catch(() => []),
    thoughtReader.unacknowledgedCount().catch(() => 0),
  ]);

  return composeDevTeamHomeSnapshot({ blockers, roadmap, findings, activeCheckIns, waiting });
}
