import { join } from "node:path";

import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { attachStoredPrivateUpload, PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createScopedSupabaseClient } from "@/lib/supabase/scoped";
import { loadOwnedEnquiry } from "@/lib/supabase/ownedEnquiry";
import { logActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-wav"]);

export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const form = await request.formData().catch(() => null);
    const enquiryId = clean(form?.get("enquiryId"), 160);
    const callId = clean(form?.get("callId"), 160);
    const consentConfirmed = form?.get("consentConfirmed") === "true";
    const file = form?.get("file");
    if (!enquiryId || !callId || !consentConfirmed || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Call, recording and confirmed permission are required." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_RECORDING_BYTES) return NextResponse.json({ ok: false, error: "Call recordings must be smaller than 100 MB." }, { status: 413 });
    if (!AUDIO_TYPES.has(file.type)) return NextResponse.json({ ok: false, error: "This audio recording format is not supported." }, { status: 415 });

    const supabase = await createScopedSupabaseClient();
    const data = await loadOwnedEnquiry<{ id: string; name: string; metadata: Record<string, unknown> | null }>(
      supabase, { id: enquiryId, agencyId: session.agencyId, columns: ["name"] });
    if (!data) return NextResponse.json({ ok: false, error: "Website submission not found." }, { status: 404 });
    const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
    if (metadata.activeCallRecordingConsent !== true) {
      return NextResponse.json({ ok: false, error: "Recording permission was not confirmed when call mode began." }, { status: 409 });
    }
    const calls = Array.isArray(metadata.inboxCalls) ? metadata.inboxCalls.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [];
    const call = calls.find(item => item.id === callId);
    if (!call) return NextResponse.json({ ok: false, error: "Call record not found." }, { status: 404 });

    const extension = file.type.includes("mp4") ? "m4a" : file.type.includes("ogg") ? "ogg" : file.type.includes("mpeg") ? "mp3" : file.type.includes("wav") ? "wav" : "webm";
    const fileName = `call-${new Date(Number(call.startedAt) || Date.now()).toISOString().replace(/[:.]/g, "-")}.${extension}`;
    const pathname = `inbox-calls/${session.agencyId}/${enquiryId}/${callId}-${fileName}`;
    const relativeKey = join(session.agencyId, enquiryId, `${callId}-${fileName}`);
    const stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "inbox-call-recordings",
      localKey: relativeKey,
    });
    const recording = {
      url: `/api/portal/website-enquiries/calls/recording/content?enquiryId=${encodeURIComponent(enquiryId)}&callId=${encodeURIComponent(callId)}`,
      fileName,
      contentType: file.type,
      size: file.size,
      consentConfirmed: true as const,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
    };
    const attached = await attachStoredPrivateUpload(stored, "inbox-call-recordings", async () => {
      const { error: updateError } = await supabase.from("brand_enquiries").update({
        metadata: { ...metadata, inboxCalls: calls.map(item => item.id === callId ? { ...item, recording } : item) },
      }).eq("id", enquiryId);
      if (updateError) throw new Error(`Could not attach call recording: ${updateError.message}`);
      return recording;
    });
    if (!attached.ok) {
      return NextResponse.json({
        ok: false,
        error: attached.message,
        code: attached.compensated ? "upload_record_failed" : "upload_orphaned",
        detail: attached.detail,
        storageKey: attached.compensated ? undefined : attached.storageKey,
      }, { status: 500 });
    }
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "inbox",
      action: "website-enquiry.call-recorded",
      message: `Saved a consent-confirmed call recording for ${String(data.name)}.`,
      metadata: { enquiryId, callId, size: file.size, storageProvider: stored.storageProvider },
    });
    return NextResponse.json({ ok: true, recording: { ...attached.value, storageProvider: undefined, storageKey: undefined } }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    try { return authErrorResponse(error); } catch {
      console.error("[website-enquiries] call recording upload failed", error);
      return NextResponse.json({ ok: false, error: "The call recording could not be saved." }, { status: 500 });
    }
  }
}

function clean(value: FormDataEntryValue | null | undefined, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
