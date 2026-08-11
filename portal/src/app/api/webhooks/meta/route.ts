import crypto from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";

import { processInboxWebhookQueue } from "@/lib/server/inboxService";
import { enqueueInboxWebhookEvent } from "@/lib/server/inboxStore";
import { verifyMetaWebhookSignature } from "@/lib/server/metaMessaging";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const suppliedToken = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!expectedToken) return NextResponse.json({ ok: false, error: "meta_webhook_not_configured" }, { status: 503 });
  if (mode !== "subscribe" || suppliedToken !== expectedToken || !challenge) {
    return NextResponse.json({ ok: false, error: "meta_webhook_verification_failed" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret) return NextResponse.json({ ok: false, error: "meta_app_secret_not_configured" }, { status: 503 });
  const rawBody = await request.text();
  if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ ok: false, error: "invalid_meta_signature" }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
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
