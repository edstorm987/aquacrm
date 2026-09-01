import { NextResponse, type NextRequest } from "next/server";

import { processInboxWebhookQueue } from "@/lib/server/inbox/inboxService";
import { pruneProcessedInboxWebhookEvents } from "@/lib/server/inbox/inboxStore";
import { runRadarInfraSweep, runRadarScheduledSweep, type RadarScheduledSweepResult } from "@/engines/data/server/radar/radarSweeps";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listAgencies } from "@/server/tenants";
import { processPrivateObjectLifecycleSweep } from "@/lib/server/privateObjectLifecycle";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization");
  if (!secret) return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  if (supplied !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensureHydrated({ fresh: true });
  const [queue, pruned] = await Promise.all([
    processInboxWebhookQueue(100),
    pruneProcessedInboxWebhookEvents(Number(process.env.INBOX_WEBHOOK_RETENTION_DAYS || 30)),
  ]);
  // Infra is app-wide — probe the database ONCE per tick, not once per agency,
  // and in its own try/catch (same shape as cron/radar-probes). It used to run
  // inside runRadarScheduledSweep, so N agencies meant N identical DB round-trips
  // and, worse, one transient probe failure aborted every tenant's sweep before
  // the evidence rollup — losing a day of evidence with no retry. → issues #131.
  let radarInfra: string;
  try {
    radarInfra = (await runRadarInfraSweep()).primary.status;
  } catch (error) {
    radarInfra = error instanceof Error ? `error:${error.message}` : "error";
  }
  const radarSweeps: RadarScheduledSweepResult[] = [];
  for (const agency of listAgencies().filter(item => item.status === "active")) {
    radarSweeps.push(await runRadarScheduledSweep(agency.id));
  }
  // The lifecycle coordinator rehydrates under its cross-process lock. Flush
  // this tick's queue/radar work first so that fresh read cannot replace it.
  await flushPendingWrites();
  const privateUploads = await processPrivateObjectLifecycleSweep();
  await flushPendingWrites();
  return NextResponse.json({ ok: true, ...queue, pruned, radarInfra, radarSweeps, privateUploads });
}
