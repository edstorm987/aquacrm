import "server-only";

// Email a scouting prospect — from the official address or from a burner.
//
// Ed, 2026-08-29: *"same will go for emails in scouting, I need to go from
// official milesymedia and burner versions as well."*
//
// ── The same shape as the dialler, for the same reason ────────────────────
//
// `outboundCommunicationReadiness` already yields ONE email sender per
// resend/smtp connection, exactly as it yields one voice line per Twilio
// connection. So several from-addresses is not a feature to build, it is
// several connections — "Milesymedia official", "Outreach 1", "Outreach 2" —
// and this route is the thing that lets a caller pick between them.
//
// `sendTransactionalEmail` already accepts `sender: { provider, connectionId }`
// and resolves that connection's own credentials. The gap was never the
// sending; it was that nothing let a person choose per message.
//
// ── Do-not-call means do not contact ──────────────────────────────────────
//
// The flag is honoured here as well as in the dialler. Somebody who asked to be
// taken off the list has not asked to be emailed instead, and a flag that only
// one channel respects is worse than none — it reads as compliance while the
// other channel carries on.

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
import { outboundCommunicationReadiness, resolveCommunicationSender } from "@/lib/server/email/outboundCommunications";
import { sendTransactionalEmail, type TransactionalEmailResult } from "@/lib/server/email/transactionalEmail";
import {
  resolveCaller,
  resolveEmailRecipient,
  resolveOutboundRecipientSubject,
  verifyContactRecipient,
} from "@/lib/server/telephony/resolveCaller";
import { assertProspectContactable, recordProspectOutreach } from "@/lib/server/telephony/prospectOutreach";
import {
  buildOutboundCommunicationFingerprint,
  OutboundCommunicationReplayConflictError,
  runReplayProtectedOutboundOperation,
} from "@/lib/server/telephony/outboundCommunicationReplay";
import { agencyRoleMayContactResolvedSubject } from "@/lib/telephony/prospectTargetAccess";
import type { Role } from "@/server/types";

