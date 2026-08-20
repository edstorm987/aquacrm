import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isTradingBrandSlug, tradingBrandDefinition } from "@/lib/brands/tradingBrands";
import { logActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EnquiryRow = {
  id: string;
  brand_slug: string;
  name: string;
  email: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
};

type StoredReply = {
  id: string;
  channel: "email";
  subject: string;
  message: string;
  recipient: string;
  sentAt: number;
  sentBy: string;
  status: "sent" | "failed";
  via: "resend" | "smtp" | "unconfigured";
  error?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function existingReplies(metadata: Record<string, unknown>): StoredReply[] {
  return Array.isArray(metadata.inboxReplies)
    ? metadata.inboxReplies.filter((item): item is StoredReply => Boolean(item && typeof item === "object"))
    : [];
}

export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json().catch(() => null) as {
      enquiryId?: unknown;
      subject?: unknown;
      message?: unknown;
    } | null;
    const enquiryId = typeof body?.enquiryId === "string" ? body.enquiryId.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 8_000) : "";
    if (!enquiryId || !message) {
      return NextResponse.json({ ok: false, error: "Submission ID and a reply are required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("brand_enquiries")
      .select("id, brand_slug, name, email, message, metadata")
      .eq("id", enquiryId)
      .maybeSingle();
    if (error) throw new Error(`Could not load website enquiry: ${error.message}`);
    if (!data) return NextResponse.json({ ok: false, error: "Website submission not found." }, { status: 404 });

    const enquiry = data as EnquiryRow;
    const recipient = enquiry.email?.trim().toLowerCase() ?? "";
    if (!EMAIL.test(recipient)) {
      return NextResponse.json({ ok: false, error: "This enquiry does not have a valid email address to reply to." }, { status: 400 });
    }

    const brandName = isTradingBrandSlug(enquiry.brand_slug)
      ? tradingBrandDefinition(enquiry.brand_slug).name
      : enquiry.brand_slug.replaceAll("-", " ");
    const subjectInput = typeof body?.subject === "string" ? body.subject.trim().slice(0, 180) : "";
    const subject = subjectInput || `Re: Your enquiry with ${brandName}`;
    const sentAt = Date.now();
    const currentMetadata = enquiry.metadata ?? {};
    const replyId = `reply_${createHash("sha256")
      .update([enquiry.id, session.userId, subject, message, Math.floor(sentAt / 600_000)].join("\u0000"))
      .digest("hex")
      .slice(0, 24)}`;
    const priorReplies = existingReplies(currentMetadata);
    const priorDelivery = priorReplies.find(item => item.id === replyId && item.status === "sent");
    if (priorDelivery) return NextResponse.json({ ok: true, reply: priorDelivery, replayed: true });
    const originalMessage = enquiry.message?.trim();
    const result = await sendTransactionalEmail({
      agencyId: session.agencyId,
      to: recipient,
      fromName: brandName,
      subject,
      bodyText: [
        `Hello ${enquiry.name},`,
        "",
        message,
        "",
        `Sent by ${brandName} through AquaCRM.`,
        ...(originalMessage ? ["", "Your original message:", originalMessage] : []),
      ].join("\n"),
      bodyHtml: `<div style="font-family:Arial,sans-serif;background:#f5f6f6;padding:28px;color:#202221"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #dfe3e2;padding:28px"><p style="margin:0 0 20px;color:#087f8c;font-size:13px;font-weight:700">${escapeHtml(brandName)}</p><p>Hello ${escapeHtml(enquiry.name)},</p><p style="white-space:pre-wrap;line-height:1.65">${escapeHtml(message)}</p>${originalMessage ? `<div style="margin-top:28px;border-top:1px solid #e5e7e6;padding-top:18px;color:#686e6c;font-size:13px"><strong>Your original message</strong><p style="white-space:pre-wrap;line-height:1.55">${escapeHtml(originalMessage)}</p></div>` : ""}</div></div>`,
      externalRef: `website-enquiry-reply:${enquiry.id}:${replyId}`,
    });

    const reply: StoredReply = {
      id: replyId,
      channel: "email",
      subject,
      message,
      recipient,
      sentAt,
      sentBy: session.userId,
      status: result.delivered ? "sent" : "failed",
      via: result.via,
      ...(result.reason ? { error: result.reason } : {}),
    };
    const nextMetadata = {
      ...currentMetadata,
      inboxReplies: [...priorReplies.filter(item => item.id !== replyId).slice(-99), reply],
      ...(result.delivered ? {
        firstRespondedAt: typeof currentMetadata.firstRespondedAt === "string"
          ? currentMetadata.firstRespondedAt
          : new Date(sentAt).toISOString(),
        lastRespondedAt: new Date(sentAt).toISOString(),
        lastRespondedBy: session.userId,
        inboxStatus: currentMetadata.inboxStatus === "resolved" ? "resolved" : "reviewed",
      } : {}),
    };
    const { error: updateError } = await supabase
      .from("brand_enquiries")
      .update({ metadata: nextMetadata })
      .eq("id", enquiry.id);
    if (updateError) throw new Error(`Could not record website enquiry reply: ${updateError.message}`);

    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "inbox",
      action: result.delivered ? "website-enquiry.replied" : "website-enquiry.reply-failed",
      message: result.delivered
        ? `Replied to ${enquiry.name}'s ${brandName} enquiry.`
        : `Reply to ${enquiry.name}'s ${brandName} enquiry failed.`,
      metadata: { enquiryId: enquiry.id, replyId, recipient, via: result.via, error: result.reason },
    });

    if (!result.delivered) {
      return NextResponse.json({ ok: false, error: result.reason || "The reply could not be delivered.", reply }, { status: result.via === "unconfigured" ? 503 : 502 });
    }
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      console.error("[website-enquiries] reply failed", error);
      return NextResponse.json({ ok: false, error: "The reply could not be sent." }, { status: 500 });
    }
  }
}
