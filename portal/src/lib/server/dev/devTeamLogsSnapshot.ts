import "server-only";

import type {
  ActiveFile,
  AreaActivity,
  WorkerCheckIn,
} from "@/lib/server/dev/devTeamWorkers";
import type { DocEdit } from "@/lib/server/dev/devDocEdits";

export interface DevTeamLogsSnapshot {
  checkIns: WorkerCheckIn[];
  activity: AreaActivity[];
  edits: DocEdit[];
  recentFiles: ActiveFile[];
  changeCount: number;
  scannedAtMs: number;
}

/**
 * Keep the RSC payload bounded while retaining the exact activity count. Logs
 * renders ten area summaries and 25 raw files, so carrying every changed path
 * (often thousands after a generated-doc refresh) into the view is wasted
 * serialization and memory.
 */
export function composeDevTeamLogsSnapshot(input: {
  checkIns: WorkerCheckIn[];
  recentFiles: ActiveFile[];
  edits: DocEdit[];
  scannedAtMs: number;
  groupedActivity: AreaActivity[];
}): DevTeamLogsSnapshot {
  return {
    checkIns: input.checkIns,
    activity: input.groupedActivity.slice(0, 10),
    edits: input.edits.slice(0, 20),
    recentFiles: input.recentFiles.slice(0, 25),
    changeCount: input.recentFiles.length,
    scannedAtMs: input.scannedAtMs,
  };
}

export async function readDevTeamLogsSnapshot(): Promise<DevTeamLogsSnapshot> {
  const [workerReader, editReader] = await Promise.all([
    import("@/lib/server/dev/devTeamWorkers"),
    import("@/lib/server/dev/devDocEdits"),
  ]);
  const [fileActivity, checkIns, edits] = await Promise.all([
    workerReader.scanRecentWorkerFiles(),
    workerReader.readCheckIns(),
    editReader.recentDocEdits(20),
  ]);
  return composeDevTeamLogsSnapshot({
    checkIns,
    recentFiles: fileActivity.recentFiles,
    edits,
    scannedAtMs: fileActivity.scannedAtMs,
    groupedActivity: workerReader.groupActivity(fileActivity.recentFiles),
  });
}
