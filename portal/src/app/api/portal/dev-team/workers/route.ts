import { NextResponse } from "next/server";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import {
  ACTIVE_CHECK_IN_WINDOW_MS,
  groupActivity,
  isCheckInActive,
  scanWorkerSignals,
} from "@/lib/server/devTeamWorkers";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Live worker signals for the Dev Team board. Polled by the client panel, so
// it stays cheap: a bounded mtime scan plus a couple of small reads. Founder +
// Dev Mode only, same gate as the portal.
export const dynamic = "force-dynamic";

/** Nothing check-in-shaped is worth an unbounded response body. */
const MAX_CHECK_INS = 40;

export async function GET() {
  try {
    await ensureHydrated();

    let session;
    try {
      session = await requireRole([...AGENCY_ROLES]);
    } catch {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const signals = await scanWorkerSignals();
    // Counts and areas come from the WHOLE recent-file list. Only the rendered
    // slices below are truncated — truncating first is what made the panel
    // print "200 in 2h" when the real number was ten times that.
    const activity = groupActivity(signals.recentFiles);

    return NextResponse.json(
      {
        ok: true,
        // `active` is decided here, by the one staleness contract, so the panel
        // never has to re-derive "is this worker still working".
        checkIns: signals.checkIns.slice(0, MAX_CHECK_INS).map(checkIn => ({
          ...checkIn,
          active: isCheckInActive(checkIn, signals.scannedAtMs),
        })),
        activeCount: signals.activeCheckIns.length,
        activeWindowMs: ACTIVE_CHECK_IN_WINDOW_MS,
        sandboxes: signals.sandboxes,
        activity: activity.slice(0, 12),
        areaCount: activity.length,
        fileCount: signals.recentFiles.length,
        newestMs: signals.recentFiles[0]?.mtimeMs ?? 0,
        scannedAtMs: signals.scannedAtMs,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read worker signals.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
