import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("brand_enquiries").select("metadata").eq("id", enquiryId).maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, error: "Recording not found." }, { status: 404 });
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
    if (recording.size) headers.set("content-length", String(recording.size));

    if (recording.storageProvider === "supabase") {
      if (!recording.storageKey.startsWith(`inbox-calls/${session.agencyId}/`)) return notFound();
      const stored = await readSupabasePrivateUpload(recording.storageKey);
      return stored ? new Response(stored, { headers }) : notFound();
    }
    if (recording.storageProvider === "vercel-blob") {
      let pathname = "";
      try { pathname = new URL(recording.storageKey).pathname; } catch { return notFound(); }
      if (!pathname.includes(`/inbox-calls/${session.agencyId}/`)) return notFound();
      const result = await get(recording.storageKey, { access: "private" });
      return result?.statusCode === 200 && result.stream ? new Response(result.stream, { headers }) : notFound();
    }
    if (recording.storageProvider !== "local") return notFound();
    const root = resolve(process.cwd(), ".data", "inbox-call-recordings", session.agencyId);
    const path = resolve(process.cwd(), ".data", "inbox-call-recordings", recording.storageKey);
    if (!path.startsWith(`${root}/`)) return notFound();
    try { return new Response(await readFile(path), { headers }); } catch { return notFound(); }
  } catch (error) {
    return authErrorResponse(error);
  }
}

function notFound() {
  return NextResponse.json({ ok: false, error: "Recording not found." }, { status: 404 });
}
