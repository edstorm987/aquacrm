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

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { logActivity } from "@/server/activity";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { outboundCommunicationReadiness, resolveCommunicationSender } from "@/lib/server/email/outboundCommunications";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { resolveCaller, resolveEmailRecipient } from "@/lib/server/telephony/resolveCaller";
import { assertProspectContactable, recordProspectOutreach } from "@/lib/server/telephony/prospectOutreach";
import type { Role } from "@/server/types";

const SENDERS: Role[] = ["agency-owner", "agency-manager", "agency-staff"];

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
    const tenant = routeTenantScope(session, {});
    const readiness = outboundCommunicationReadiness(tenant.agencyId);
    return NextResponse.json({
      ok: true,
      senders: readiness.senders.filter(sender => sender.channel === "email"),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(SENDERS);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    const to = clean(body?.to, 320).toLowerCase();
    const subject = clean(body?.subject, 240);
    const message = clean(body?.body, 20_000);
    const senderId = clean(body?.senderId, 200);
    const clientId = clean(body?.clientId, 160) || undefined;
    const contactId = clean(body?.contactId, 160) || undefined;
    const prospectId = clean(body?.prospectId, 160) || undefined;

    if (!to || !to.includes("@")) return NextResponse.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
    if (!subject) return NextResponse.json({ ok: false, error: "A subject is required." }, { status: 400 });
    if (!message) return NextResponse.json({ ok: false, error: "There is nothing to send." }, { status: 400 });
    if (!senderId) return NextResponse.json({ ok: false, error: "Choose which address to send from." }, { status: 400 });

    const tenant = routeTenantScope(session, clientId ? { clientId } : {});
    if (clientId && !tenant.client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }

    const sender = resolveCommunicationSender(tenant.agencyId, senderId, "email", tenant.clientId);
    if (!sender || (sender.provider !== "resend" && sender.provider !== "smtp")) {
      return NextResponse.json({ ok: false, error: "That sending address is not available." }, { status: 400 });
    }

    // The suppression check, keyed on what the SERVER knows — never on what
    // the browser volunteers. The first version ran only when the request body
    // carried a phone number, which meant omitting the field skipped the
    // check entirely (Ed's finding, 2026-08-30). The recipient is now looked
    // up by the address this route is actually about to send to; the optional
    // phone stays as a second net for records that carry a number but no
    // email.
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

    const result = await sendTransactionalEmail({
      to,
      subject,
      bodyText: message,
      bodyHtml: `<p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>`,
      agencyId: tenant.agencyId,
      ...(tenant.clientId ? { clientId: tenant.clientId } : {}),
      // Per-SEND, not per-recipient (Ed's finding, 2026-08-30): the key's job is
      // retry-safety for one logical send, and keying it on the recipient made
      // Resend dedupe every distinct follow-up to the same person.
      externalRef: `outreach:${contactId ?? to}:${crypto.randomUUID()}`,
      sender: { provider: sender.provider, ...(sender.connectionId ? { connectionId: sender.connectionId } : {}) },
    });

    if (!result.delivered) {
      return NextResponse.json({ ok: false, error: result.reason ?? "The email could not be sent." }, { status: 502 });
    }

    // Delivered and remembered in the same request — a lost follow-up POST can
    // no longer lose the history or the quota tick (Ed's finding, 2026-08-30).
    if (prospectId) {
      await recordProspectOutreach(tenant.agencyId, prospectId, "email", "sent", session.userId);
    }

    logActivity({
      agencyId: tenant.agencyId,
      ...(tenant.clientId ? { clientId: tenant.clientId } : {}),
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
        ...(contactId ? { contactId } : {}),
        ...(result.externalMessageId ? { externalMessageId: result.externalMessageId } : {}),
      },
    });
    await flushPendingWrites();

    return NextResponse.json({ ok: true, via: result.via, from: sender.address });
  } catch (error) {
    return authErrorResponse(error);
  }
}
