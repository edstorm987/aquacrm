import { NextResponse, type NextRequest } from "next/server";

import { readInboxMedia, verifyInboxMediaToken } from "@/lib/server/inbox/inboxMedia";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = verifyInboxMediaToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!payload) return NextResponse.json({ ok: false, error: "Attachment link is invalid or expired." }, { status: 404 });
  const stored = await readInboxMedia(payload);
  if (!stored) return NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });
  const headers = new Headers({
    "content-type": payload.contentType || "application/octet-stream",
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(payload.name)}`,
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
  });
  headers.set("content-length", String(payload.size));
  const body = stored instanceof Blob ? stored : new Uint8Array(stored);
  return new Response(body, { status: 200, headers });
}
