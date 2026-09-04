// GET /api/internal/sweep — founder-gated diagnostic that prunes expired
// rate-limit + login-failure records and reports counts. R021 Goal D.
//
// Sessions are stateless HMAC tokens — they auto-expire on verify. There
// is no session-list to prune (chapter #68 honesty). The sweep covers the
// in-memory stores that DO accumulate: the rateLimit bucket map and the
// login-failure lockout map.
//
// `?outbox=purge-delivered` additionally drops every already-delivered outbox
// event in one coordinated write — a one-time cleanup for the historic
// `person.updated` flood that had grown to ~40% of the state blob (delivered
// events are retained receipts with no pending work).

import { NextRequest, NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireRole, authErrorResponse } from "@/lib/server/auth/auth";
import { sweepExpired } from "@/lib/server/rateLimit";
import { processAutomationSweep } from "@/server/automations";
import { processInboxWebhookQueue } from "@/lib/server/inbox/inboxService";
import { purgeDeliveredOutbox } from "@/server/outbox";

export async function GET(request: NextRequest) {
  await ensureHydrated();
  try {
    await requireRole("agency-owner");
  } catch (err) {
    return authErrorResponse(err);
  }

  let purgedDeliveredOutbox = 0;
  if (new URL(request.url).searchParams.get("outbox") === "purge-delivered") {
    // Self-flushing: drops the whole outbox key in one op (all-delivered case)
    // or removes delivered rows in flushed chunks, so it never leaves a huge
    // un-flushable patch behind.
    purgedDeliveredOutbox = await purgeDeliveredOutbox();
  }

  const [stats, automations, inbox] = await Promise.all([
    sweepExpired(),
    processAutomationSweep(),
    processInboxWebhookQueue(100),
  ]);
  return NextResponse.json({ ok: true, purgedDeliveredOutbox, stats: { ...stats, automations, inbox } });
}
