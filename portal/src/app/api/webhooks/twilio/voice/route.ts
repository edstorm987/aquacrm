// Incoming call — who is ringing, and where does the call go.
//
// Ed, 2026-08-29: *"I need incoming calls in this with categories so I know
// when I answer the phone who it is… if I cold called them no answer I'll know,
// if client I know it's a client."*
//
// Twilio POSTs here the moment one of your numbers rings. Two jobs, in order:
//
//   1. **Prove it is Twilio.** This is the only session-less endpoint in the
//      feature. Unverified, anyone knowing the URL could POST a `From` and make
//      the caller screen call a stranger a trusted client, mid-call.
//   2. **Answer within Twilio's timeout.** This runs while the phone is
//      ringing. It identifies the caller, records it, and returns TwiML
//      forwarding to your handset. If it is slow, the caller hears silence.
//
// ── Which agency is being called? ─────────────────────────────────────────
//
// The `To` parameter is one of YOUR numbers, so it identifies the connection
// and therefore the agency. That is also what makes several burner sales
// numbers and one official line work: each is a separate Twilio connection, and
// which one was rung is known here, so the log can say "they called the official
// line" rather than flattening every number into one inbox.
//
// The auth token needed for step 1 lives on that same connection, so lookup by
// `To` happens first and the signature is then checked against the account that
// owns the number. A `To` matching nothing is rejected without any secret being
// consulted at all.

import { NextResponse, type NextRequest } from "next/server";

import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { logActivity } from "@/server/activity";
import {
  listAgencyIdsForProvider, listIntegrationConnections,
  resolveIntegrationConnectionValues,
} from "@/lib/server/integrations/integrationConnections";
import { resolveCaller } from "@/lib/server/telephony/resolveCaller";
import { verifyTwilioSignature } from "@/lib/telephony/twilioSignature";
import { normalisePhone, samePhoneNumber } from "@/lib/telephony/phoneNumbers";

/** TwiML with no dial — the caller hears this and the call ends politely. */
function say(message: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(message)}</Say></Response>`,
    { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } },
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&apos;");
}

/**
 * The URL Twilio actually signed.
 *
 * Behind Vercel the request URL Next sees can differ from the public one, and
 * the signature is over the PUBLIC url — so the forwarded headers win when
 * present. Getting this wrong makes every legitimate call fail closed, which is
 * the safe direction but is worth naming.
 */
function signedUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (!forwardedHost) return request.url;
  const url = new URL(request.url);
  url.host = forwardedHost;
  url.protocol = `${forwardedProto}:`;
  return url.toString();
}

/** The Twilio connection whose voice number is the one that rang. */
function connectionForNumber(to: string): { agencyId: string; connectionId: string; values: Record<string, string> } | null {
  for (const agencyId of listAgencyIdsForProvider("twilio")) {
    for (const connection of listIntegrationConnections(agencyId)) {
      if (connection.provider !== "twilio") continue;
      const values = resolveIntegrationConnectionValues(agencyId, connection.id);
      if (samePhoneNumber(values.voiceFrom, to)) {
        return { agencyId, connectionId: connection.id, values };
      }
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();

    const form = await request.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") params[key] = value;
    }

    const to = params.To ?? "";
    const from = params.From ?? "";
    if (!to) return say("This number is not configured.");

    const match = connectionForNumber(to);
    // Rejected before any secret is touched: an unknown `To` is not ours.
    if (!match) return say("This number is not configured.");

    const verified = verifyTwilioSignature({
      authToken: match.values.authToken ?? "",
      url: signedUrl(request),
      params,
      signature: request.headers.get("x-twilio-signature"),
    });
    if (!verified) {
      return NextResponse.json({ ok: false, error: "invalid_twilio_signature" }, { status: 401 });
    }

    // Everything below this line is trusted input.
    const identity = await resolveCaller(match.agencyId, from || "withheld");

    logActivity({
      agencyId: match.agencyId,
      category: "inbox",
      action: "call.received",
      // The sentence you read on the notification: who, and what they are.
      message: `Incoming call from ${identity.displayName} (${identity.categoryLabel})`,
      metadata: {
        direction: "inbound",
        from: normalisePhone(from) ?? from,
        // WHICH of your numbers they rang — burner vs official line.
        to: normalisePhone(to) ?? to,
        connectionId: match.connectionId,
        callerKind: identity.kind,
        categoryLabel: identity.categoryLabel,
        ...(identity.clientId ? { clientId: identity.clientId } : {}),
        ...(identity.contactId ? { contactId: identity.contactId } : {}),
        ...(identity.leadId ? { leadId: identity.leadId } : {}),
        ...(params.CallSid ? { externalCallId: params.CallSid } : {}),
      },
    });
    await flushPendingWrites();

    const agentPhone = normalisePhone(match.values.agentPhone ?? "");
    if (!agentPhone) {
      // Identified and logged, but nowhere to send it. Saying so is better than
      // a silent line, and the record above still tells you who tried.
      return say("Thanks for calling. Nobody is available to take this call right now.");
    }

    // Forward to the handset, showing the CALLER's number so the phone's own
    // screen agrees with what AquaCRM just recorded.
    const callerId = normalisePhone(from) ?? agentPhone;
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${escapeXml(callerId)}" timeout="20"><Number>${escapeXml(agentPhone)}</Number></Dial></Response>`,
      { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } },
    );
  } catch {
    // Never leak an internal error into a live call.
    return say("Sorry, something went wrong taking this call.");
  }
}
