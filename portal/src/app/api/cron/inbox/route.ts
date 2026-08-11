import { NextResponse, type NextRequest } from "next/server";

import { processInboxWebhookQueue } from "@/lib/server/inboxService";
import { pruneProcessedInboxWebhookEvents } from "@/lib/server/inboxStore";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/lib/server/businessIssueRadar";
import { recordRadarSweep } from "@/lib/server/radarMemory";
import { runAgencySyntheticProbes } from "@/lib/server/radarSyntheticProbes";
import { recordRadarEvidence } from "@/lib/server/radarEvidenceVault";
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
  const radarSweeps: Array<{ agencyId: string; ok: boolean; checks?: number; blind?: number; error?: string }> = [];
  for (const agency of listAgencies().filter(item => item.status === "active")) {
    try {
      await runAgencySyntheticProbes(agency.id);
      const radar = await buildBusinessIssueRadar(agency.id);
      recordRadarSweep(agency.id, radar);
      recordRadarEvidence(agency.id, radar);
      invalidateBusinessIssueRadarCache(agency.id);
      radarSweeps.push({ agencyId: agency.id, ok: true, checks: radar.summary.totalChecks, blind: radar.summary.blindChecks });
    } catch (error) {
      radarSweeps.push({ agencyId: agency.id, ok: false, error: error instanceof Error ? error.message : "radar_sweep_failed" });
    }
  }
  await flushPendingWrites();
  return NextResponse.json({ ok: true, ...queue, pruned, radarSweeps });
}
