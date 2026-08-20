import { NextResponse, type NextRequest } from "next/server";

import { processInboxWebhookQueue } from "@/lib/server/inboxService";
import { pruneProcessedInboxWebhookEvents } from "@/lib/server/inboxStore";
import { runRadarScheduledSweep, type RadarScheduledSweepResult } from "@/lib/server/radarSweeps";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listAgencies } from "@/server/tenants";

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
  const radarSweeps: RadarScheduledSweepResult[] = [];
  for (const agency of listAgencies().filter(item => item.status === "active")) {
    radarSweeps.push(await runRadarScheduledSweep(agency.id));
  }
  await flushPendingWrites();
  return NextResponse.json({ ok: true, ...queue, pruned, radarSweeps });
}
