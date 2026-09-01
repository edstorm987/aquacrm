import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  normalisePhone,
  resolveCommunicationSender,
  sendPhoneMessage,
  type OutboundCommunicationChannel,
} from "@/lib/server/email/outboundCommunications";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { recordWebsiteEnquiryLeadContact } from "@/lib/server/websiteEnquiryLeadSync";
import type { InboxOutboundAttachment } from "@/lib/inbox/media";
import { inboxMediaUrl, readInboxMediaBytes, verifyInboxMediaToken } from "@/lib/server/inbox/inboxMedia";
import { claimStagedPrivateUploadsForOwnership, commitStagedPrivateUploadOwnership, PrivateObjectLifecycleClaimError } from "@/lib/server/privateObjectLifecycle";
import { createScopedSupabaseClient } from "@/lib/supabase/scoped";
import { loadOwnedEnquiry } from "@/lib/supabase/ownedEnquiry";
import { isTradingBrandSlug, tradingBrandDefinition } from "@/lib/brands/tradingBrands";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type MessageChannel = Exclude<OutboundCommunicationChannel, "call">;
const CHANNELS = new Set<MessageChannel>(["email", "sms", "whatsapp"]);

type EnquiryRow = {
  id: string;
  brand_slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
};

type StoredReply = {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  subject?: string;
  message: string;
  recipient: string;
  senderId: string;
  senderLabel: string;
  sentAt: number;
  sentBy: string;
  status: "sent" | "failed";
  via: "resend" | "smtp" | "twilio" | "unconfigured";
  externalMessageId?: string;
  error?: string;
  attachments: InboxOutboundAttachment[];
};

