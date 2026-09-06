import { NextResponse, type NextRequest } from "next/server";

import { runScheduledProbeSweep } from "@/engines/data/server/radar/radarSweeps";

export const runtime = "nodejs";

// Dedicated probe cadence (radar upgrade — see radar-update-notes.md concern #1).
//
// Runs ONLY the expensive `probe`-tier sweeps — Deep (synthetic canaries, per
// agency) and Infra (DB/storage, once, app-wide) — at a short interval, so the
// cheap Pulse always reads fresh probe results. This is separate from the daily
// `cron/inbox` job, which does the full rebuild + evidence rollup. Neither
// rebuilds the Pulse here: the probes just refresh their state and invalidate
// the cache, and the next page load renders instantly from what they wrote.

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization");
  if (!secret) return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  if (supplied !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // The whole tick is `runScheduledProbeSweep`, shared verbatim with the
  // persistent-instance self-scheduler (issues #170) so an external cron and an
  // in-process interval do identical work.
  const result = await runScheduledProbeSweep();
  return NextResponse.json(result);
}
