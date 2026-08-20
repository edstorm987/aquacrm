import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { initiatePhoneCall, resolveCommunicationSender } from "@/lib/server/email/outboundCommunications";
import { recordWebsiteEnquiryLeadContact } from "@/lib/server/websiteEnquiryLeadSync";
import { createScopedSupabaseClient, type ScopedSupabaseClient } from "@/lib/supabase/scoped";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { WebsiteEnquiryCall } from "@/lib/server/websiteEnquiries";

type EnquiryRow = {
  id: string;
  name: string;
  phone: string | null;
  metadata: Record<string, unknown> | null;
};

const OUTCOMES = new Set<NonNullable<WebsiteEnquiryCall["outcome"]>>(["connected", "voicemail", "no-answer", "follow-up", "wrong-number"]);

export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json().catch(() => null) as { enquiryId?: unknown; senderId?: unknown; recordingConsent?: unknown } | null;
    const enquiryId = clean(body?.enquiryId, 160);
    const senderId = clean(body?.senderId, 240);
    if (!enquiryId || !senderId) return NextResponse.json({ ok: false, error: "Enquiry and call identity are required." }, { status: 400 });
    const sender = resolveCommunicationSender(session.agencyId, senderId, "call");
    if (!sender) return NextResponse.json({ ok: false, error: "The selected call identity is not available." }, { status: 409 });
    const { supabase, enquiry } = await loadEnquiry(enquiryId);
    if (!enquiry.phone?.trim()) return NextResponse.json({ ok: false, error: "This enquiry has no phone number." }, { status: 400 });
    const initiation = await initiatePhoneCall({ agencyId: session.agencyId, sender, customerPhone: enquiry.phone });
    if (initiation.reason) return NextResponse.json({ ok: false, error: initiation.reason }, { status: 502 });

    const metadata = enquiry.metadata ?? {};
    const calls = readCalls(metadata);
    const now = Date.now();
    const call: WebsiteEnquiryCall = {
      id: `call_${crypto.randomBytes(10).toString("hex")}`,
      phone: enquiry.phone.trim(),
      senderId: sender.id,
      senderLabel: sender.label,
      startedAt: now,
      status: "in-progress",
      createdBy: session.userId,
      via: initiation.via,
      externalCallId: initiation.externalCallId,
    };
    const { error } = await supabase.from("brand_enquiries").update({
      metadata: {
        ...metadata,
        inboxCalls: [...calls.filter(item => item.id !== call.id).slice(-199), call],
        activeCallId: call.id,
        activeCallRecordingConsent: body?.recordingConsent === true,
      },
    }).eq("id", enquiry.id);
    if (error) throw new Error(`Could not start call mode: ${error.message}`);
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "inbox",
      action: "website-enquiry.call-started",
      message: `Started call mode for ${enquiry.name} using ${sender.label}.`,
      metadata: { enquiryId: enquiry.id, callId: call.id, senderId: sender.id, via: initiation.via, externalCallId: initiation.externalCallId, recordingConsent: body?.recordingConsent === true },
    });
    return NextResponse.json({ ok: true, call });
  } catch (error) {
    try { return authErrorResponse(error); } catch {
      console.error("[website-enquiries] call start failed", error);
      return NextResponse.json({ ok: false, error: "Call mode could not be started." }, { status: 500 });
    }
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const body = await request.json().catch(() => null) as {
      enquiryId?: unknown;
      callId?: unknown;
      outcome?: unknown;
      notes?: unknown;
      followUpAt?: unknown;
    } | null;
    const enquiryId = clean(body?.enquiryId, 160);
    const callId = clean(body?.callId, 160);
    const outcome = clean(body?.outcome, 40) as WebsiteEnquiryCall["outcome"];
    if (!enquiryId || !callId || !outcome || !OUTCOMES.has(outcome)) {
      return NextResponse.json({ ok: false, error: "Enquiry, call and outcome are required." }, { status: 400 });
    }
    const { supabase, enquiry } = await loadEnquiry(enquiryId);
    const metadata = enquiry.metadata ?? {};
    const calls = readCalls(metadata);
    const existing = calls.find(call => call.id === callId);
    if (!existing) return NextResponse.json({ ok: false, error: "Call record not found." }, { status: 404 });
    const endedAt = Date.now();
    const followUpAt = typeof body?.followUpAt === "number" && Number.isFinite(body.followUpAt) && body.followUpAt > endedAt
      ? body.followUpAt
      : undefined;
    const call: WebsiteEnquiryCall = {
      ...existing,
      endedAt,
      durationSeconds: Math.max(0, Math.round((endedAt - existing.startedAt) / 1_000)),
      status: "completed",
      outcome,
      notes: clean(body?.notes, 8_000) || undefined,
      followUpAt,
    };
    const { error } = await supabase.from("brand_enquiries").update({
      metadata: {
        ...metadata,
        inboxCalls: calls.map(item => item.id === call.id ? call : item),
        activeCallId: undefined,
        activeCallRecordingConsent: undefined,
        firstRespondedAt: typeof metadata.firstRespondedAt === "string" ? metadata.firstRespondedAt : new Date(endedAt).toISOString(),
        lastRespondedAt: new Date(endedAt).toISOString(),
        lastRespondedBy: session.userId,
        inboxStatus: metadata.inboxStatus === "resolved" ? "resolved" : "reviewed",
      },
    }).eq("id", enquiry.id);
    if (error) throw new Error(`Could not save call: ${error.message}`);
    await recordWebsiteEnquiryLeadContact({
      agencyId: session.agencyId,
      leadId: typeof metadata.leadId === "string" ? metadata.leadId : undefined,
      actorUserId: session.userId,
      channel: "call",
      outcome,
      note: call.notes,
      at: endedAt,
    });
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "inbox",
      action: "website-enquiry.call-completed",
      message: `Logged ${formatOutcome(outcome)} call with ${enquiry.name}.`,
      metadata: { enquiryId: enquiry.id, callId: call.id, durationSeconds: call.durationSeconds, followUpAt },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, call });
  } catch (error) {
    try { return authErrorResponse(error); } catch {
      console.error("[website-enquiries] call completion failed", error);
      return NextResponse.json({ ok: false, error: "The call record could not be saved." }, { status: 500 });
    }
  }
}

async function loadEnquiry(id: string): Promise<{ supabase: ScopedSupabaseClient; enquiry: EnquiryRow }> {
  const supabase = await createScopedSupabaseClient();
  const { data, error } = await supabase.from("brand_enquiries").select("id, name, phone, metadata").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load website enquiry: ${error.message}`);
  if (!data) throw new Error("website_enquiry_not_found");
  return { supabase, enquiry: data as EnquiryRow };
}

function readCalls(metadata: Record<string, unknown>): WebsiteEnquiryCall[] {
  return Array.isArray(metadata.inboxCalls)
    ? metadata.inboxCalls.filter((item): item is WebsiteEnquiryCall => Boolean(item && typeof item === "object" && typeof (item as WebsiteEnquiryCall).id === "string"))
    : [];
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function formatOutcome(value: string): string {
  return value.replaceAll("-", " ");
}
