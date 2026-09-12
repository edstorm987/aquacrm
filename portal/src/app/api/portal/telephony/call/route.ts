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
import crypto from "node:crypto";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { logActivity } from "@/server/activity";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import {
  assertClientWorkspaceElementAccess,
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  initiatePhoneCall, outboundCommunicationReadiness, resolveCommunicationSender,
  type InitiatePhoneCallResult,
} from "@/lib/server/email/outboundCommunications";
import {
  resolveCaller,
  resolveOutboundRecipientSubject,
  verifyContactRecipient,
} from "@/lib/server/telephony/resolveCaller";
import { assertProspectContactable, recordProspectOutreach } from "@/lib/server/telephony/prospectOutreach";
import {
  buildOutboundCommunicationFingerprint,
  OutboundCommunicationReplayConflictError,
  runReplayProtectedOutboundOperation,
} from "@/lib/server/telephony/outboundCommunicationReplay";
import { normalisePhone } from "@/lib/telephony/phoneNumbers";
import { agencyRoleMayContactResolvedSubject } from "@/lib/telephony/prospectTargetAccess";
import type { Role } from "@/server/types";

const CALLERS: Role[] = ["agency-owner", "agency-manager", "agency-staff"];

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanLogicalCallId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    const { actor } = await requireCurrentWorkspaceElementAccess("growth", "growth.outreach", "view");
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
      senders: readiness.senders.filter(sender => {
        if (sender.channel !== "call") return false;
        if (!sender.clientId) return true;
        const access = resolveActorClientWorkspaceElementAccess(actor, sender.clientId);
        return clientWorkspaceElementAtLeast(
          clientWorkspaceElementLevel(access, "client.communications"),
          "view",
        );
      }),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(CALLERS);
    const { actor } = await requireCurrentWorkspaceElementAccess("growth", "growth.outreach", "use");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    const rawPhone = clean(body?.phone, 40);
    const senderId = clean(body?.senderId, 200);
    const clientId = clean(body?.clientId, 160) || undefined;
    const contactId = clean(body?.contactId, 160) || undefined;
    const prospectId = clean(body?.prospectId, 160) || undefined;
    const logicalCallId = cleanLogicalCallId(body?.logicalCallId);

    if (!rawPhone) return NextResponse.json({ ok: false, error: "phone is required." }, { status: 400 });
    if (!senderId) return NextResponse.json({ ok: false, error: "Choose which number to call from." }, { status: 400 });
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(logicalCallId)) {
      return NextResponse.json({ ok: false, error: "The call token is missing or invalid. Reopen the caller and try again." }, { status: 400 });
    }

    const phone = normalisePhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ ok: false, error: "That is not a phone number this can dial." }, { status: 400 });
    }

    const tenant = routeTenantScope(session, clientId ? { clientId } : {});
    if (clientId && !tenant.client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }

    let verifiedContactId: string | undefined;
    if (contactId) {
      const matchesRecipient = await verifyContactRecipient(
        tenant.agencyId,
        session.userId,
        contactId,
        { channel: "call", phone },
        tenant.clientId,
      );
      if (!matchesRecipient) {
        return NextResponse.json({
          ok: false,
          error: "The selected contact does not match this recipient.",
        }, { status: 409 });
      }
      verifiedContactId = contactId;
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
    // opted-out or mismatched prospect is refused HERE, whatever the UI
    // rendered. Research remains optional and is not an authorisation gate.
    let resolvedProspectId: string | undefined;
    try {
      // An explicit Contact/Client already selects the intended record. Do not
      // silently attach a separate recipient-matched Prospect that happens to
      // share its switchboard; the exact-subject resolver below will follow
      // durable edges from the selected record instead.
      resolvedProspectId = prospectId || (!contactId && !clientId)
        ? await assertProspectContactable(tenant.agencyId, session.userId, {
            ...(prospectId ? { prospectId } : {}),
            phone,
          })
        : undefined;
    } catch (gate) {
      return NextResponse.json({
        ok: false,
        error: gate instanceof Error ? gate.message : "This prospect cannot be contacted.",
      }, { status: 409 });
    }
    const sender = resolveCommunicationSender(tenant.agencyId, senderId, "call", tenant.clientId);
    if (!sender) {
      return NextResponse.json({ ok: false, error: "That calling number is not available." }, { status: 400 });
    }
    if (sender.clientId) {
      assertClientWorkspaceElementAccess(
        resolveActorClientWorkspaceElementAccess(actor, sender.clientId),
        "client.communications",
        "use",
      );
    }

    const subjectResolution = await resolveOutboundRecipientSubject(
      tenant.agencyId,
      session.userId,
      { channel: "call", phone },
      {
        ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
        ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
        ...(tenant.clientId ? { clientId: tenant.clientId } : {}),
      },
    );
    if (sender.provider === "twilio" && subjectResolution.status !== "resolved") {
      return NextResponse.json({
        ok: false,
        error: subjectResolution.status === "ambiguous"
          ? "More than one CRM subject uses this phone number. Open the intended Contact or Prospect before calling."
          : "Save or select the CRM Contact, Prospect, Lead, or Client before placing a provider call.",
      }, { status: 409 });
    }
    const exactSubject = subjectResolution.status === "resolved" ? subjectResolution.subject : {};
    resolvedProspectId = exactSubject.prospectId ?? resolvedProspectId;
    verifiedContactId = exactSubject.contactId ?? verifiedContactId;
    const resolvedLeadId = exactSubject.leadId;
    const resolvedClientId = exactSubject.clientId;

    // Prospect access follows the resolved graph, not the browser's choice of
    // id field. This also closes Contact/Lead indirection into a Prospect while
    // retaining staff calls to records whose canonical component has no Prospect.
    if (!agencyRoleMayContactResolvedSubject(session.role, {
      ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
      ...(resolvedLeadId ? { leadId: resolvedLeadId } : {}),
      ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
    })) {
      return NextResponse.json({
        ok: false,
        error: "Scouting prospects can only be contacted by an agency owner or manager.",
      }, { status: 403 });
    }

    const logicalCallFingerprint = buildOutboundCommunicationFingerprint({
      agencyId: tenant.agencyId,
      ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
      channel: "call",
      recipient: phone,
      senderId: sender.id,
      payload: {
        contactId: verifiedContactId ?? "",
        prospectId: resolvedProspectId ?? "",
        leadId: resolvedLeadId ?? "",
      },
    });
    const outreachAttemptId = resolvedProspectId
      ? `call_${crypto.createHash("sha256")
          .update(`${logicalCallId}\u0000${logicalCallFingerprint}`)
          .digest("hex")
          .slice(0, 32)}`
      : undefined;

    let replayed = false;
    let result: InitiatePhoneCallResult;
    if (sender.provider === "twilio") {
      const protectedCall = await runReplayProtectedOutboundOperation({
        agencyId: tenant.agencyId,
        ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
        channel: "twilio-call",
        operationId: logicalCallId,
        requestFingerprint: logicalCallFingerprint,
        senderId: sender.id,
        subjectReferences: {
          ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
          ...(resolvedLeadId ? { leadId: resolvedLeadId } : {}),
          ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
        },
      }, async () => {
        const providerResult = await initiatePhoneCall({
          agencyId: tenant.agencyId,
          ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
          sender,
          customerPhone: phone,
        });
        return {
          successful: providerResult.initiated,
          via: "twilio",
          ...(providerResult.externalCallId ? { externalProviderId: providerResult.externalCallId } : {}),
          ...(providerResult.reason ? { reason: providerResult.reason } : {}),
          ...(providerResult.code ? { code: providerResult.code } : {}),
          ...(providerResult.outcomeUnknown ? { outcomeUnknown: true } : {}),
          ...(providerResult.retry ? { retry: providerResult.retry } : {}),
        };
      });
      replayed = protectedCall.replayed;
      result = {
        initiated: protectedCall.result.successful,
        via: "twilio",
        ...(protectedCall.result.externalProviderId ? { externalCallId: protectedCall.result.externalProviderId } : {}),
        ...(protectedCall.result.reason ? { reason: protectedCall.result.reason } : {}),
        ...(protectedCall.result.code ? { code: protectedCall.result.code } : {}),
        ...(protectedCall.result.outcomeUnknown ? { outcomeUnknown: true } : {}),
        ...(protectedCall.result.retry ? { retry: protectedCall.result.retry } : {}),
      };
    } else {
      result = await initiatePhoneCall({
        agencyId: tenant.agencyId,
        ...(tenant.clientId ? { clientId: tenant.clientId } : {}),
        sender,
        customerPhone: phone,
      });
    }

    if (!result.initiated) {
      // `via: "device"` is not a failure — it means "this identity is your own
      // handset, dial it yourself". The UI turns that into a tel: link. The
      // attempt is recorded HERE, because the client's tel: handoff has no
      // callback that ever fires — device calls were the outreach that never
      // counted (Ed's finding, 2026-08-30).
      let outreachReceipt = { outreachRecorded: false, ...(outreachAttemptId ? { outreachAttemptId } : {}) };
      if (result.via === "device" && resolvedProspectId) {
        outreachReceipt = await recordProspectOutreach(
          tenant.agencyId,
          resolvedProspectId,
          "call",
          "attempted",
          session.userId,
          outreachAttemptId,
        );
      }
      if (result.via === "device") {
        // A tel: hand-off can suspend the browser before any UI callback runs.
        // Retain the exact, modest truth here: Aqua prepared a device call; it
        // does not claim the other person answered. The raw number and resolved
        // display label deliberately remain in the response only: an unresolved
        // recipient has no exact erasure edge, so persisting either here would
        // leave personal data that a later client erasure could not safely find.
        logActivity({
          idempotencyKey: `outreach-call-device:${logicalCallId}:${logicalCallFingerprint}`,
          agencyId: tenant.agencyId,
          ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
          actorUserId: session.userId,
          category: "inbox",
          action: "call.device-handoff",
          message: "Prepared a device call in the default phone app.",
          metadata: {
            via: "device",
            senderId,
            callerKind: identity.kind,
            ...(identity.clientId ? { calledClientId: identity.clientId } : {}),
            ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
            ...(resolvedLeadId ? { leadId: resolvedLeadId } : {}),
            ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
            logicalCallId,
            ...(outreachReceipt.outreachAttemptId ? { outreachAttemptId: outreachReceipt.outreachAttemptId } : {}),
          },
        });
        await flushPendingWrites();
      }
      return NextResponse.json({
        ok: result.via === "device",
        via: result.via,
        identity,
        logicalCallId,
        replayed,
        ...outreachReceipt,
        ...(result.reason ? { error: result.reason } : {}),
        ...(result.code ? { code: result.code } : {}),
        ...(result.outcomeUnknown ? { outcomeUnknown: true } : {}),
        ...(result.retry ? { retry: result.retry } : {}),
      }, { status: result.via === "device" ? 200 : result.outcomeUnknown ? 503 : 502 });
    }

    // Delivery and the journey ledger in ONE request: a navigation or network
    // failure after this point cannot lose the history or the quota tick.
    const outreachReceipt = resolvedProspectId
      ? await recordProspectOutreach(
          tenant.agencyId,
          resolvedProspectId,
          "call",
          "attempted",
          session.userId,
          outreachAttemptId,
        )
      : { outreachRecorded: false };

    logActivity({
      idempotencyKey: `outreach-call:${logicalCallId}:${logicalCallFingerprint}`,
      agencyId: tenant.agencyId,
      ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
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
        ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
        ...(resolvedLeadId ? { leadId: resolvedLeadId } : {}),
        ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
        ...(result.externalCallId ? { externalCallId: result.externalCallId } : {}),
        logicalCallId,
        ...(outreachReceipt.outreachAttemptId ? { outreachAttemptId: outreachReceipt.outreachAttemptId } : {}),
      },
    });
    await flushPendingWrites();

    return NextResponse.json({
      ok: true,
      via: result.via,
      identity,
      externalCallId: result.externalCallId,
      logicalCallId,
      replayed,
      ...outreachReceipt,
    });
  } catch (error) {
    if (error instanceof OutboundCommunicationReplayConflictError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return authErrorResponse(error);
  }
}
