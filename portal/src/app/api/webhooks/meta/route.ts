import crypto from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";

import { processInboxWebhookQueue } from "@/lib/server/inbox/inboxService";
import { enqueueInboxWebhookEvent } from "@/lib/server/inbox/inboxStore";
import { metaWebhookVerifyTokenAccepted, verifyMetaWebhookRequest } from "@/lib/server/integrations/metaMessaging";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const suppliedToken = request.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  // Accept the handshake if the token matches any agency's stored verify token or the env token.
  if (mode !== "subscribe" || !challenge || !metaWebhookVerifyTokenAccepted(suppliedToken)) {
    return NextResponse.json({ ok: false, error: "meta_webhook_verification_failed" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  await ensureHydrated();
  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // Parsing the (still-untrusted) body only selects which stored/env App Secret to
  // verify against — the HMAC check below is the gate that decides trust.
  if (!(await verifyMetaWebhookRequest(rawBody, request.headers.get("x-hub-signature-256"), payload as { entry?: Array<{ id?: unknown }> }))) {
    return NextResponse.json({ ok: false, error: "invalid_meta_signature" }, { status: 401 });
  }
  const eventKey = crypto.createHash("sha256").update(rawBody).digest("hex");
  const result = await enqueueInboxWebhookEvent({
    eventKey,
    objectType: typeof payload.object === "string" ? payload.object : undefined,
    payload,
  });
  if (!result.duplicate) after(() => processInboxWebhookQueue(25));
  return NextResponse.json({ ok: true, accepted: !result.duplicate, duplicate: result.duplicate });
}
