import "server-only";

// Place a call to anyone in the CRM — not only to a website enquiry.
//
// ── Why this route exists ─────────────────────────────────────────────────
//
// The Twilio voice bridge has worked since it was built: `initiatePhoneCall`
// rings your handset, then dials the prospect showing your chosen caller ID.
// But the only surface that could reach it was Master Inbox's enquiry
// composer, and `/api/portal/website-enquiries/communications` demands an
// `enquiryId` and reads `enquiry.phone`. A contact imported from a bought CSV
// is not an enquiry, so there was no way to dial one — the dialler was a
// working engine with no ignition.
//
// `initiatePhoneCall` never needed the enquiry. It takes a number and a sender.
// This route is that fact, exposed.
//
// ── Do-not-call is enforced HERE, not in the UI ───────────────────────────
//
// A button that hides itself is not a control. The check lives on the server
// so a stale page, a replayed request, or a future second caller cannot dial
// somebody who asked to be taken off the list. `resolveCaller` reports
// do-not-call if ANY matching record carries it, because consent given on one
// row is not consent given on another.

import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { logActivity } from "@/server/activity";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import {
  initiatePhoneCall, outboundCommunicationReadiness, resolveCommunicationSender,
} from "@/lib/server/email/outboundCommunications";
import { resolveCaller } from "@/lib/server/telephony/resolveCaller";
import { assertProspectContactable, recordProspectOutreach } from "@/lib/server/telephony/prospectOutreach";
import { normalisePhone } from "@/lib/telephony/phoneNumbers";
import type { Role } from "@/server/types";

const CALLERS: Role[] = ["agency-owner", "agency-manager", "agency-staff"];

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Who is this number, and can I call it?
 *
 * Used by the dialler to paint a row before you press call, and by the caller
 * screen. Cheap enough to call per row; it reads the same two collections the
 * contacts page already loaded.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(CALLERS);
    const url = new URL(request.url);
    const phone = clean(url.searchParams.get("phone"), 40);
    if (!phone) return NextResponse.json({ ok: false, error: "phone is required." }, { status: 400 });

    const tenant = routeTenantScope(session, {});
    const identity = await resolveCaller(tenant.agencyId, phone, session.userId);
    const readiness = outboundCommunicationReadiness(tenant.agencyId);

    return NextResponse.json({
      ok: true,
      identity,
      // Every voice identity you could call FROM: each Twilio connection
      // contributes one, which is how several burner numbers and one official
      // line coexist without any of them being special-cased.
      senders: readiness.senders.filter(sender => sender.channel === "call"),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(CALLERS);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    const rawPhone = clean(body?.phone, 40);
    const senderId = clean(body?.senderId, 200);
    const clientId = clean(body?.clientId, 160) || undefined;
    const contactId = clean(body?.contactId, 160) || undefined;
    const prospectId = clean(body?.prospectId, 160) || undefined;

    if (!rawPhone) return NextResponse.json({ ok: false, error: "phone is required." }, { status: 400 });
    if (!senderId) return NextResponse.json({ ok: false, error: "Choose which number to call from." }, { status: 400 });

    const phone = normalisePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ ok: false, error: "That is not a phone number this can dial." }, { status: 400 });
    }

    const tenant = routeTenantScope(session, clientId ? { clientId } : {});
    if (clientId && !tenant.client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }

    const identity = await resolveCaller(tenant.agencyId, phone, session.userId);
    if (identity.doNotCall) {
      // 409, not 403: the caller is permitted, the NUMBER is not. The
      // distinction matters when this is read back in a log.
      return NextResponse.json({
        ok: false,
        error: `${identity.displayName} is on the do-not-call list.`,
        identity,
      }, { status: 409 });
    }

    // The scouting fence, enforced where it cannot be walked around: an
    // opted-out or uninspected prospect is refused HERE, whatever the UI
    // rendered (Ed's finding, 2026-08-30).
    if (prospectId) {
      try {
        await assertProspectContactable(tenant.agencyId, prospectId, session.userId);
      } catch (gate) {
        return NextResponse.json({
          ok: false,
          error: gate instanceof Error ? gate.message : "This prospect cannot be contacted.",
        }, { status: 409 });
      }
    }

    const sender = resolveCommunicationSender(tenant.agencyId, senderId, "call", tenant.clientId);
    if (!sender) {
      return NextResponse.json({ ok: false, error: "That calling number is not available." }, { status: 400 });
    }

    const result = await initiatePhoneCall({
      agencyId: tenant.agencyId,
      ...(tenant.clientId ? { clientId: tenant.clientId } : {}),
      sender,
      customerPhone: phone,
    });

    if (!result.initiated) {
      // `via: "device"` is not a failure — it means "this identity is your own
      // handset, dial it yourself". The UI turns that into a tel: link. The
      // attempt is recorded HERE, because the client's tel: handoff has no
      // callback that ever fires — device calls were the outreach that never
      // counted (Ed's finding, 2026-08-30).
      if (result.via === "device" && prospectId) {
        await recordProspectOutreach(tenant.agencyId, prospectId, "call", "attempted", session.userId);
      }
      return NextResponse.json({
        ok: result.via === "device",
        via: result.via,
        identity,
        ...(result.reason ? { error: result.reason } : {}),
      }, { status: result.via === "device" ? 200 : 502 });
    }

    // Delivery and the journey ledger in ONE request: a navigation or network
    // failure after this point cannot lose the history or the quota tick.
    if (prospectId) {
      await recordProspectOutreach(tenant.agencyId, prospectId, "call", "attempted", session.userId);
    }

    logActivity({
      agencyId: tenant.agencyId,
      ...(tenant.clientId ? { clientId: tenant.clientId } : {}),
      actorUserId: session.userId,
      category: "inbox",
      action: "call.initiated",
      message: `Called ${identity.displayName} (${identity.categoryLabel})`,
      metadata: {
        phone,
        via: result.via,
        senderId,
        callerKind: identity.kind,
        ...(identity.clientId ? { calledClientId: identity.clientId } : {}),
        ...(contactId ? { contactId } : {}),
        ...(result.externalCallId ? { externalCallId: result.externalCallId } : {}),
      },
    });
    await flushPendingWrites();

    return NextResponse.json({ ok: true, via: result.via, identity, externalCallId: result.externalCallId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