export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json().catch(() => null) as {
      enquiryId?: unknown;
      channel?: unknown;
      senderId?: unknown;
      subject?: unknown;
      message?: unknown;
      attachments?: unknown;
    } | null;
    const enquiryId = clean(body?.enquiryId, 160);
    const channelInput = clean(body?.channel, 20);
    const senderId = clean(body?.senderId, 240);
    const messageInput = clean(body?.message, 8_000);
    const attachmentTokens = Array.isArray(body?.attachments)
      ? body.attachments.flatMap(item => item && typeof item === "object" && typeof (item as { token?: unknown }).token === "string" ? [(item as { token: string }).token] : []).slice(0, 10)
      : [];
    if (!enquiryId || !CHANNELS.has(channelInput as MessageChannel) || !senderId || (!messageInput && !attachmentTokens.length)) {
      return NextResponse.json({ ok: false, error: "Enquiry, channel, send-as account and a message or attachment are required." }, { status: 400 });
    }
    const channel = channelInput as MessageChannel;
    const supabase = await createScopedSupabaseClient();
    const data = await loadOwnedEnquiry<EnquiryRow>(supabase, {
      id: enquiryId,
      agencyId: session.agencyId,
      columns: ["brand_slug", "name", "email", "phone", "message", "metadata"],
    });
    if (!data) return NextResponse.json({ ok: false, error: "Website submission not found." }, { status: 404 });
    const enquiry = data;
    const storedClientId = typeof enquiry.metadata?.clientId === "string" ? enquiry.metadata.clientId : undefined;
    const targetClientId = storedClientId && getClientForAgency(session.agencyId, storedClientId) ? storedClientId : undefined;
    const sender = resolveCommunicationSender(session.agencyId, senderId, channel, targetClientId);
    if (!sender) return NextResponse.json({ ok: false, error: "The selected send-as account is not available for this client." }, { status: 409 });
    const media = await Promise.all(attachmentTokens.map(async token => {
      const payload = verifyInboxMediaToken(token);
      if (!payload || payload.agencyId !== session.agencyId || payload.targetKind !== "website" || payload.targetId !== enquiry.id) throw new Error("An attachment is invalid or has expired.");
      const content = await readInboxMediaBytes(payload);
      if (!content) throw new Error(`Attachment ${payload.name} could not be loaded.`);
      const attachment: InboxOutboundAttachment = { id: payload.id, name: payload.name, size: payload.size, contentType: payload.contentType, kind: payload.kind, token, url: inboxMediaUrl(new URL(request.url).origin, token) };
      return { attachment, content };
    }));
    const attachments = media.map(item => item.attachment);
    const message = messageInput || `Sent ${attachments.length === 1 ? "an attachment" : `${attachments.length} attachments`}.`;
    const recipient = channel === "email" ? enquiry.email?.trim().toLowerCase() ?? "" : normalisePhone(enquiry.phone ?? "") ?? "";
    if (channel === "email" ? !EMAIL.test(recipient) : !recipient) {
      return NextResponse.json({ ok: false, error: `This enquiry has no valid ${channel === "email" ? "email address" : "phone number"}.` }, { status: 400 });
    }
    if (attachments.length) await claimStagedPrivateUploadsForOwnership({ agencyId: session.agencyId, purpose: "inbox-media", objectIds: attachments.map(item => item.id) });

    const brandName = isTradingBrandSlug(enquiry.brand_slug)
      ? tradingBrandDefinition(enquiry.brand_slug).name
      : enquiry.brand_slug.replaceAll("-", " ");
    const subject = clean(body?.subject, 180) || `Re: Your enquiry with ${brandName}`;
    const sentAt = Date.now();
    const replyId = `reply_${createHash("sha256")
      .update([enquiry.id, channel, sender.id, message, attachments.map(item => item.id).join(","), Math.floor(sentAt / 600_000)].join("\u0000"))
      .digest("hex").slice(0, 24)}`;
    const existingReplies = Array.isArray(enquiry.metadata?.inboxReplies)
      ? enquiry.metadata.inboxReplies.filter(item => item && typeof item === "object") as StoredReply[]
      : [];
    const replay = existingReplies.find(reply => reply.id === replyId && reply.status === "sent");
    if (replay) {
      if (attachments.length) await commitStagedPrivateUploadOwnership({
        agencyId: session.agencyId,
        purpose: "inbox-media",
        objectIds: attachments.map(item => item.id),
        commit: async () => ({ ownerId: replay.id, value: undefined }),
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, reply: replay, replayed: true });
    }

    const result = channel === "email"
      ? await sendTransactionalEmail({
          agencyId: session.agencyId,
          clientId: targetClientId,
          to: recipient,
          fromName: brandName,
          subject,
          bodyText: emailText(enquiry, brandName, message),
          bodyHtml: emailHtml(enquiry, brandName, message),
          externalRef: `website-enquiry:${enquiry.id}:${replyId}`,
          signal: request.signal,
          sender: { provider: sender.provider as "resend" | "smtp", connectionId: sender.connectionId },
          attachments: media.map(item => ({ filename: item.attachment.name, content: item.content, contentType: item.attachment.contentType })),
        })
      : await sendPhoneMessage({ agencyId: session.agencyId, clientId: targetClientId, sender, channel, to: recipient, body: messageInput, mediaUrls: attachments.map(item => item.url), signal: request.signal });
    const reply: StoredReply = {
      id: replyId,
      channel,
      ...(channel === "email" ? { subject } : {}),
      message,
      recipient,
      senderId: sender.id,
      senderLabel: `${sender.label} · ${sender.address}`,
      sentAt,
      sentBy: session.userId,
      status: result.delivered ? "sent" : "failed",
      via: result.via,
      ...(result.externalMessageId ? { externalMessageId: result.externalMessageId } : {}),
      ...(result.reason ? { error: result.reason } : {}),
      attachments,
    };
    const metadata = enquiry.metadata ?? {};
    const nextMetadata = {
      ...metadata,
      inboxReplies: [...existingReplies.filter(item => item.id !== replyId).slice(-199), reply],
      lastOutboundChannel: channel,
      lastOutboundSenderId: sender.id,
      ...(result.delivered ? {
        firstRespondedAt: typeof metadata.firstRespondedAt === "string" ? metadata.firstRespondedAt : new Date(sentAt).toISOString(),
        lastRespondedAt: new Date(sentAt).toISOString(),
        lastRespondedBy: session.userId,
        inboxStatus: metadata.inboxStatus === "resolved" ? "resolved" : "reviewed",
      } : {}),
    };
    const persistReply = async () => {
      const { error: updateError } = await supabase.from("brand_enquiries").update({ metadata: nextMetadata }).eq("id", enquiry.id);
      if (updateError) throw new Error(`Could not record the communication: ${updateError.message}`);
    };
    if (attachments.length) {
      await commitStagedPrivateUploadOwnership({
        agencyId: session.agencyId,
        purpose: "inbox-media",
        objectIds: attachments.map(item => item.id),
        commit: async () => {
          await persistReply();
          return { ownerId: reply.id, value: undefined };
        },
      });
    } else {
      await persistReply();
    }
    if (result.delivered) await recordWebsiteEnquiryLeadContact({
      agencyId: session.agencyId,
      leadId: typeof metadata.leadId === "string" ? metadata.leadId : undefined,
      actorUserId: session.userId,
      channel,
      outcome: "sent",
      note: message,
      at: sentAt,
      incrementSentCount: true,
    });
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "inbox",
      action: result.delivered ? `website-enquiry.${channel}-sent` : `website-enquiry.${channel}-failed`,
      message: result.delivered ? `Sent ${channel} to ${enquiry.name} as ${sender.label}.` : `${channel} to ${enquiry.name} failed from ${sender.label}.`,
      metadata: { enquiryId: enquiry.id, replyId, channel, senderId: sender.id, recipient, error: result.reason },
    });
    await flushPendingWrites();
    if (!result.delivered) return NextResponse.json({ ok: false, error: result.reason || "The message could not be delivered.", reply }, { status: result.via === "unconfigured" ? 503 : 502 });
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    if (error instanceof PrivateObjectLifecycleClaimError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 409 });
    }
    try { return authErrorResponse(error); } catch {
      console.error("[website-enquiries] communication failed", error);
      return NextResponse.json({ ok: false, error: "The message could not be sent." }, { status: 500 });
    }
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function emailText(enquiry: EnquiryRow, brandName: string, message: string): string {
  return [`Hello ${enquiry.name},`, "", message, "", `Sent by ${brandName} through AquaCRM.`, ...(enquiry.message ? ["", "Your original message:", enquiry.message] : [])].join("\n");
}

function emailHtml(enquiry: EnquiryRow, brandName: string, message: string): string {
  return `<div style="font-family:Arial,sans-serif;background:#f5f6f6;padding:28px;color:#202221"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #dfe3e2;padding:28px"><p style="margin:0 0 20px;color:#087f8c;font-size:13px;font-weight:700">${escapeHtml(brandName)}</p><p>Hello ${escapeHtml(enquiry.name)},</p><p style="white-space:pre-wrap;line-height:1.65">${escapeHtml(message)}</p>${enquiry.message ? `<div style="margin-top:28px;border-top:1px solid #e5e7e6;padding-top:18px;color:#686e6c;font-size:13px"><strong>Your original message</strong><p style="white-space:pre-wrap;line-height:1.55">${escapeHtml(enquiry.message)}</p></div>` : ""}</div></div>`;
}
