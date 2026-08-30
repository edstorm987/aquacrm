import { NextResponse, type NextRequest } from "next/server";

import { readInboxMedia, verifyInboxMediaToken } from "@/lib/server/inbox/inboxMedia";
import { privateMediaResponse } from "@/lib/server/privateMediaResponse";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = verifyInboxMediaToken(request.nextUrl.searchParams.get("token") ?? "");
  if (!payload) return NextResponse.json({ ok: false, error: "Attachment link is invalid or expired." }, { status: 404 });
  const headers = new Headers({
    "content-type": payload.contentType || "application/octet-stream",
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(payload.name)}`,
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
  });
  // Voice notes mount as `<audio preload="metadata">`, so the range contract is
  // what makes a seek cheap instead of a whole-attachment download.
  const response = await privateMediaResponse({
    rangeHeader: request.headers.get("range"),
    size: Number.isInteger(payload.size) ? payload.size : null,
    headers,
    read: range => readInboxMedia(payload, range),
  });
  return response ?? NextResponse.json({ ok: false, error: "Attachment not found." }, { status: 404 });
}
