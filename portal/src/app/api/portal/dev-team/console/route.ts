import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { ACTIVE_WORKER_WINDOW_MS, devConsoleCore, devConsoleStatus } from "@/lib/server/devConsoleStatus";
import { readCheckIns, isCheckInActive } from "@/lib/server/devTeamWorkers";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Live status for the topbar Dev Console popover.
//
// Fetched only when the console is actually opened — which is the whole reason
// this is a route rather than a render-path read: reading worker activity walks
// the working tree, and the console's icon is on every page.
//
// Two parts, because they cost wildly different amounts:
//   ?part=core  — findings + blockers. Tens of milliseconds; paints the popover
//                 on the first frame.
//   (default)   — that plus live worker activity. Seconds when cold, so the
//                 panel asks for it alongside core and fills the rows in when
//                 it lands rather than making the whole console wait.
//
// Same founder + Dev Mode gate as every other Dev Console surface, re-asserted
// here rather than trusted from the caller (the layout deciding not to render
// the icon is a UI choice, not a security boundary).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    let session;
    try {
      session = await requireRole([...AGENCY_ROLES]);
    } catch {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    // Not "forbidden" — outside Dev Mode this surface does not exist at all.
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const core = request.nextUrl.searchParams.get("part") === "core";
    if (core) {
      return NextResponse.json({ ok: true, part: "core", status: await devConsoleCore() }, {
        headers: { "cache-control": "no-store" },
      });
    }

    const status = await devConsoleStatus();
    return NextResponse.json(
      { ok: true, part: "full", status: { ...status, activeWorkers: await activeWorkerCount(status) } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the Dev Console status." }, { status: 500 });
  }
}

/**
 * How many workers are ACTUALLY inside the active window — uncapped.
 *
 * `devConsoleStatus().workers` is sliced to five so the popover stays a glance,
 * and the panel used to print that sliced length as "Working now". With six
 * workers checked in, the topbar said 5 while the Command Centre station said 6
 * and listed the one the console had silently dropped. Two surfaces quoting
 * different numbers at each other is the exact failure the station was built to
 * avoid, so the true total travels alongside the capped list.
 *
 * Counted from `readCheckIns()` — the same cheap reader the station uses (a
 * handful of small JSON files, not the working-tree walk) — against the SAME
 * cutoff the cached scan used, so the count and the list describe one moment.
 * Never below the list length: the list is evidence, and a "N more" link must
 * not go negative if the two reads land either side of a new check-in.
 */
async function activeWorkerCount(status: { workers: unknown[]; scannedAtMs: number }): Promise<number> {
  try {
    // Same predicate as everywhere else — the window alone counts signed-off
    // workers as live. `scannedAtMs` keeps the count and the list describing one
    // moment, which is why the time is passed in rather than read again.
    const active = (await readCheckIns())
      .filter(checkIn => isCheckInActive(checkIn, status.scannedAtMs)).length;
    return Math.max(active, status.workers.length);
  } catch {
    // The count is a nicety; the list is the point. Never fail the read for it.
    return status.workers.length;
  }
}