const SENDERS: Role[] = ["agency-owner", "agency-manager", "agency-staff"];
const DEVICE_EMAIL_SENDER = {
  id: "device:email",
  channel: "email" as const,
  provider: "device" as const,
  label: "Default email app",
  address: "Manual send",
};

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanLogicalSendId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** The addresses this agency can send outreach FROM. */
export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(SENDERS);
    const { actor } = await requireCurrentWorkspaceElementAccess("growth", "growth.outreach", "view");
    const tenant = routeTenantScope(session, {});
    const readiness = outboundCommunicationReadiness(tenant.agencyId);
    return NextResponse.json({
      ok: true,
      senders: [
        ...readiness.senders.filter(sender => {
          if (sender.channel !== "email") return false;
          if (!sender.clientId) return true;
          const access = resolveActorClientWorkspaceElementAccess(actor, sender.clientId);
          return clientWorkspaceElementAtLeast(
            clientWorkspaceElementLevel(access, "client.communications"),
            "view",
          );
        }),
        DEVICE_EMAIL_SENDER,
      ],
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(SENDERS);
    const { actor } = await requireCurrentWorkspaceElementAccess("growth", "growth.outreach", "use");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    const to = clean(body?.to, 320).toLowerCase();
    const subject = clean(body?.subject, 240);
    const message = clean(body?.body, 20_000);
    const senderId = clean(body?.senderId, 200);
    const clientId = clean(body?.clientId, 160) || undefined;
    const contactId = clean(body?.contactId, 160) || undefined;
    const prospectId = clean(body?.prospectId, 160) || undefined;
    const logicalSendId = cleanLogicalSendId(body?.logicalSendId);

    if (!to || !to.includes("@")) return NextResponse.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
    if (!subject) return NextResponse.json({ ok: false, error: "A subject is required." }, { status: 400 });
    if (!message) return NextResponse.json({ ok: false, error: "There is nothing to send." }, { status: 400 });
    if (!senderId) return NextResponse.json({ ok: false, error: "Choose which address to send from." }, { status: 400 });
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(logicalSendId)) {
      return NextResponse.json({ ok: false, error: "The email send token is missing or invalid. Reopen the composer and try again." }, { status: 400 });
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
        { channel: "email", email: to },
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

    const sender = senderId === DEVICE_EMAIL_SENDER.id
      ? DEVICE_EMAIL_SENDER
      : resolveCommunicationSender(tenant.agencyId, senderId, "email", tenant.clientId);
    if (!sender || (sender.provider !== "resend" && sender.provider !== "smtp" && sender.provider !== "device")) {
      return NextResponse.json({ ok: false, error: "That sending address is not available." }, { status: 400 });
    }
    if ("clientId" in sender && sender.clientId) {
      assertClientWorkspaceElementAccess(
        resolveActorClientWorkspaceElementAccess(actor, sender.clientId),
        "client.communications",
        "use",
      );
    }

    // The suppression check, keyed on what the SERVER knows — never on what
    // the browser volunteers. The first version ran only when the request body
    // carried a phone number, which meant omitting the field skipped the
    // check entirely (Ed's finding, 2026-08-30). The recipient is now looked
    // up by the address this route is actually about to send to; the optional
    // phone stays as a second net for records that carry a number but no
    // email.
    let resolvedProspectId: string | undefined;
    try {
      // A selected Contact/Client already identifies the intended record. A
      // different active Prospect may share its inbox, so only auto-resolve a
      // Prospect for genuinely recipient-only outreach.
      resolvedProspectId = prospectId || (!contactId && !clientId)
        ? await assertProspectContactable(tenant.agencyId, session.userId, {
            ...(prospectId ? { prospectId } : {}),
            email: to,
          })
        : undefined;
    } catch (gate) {
      return NextResponse.json({
        ok: false,
        error: gate instanceof Error ? gate.message : "This prospect cannot be contacted.",
      }, { status: 409 });
    }
    const recipient = await resolveEmailRecipient(tenant.agencyId, to, session.userId);
    if (recipient.doNotContact) {
      return NextResponse.json({
        ok: false,
        error: `${recipient.displayName} has opted out of contact.`,
      }, { status: 409 });
    }
    const recipientPhone = clean(body?.phone, 40);
    if (recipientPhone) {
      const identity = await resolveCaller(tenant.agencyId, recipientPhone, session.userId);
      if (identity.doNotCall) {
        return NextResponse.json({
          ok: false,
          error: `${identity.displayName} has opted out of contact.`,
        }, { status: 409 });
      }
    }

    const subjectResolution = await resolveOutboundRecipientSubject(
      tenant.agencyId,
      session.userId,
      { channel: "email", email: to },
      {
        ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
        ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
        ...(tenant.clientId ? { clientId: tenant.clientId } : {}),
      },
    );
    if (sender.provider !== "device" && subjectResolution.status !== "resolved") {
      return NextResponse.json({
        ok: false,
        error: subjectResolution.status === "ambiguous"
          ? "More than one CRM subject uses this email address. Open the intended Contact or Prospect before sending."
          : "Save or select the CRM Contact, Prospect, Lead, or Client before sending through a provider.",
      }, { status: 409 });
    }
    const exactSubject = subjectResolution.status === "resolved" ? subjectResolution.subject : {};
    resolvedProspectId = exactSubject.prospectId ?? resolvedProspectId;
    verifiedContactId = exactSubject.contactId ?? verifiedContactId;
    const resolvedLeadId = exactSubject.leadId;
    const resolvedClientId = exactSubject.clientId;

    // Authorise the resolved component, not whichever id the browser chose to
    // send. A linked Contact/Lead therefore cannot be used to tunnel staff
    // access into an owner/manager-only Prospect dossier.
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

    // Bind the client token to the canonical server-side payload. Retrying the
    // same reviewed send is idempotent; changing recipient, content or sender
    // becomes a distinct action even if a buggy client reuses its token.
    const logicalSendFingerprint = buildOutboundCommunicationFingerprint({
      agencyId: tenant.agencyId,
      ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
      channel: "email",
      recipient: to,
      senderId: sender.id,
      payload: {
        subject,
        message,
        contactId: verifiedContactId ?? "",
        prospectId: resolvedProspectId ?? "",
        leadId: resolvedLeadId ?? "",
      },
    });
    const outreachAttemptId = `email_${crypto.createHash("sha256")
      .update(`${logicalSendId}\u0000${logicalSendFingerprint}`)
      .digest("hex")
      .slice(0, 32)}`;

    if (sender.provider === "device") {
      const mailto = `mailto:${encodeURIComponent(to)}?${new URLSearchParams({ subject, body: message }).toString()}`;
      if (mailto.length > 8_000) {
        return NextResponse.json({
          ok: false,
          error: "This draft is too long for a reliable default-email-app handoff. Shorten it or send through a connected address.",
        }, { status: 400 });
      }

      // Opening a composer is not delivery. Record only an attempted email so
      // the operator must still save the real outcome after sending or
      // cancelling in their email app. The raw recipient remains in `mailto`
      // only: without an exact CRM subject there is no safe erasure edge for a
      // persisted address.
      const outreachReceipt = resolvedProspectId
        ? await recordProspectOutreach(
            tenant.agencyId,
            resolvedProspectId,
            "email",
            "attempted",
            session.userId,
            outreachAttemptId,
          )
        : { outreachRecorded: false };

      logActivity({
        idempotencyKey: `outreach-email-device:${logicalSendId}:${logicalSendFingerprint}`,
        agencyId: tenant.agencyId,
        ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
        actorUserId: session.userId,
        category: "inbox",
        action: "outreach.email.prepared",
        message: "Prepared an email in the default email app.",
        metadata: {
          senderId,
          ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
          ...(resolvedLeadId ? { leadId: resolvedLeadId } : {}),
          ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
          logicalSendId,
          ...(outreachReceipt.outreachAttemptId ? { outreachAttemptId: outreachReceipt.outreachAttemptId } : {}),
        },
      });
      await flushPendingWrites();

      return NextResponse.json({
        ok: true,
        via: "device",
        from: "default email app",
        mailto,
        logicalSendId,
        ...outreachReceipt,
      });
    }

    if (sender.provider !== "resend" && sender.provider !== "smtp") {
      return NextResponse.json({ ok: false, error: "That sending address is not available." }, { status: 400 });
    }
    const emailProvider = sender.provider;

    const deliver = () => sendTransactionalEmail({
      to,
      subject,
      bodyText: message,
      bodyHtml: `<p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>`,
      agencyId: tenant.agencyId,
      ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
      // The browser retains this id for retries of the SAME reviewed payload.
      // Resend receives it as its idempotency key; SMTP is fenced by Aqua's
      // durable admission/result record before this function is entered.
      externalRef: `outreach:${logicalSendId}:${logicalSendFingerprint}`,
      sender: { provider: emailProvider, ...(sender.connectionId ? { connectionId: sender.connectionId } : {}) },
    });

    let replayed = false;
    let result: TransactionalEmailResult;
    if (emailProvider === "smtp") {
      const protectedSend = await runReplayProtectedOutboundOperation({
        agencyId: tenant.agencyId,
        ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
        channel: "smtp-email",
        operationId: logicalSendId,
        requestFingerprint: logicalSendFingerprint,
        senderId: sender.id,
        subjectReferences: {
          ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
          ...(resolvedLeadId ? { leadId: resolvedLeadId } : {}),
          ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
        },
      }, async () => {
        const providerResult = await deliver();
        return {
          successful: providerResult.delivered,
          via: providerResult.via === "unconfigured" ? "unconfigured" : "smtp",
          ...(providerResult.externalMessageId ? { externalProviderId: providerResult.externalMessageId } : {}),
          ...(providerResult.reason ? { reason: providerResult.reason } : {}),
          ...(providerResult.code ? { code: providerResult.code } : {}),
          ...(providerResult.outcomeUnknown ? { outcomeUnknown: true } : {}),
          ...(providerResult.retry ? { retry: providerResult.retry } : {}),
        };
      });
      replayed = protectedSend.replayed;
      result = {
        delivered: protectedSend.result.successful,
        via: protectedSend.result.via === "unconfigured" ? "unconfigured" : "smtp",
        ...(protectedSend.result.externalProviderId ? { externalMessageId: protectedSend.result.externalProviderId } : {}),
        ...(protectedSend.result.reason ? { reason: protectedSend.result.reason } : {}),
        ...(protectedSend.result.code ? { code: protectedSend.result.code } : {}),
        ...(protectedSend.result.outcomeUnknown ? { outcomeUnknown: true } : {}),
        ...(protectedSend.result.retry ? { retry: protectedSend.result.retry } : {}),
      };
    } else {
      result = await deliver();
    }

    if (!result.delivered) {
      return NextResponse.json({
        ok: false,
        error: result.reason ?? "The email could not be sent.",
        logicalSendId,
        replayed,
        ...(result.code ? { code: result.code } : {}),
        ...(result.outcomeUnknown ? { outcomeUnknown: true } : {}),
        ...(result.retry ? { retry: result.retry } : {}),
      }, { status: result.outcomeUnknown ? 503 : 502 });
    }

    // Delivered and remembered in the same request — a lost follow-up POST can
    // no longer lose the history or the quota tick (Ed's finding, 2026-08-30).
    const outreachReceipt = resolvedProspectId
      ? await recordProspectOutreach(
          tenant.agencyId,
          resolvedProspectId,
          "email",
          "sent",
          session.userId,
          outreachAttemptId,
        )
      : { outreachRecorded: false };

    logActivity({
      idempotencyKey: `outreach-email:${logicalSendId}:${logicalSendFingerprint}`,
      agencyId: tenant.agencyId,
      ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
      actorUserId: session.userId,
      category: "inbox",
      action: "outreach.email.sent",
      message: `Emailed ${to} from ${sender.label}`,
      metadata: {
        to,
        senderId,
        // WHICH address it went from — the whole point of burners.
        fromAddress: sender.address,
        via: result.via,
        ...(resolvedProspectId ? { prospectId: resolvedProspectId } : {}),
        ...(resolvedLeadId ? { leadId: resolvedLeadId } : {}),
        ...(verifiedContactId ? { contactId: verifiedContactId } : {}),
        ...(result.externalMessageId ? { externalMessageId: result.externalMessageId } : {}),
        logicalSendId,
        ...(outreachReceipt.outreachAttemptId ? { outreachAttemptId: outreachReceipt.outreachAttemptId } : {}),
      },
    });
    await flushPendingWrites();

    return NextResponse.json({
      ok: true,
      via: result.via,
      from: sender.address,
      logicalSendId,
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
