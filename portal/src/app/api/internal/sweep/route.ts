// POST /api/internal/sweep — founder-gated maintenance that prunes expired
// rate-limit + login-failure records, processes the automation/inbox queues and
// optionally purges the delivered outbox, then reports counts. R021 Goal D.
//
// It is POST, not GET (Item 11): it is owner-COOKIE gated, so it is triggered
// from the operator's browser — a state-changing GET there is a drive-by/CSRF
// vector (a malicious page can make the browser issue the GET with the owner's
// ambient cookie). As a cookie-authed mutation under /api/internal/* it is also
// covered by the proxy's exact-origin + Fetch-Metadata CSRF gate.
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

export async function POST(request: NextRequest) {
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
