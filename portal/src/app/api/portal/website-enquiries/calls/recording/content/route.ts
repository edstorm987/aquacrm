import { resolve } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  privateMediaResponse,
  readLocalFileRange,
  readVercelBlobRange,
  type ByteRange,
} from "@/lib/server/privateMediaResponse";
import { readSupabasePrivateUploadRange } from "@/lib/server/privateUploadStorage";
import { createScopedSupabaseClient } from "@/lib/supabase/scoped";
import { loadOwnedEnquiry } from "@/lib/supabase/ownedEnquiry";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

type Recording = { fileName: string; contentType: string; size: number; storageProvider: string; storageKey: string };

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const enquiryId = request.nextUrl.searchParams.get("enquiryId")?.trim() ?? "";
    const callId = request.nextUrl.searchParams.get("callId")?.trim() ?? "";
    if (!enquiryId || !callId) return NextResponse.json({ ok: false, error: "Recording not found." }, { status: 404 });
    const supabase = await createScopedSupabaseClient();
    // Ownership-guarded so another agency's recording cannot be streamed by id;
    // a foreign enquiry returns null exactly as a missing one.
    const data = await loadOwnedEnquiry(supabase, { id: enquiryId, agencyId: session.agencyId });
    if (!data) return NextResponse.json({ ok: false, error: "Recording not found." }, { status: 404 });
    const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
    const calls = Array.isArray(metadata.inboxCalls) ? metadata.inboxCalls as Array<Record<string, unknown>> : [];
    const call = calls.find(item => item && item.id === callId);
    const recording = call?.recording && typeof call.recording === "object" ? call.recording as Recording : null;
    if (!recording?.storageKey) return NextResponse.json({ ok: false, error: "Recording not found." }, { status: 404 });
    const headers = new Headers({
      "content-type": recording.contentType || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(recording.fileName || "call-recording")}`,
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    });

    // The player mounts with `preload="metadata"` and seeks, so the range
    // contract is shared with every other private-media route.
    let read: ((range: ByteRange | null) => Promise<BodyInit | null>) | null = null;
    if (recording.storageProvider === "supabase") {
      if (!recording.storageKey.startsWith(`inbox-calls/${session.agencyId}/`)) return notFound();
      read = range => readSupabasePrivateUploadRange(recording.storageKey, range);
    } else if (recording.storageProvider === "vercel-blob") {
      let pathname = "";
      try { pathname = new URL(recording.storageKey).pathname; } catch { return notFound(); }
      if (!pathname.includes(`/inbox-calls/${session.agencyId}/`)) return notFound();
      read = range => readVercelBlobRange(recording.storageKey, range);
    } else if (recording.storageProvider === "local") {
      const root = resolve(process.cwd(), ".data", "inbox-call-recordings", session.agencyId);
      const path = resolve(process.cwd(), ".data", "inbox-call-recordings", recording.storageKey);
      if (!path.startsWith(`${root}/`)) return notFound();
      read = range => readLocalFileRange(path, range);
    }
    if (!read) return notFound();
    const response = await privateMediaResponse({
      rangeHeader: request.headers.get("range"),
      size: Number.isInteger(recording.size) && recording.size > 0 ? recording.size : null,
      headers,
      read,
    });
    return response ?? notFound();
  } catch (error) {
    return authErrorResponse(error);
  }
}

function notFound() {
  return NextResponse.json({ ok: false, error: "Recording not found." }, { status: 404 });
}
