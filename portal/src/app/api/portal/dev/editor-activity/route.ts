import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { readActiveCheckIns, scanWorkerSignals } from "@/lib/server/dev/devTeamWorkers";
import { ensureHydrated } from "@/server/storage";

// ─── DEV EDITOR — who else is in here ────────────────────────────────────────
//
// Ed: "say an AI employee or an actual employee is open on a file, I need this
// to show so we don't end up wrecking each other's work."
//
// This does NOT invent a presence system. The Dev Team already knows who is
// working — `readActiveCheckIns()` reads the check-in files agents write — and
// already knows which files just moved, because `scanWorkerSignals()` walks the
// tree for recent mtimes. Both are cached behind a TTL. All that was missing
// was showing it inside the editor.
//
// mtime is an honest signal precisely BECAUSE it does not care who did it: an
// agent, a human in another window, a script, or a git operation all show up.
// It answers "has this file moved under me?", which is the question that
// matters before you start typing in it.
//
// It is advisory, not a lock. A hard lock in a tool used by both people and
// agents strands files whenever something crashes mid-edit; the WRITE path is
// what actually protects the work, by refusing a save whose fingerprint has
// moved.

/** Anything older than this is not "someone is in here right now". */
const WINDOW_MS = 45 * 60 * 1000;

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required." }, { status: 403 });
    }

    const [signals, active] = await Promise.all([
      scanWorkerSignals(WINDOW_MS),
      readActiveCheckIns(),
    ]);

    return NextResponse.json({
      ok: true,
      // Path -> when it last moved. Capped: the editor only needs to mark what
      // is on screen, and the whole list can run to thousands after a big run.
      files: signals.recentFiles.slice(0, 800).map(file => ({ path: file.relPath, at: file.mtimeMs })),
      // Who is working right now, so the editor can say WHO rather than just
      // "something touched this".
      workers: active.map(item => ({ name: item.name, status: item.status, at: item.at })),
      scannedAt: signals.scannedAtMs,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
