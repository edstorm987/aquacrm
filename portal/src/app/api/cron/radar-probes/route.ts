import { NextResponse, type NextRequest } from "next/server";

import { runRadarInfraSweep, runRadarProbeRefresh, type RadarProbeRefreshResult } from "@/lib/server/radarSweeps";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listAgencies } from "@/server/tenants";

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
  await ensureHydrated({ fresh: true });

  // Infra is app-wide — probe the database once per tick, not per agency.
  let infra: string;
  try {
    infra = (await runRadarInfraSweep()).primary.status;
  } catch (error) {
    infra = error instanceof Error ? `error:${error.message}` : "error";
  }

  const probes: RadarProbeRefreshResult[] = [];
  for (const agency of listAgencies().filter(item => item.status === "active")) {
    probes.push(await runRadarProbeRefresh(agency.id));
  }

  await flushPendingWrites();
  return NextResponse.json({ ok: true, infra, probes });
}
