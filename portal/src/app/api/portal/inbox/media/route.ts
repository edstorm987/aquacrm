import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import type { InboxOutboundAttachment, InboxOutboundAttachmentKind } from "@/lib/inbox/media";
import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { getInboxConversation } from "@/lib/server/inbox/inboxStore";
import { inboxMediaUrl, signInboxMediaToken, type InboxMediaTargetKind } from "@/lib/server/inbox/inboxMedia";
import { PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = /^(?:image\/(?:jpeg|png|webp|gif|heic|heif)|audio\/(?:webm|mpeg|mp4|ogg|wav|x-wav|aac)|video\/(?:mp4|webm|quicktime)|application\/(?:pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/(?:plain|csv))$/i;

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const targetKind = form?.get("targetKind");
    const targetId = String(form?.get("targetId") ?? "").trim().slice(0, 180);
    if (!(file instanceof File) || (targetKind !== "website" && targetKind !== "social" && targetKind !== "client") || !targetId) return NextResponse.json({ ok: false, error: "A conversation and file are required." }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: "Attachments must be smaller than 20 MB." }, { status: 413 });
    if (!ALLOWED_TYPES.test(file.type)) return NextResponse.json({ ok: false, error: "Upload an image, audio note, video, PDF, document, spreadsheet or text file." }, { status: 415 });
    if (!await targetExists(session.agencyId, targetKind, targetId)) return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });

    const id = `ima_${crypto.randomBytes(10).toString("hex")}`;
    const name = safeName(file.name);
    const localKey = join(session.agencyId, targetKind, targetId, `${id}-${name}`);
    const stored = await storePrivateUpload({
      pathname: `inbox-media/${session.agencyId}/${targetKind}/${targetId}/${id}-${name}`,
      file,
      contentType: file.type,
      localDirectory: "inbox-media",
      localKey,
    });
    const kind = attachmentKind(file.type);
    const token = signInboxMediaToken({ agencyId: session.agencyId, targetKind, targetId, id, name: file.name.slice(0, 180), size: file.size, contentType: file.type, kind, storageProvider: stored.storageProvider, storageKey: stored.storageKey });
    const attachment: InboxOutboundAttachment = { id, name: file.name.slice(0, 180), size: file.size, contentType: file.type, kind, token, url: inboxMediaUrl(request.nextUrl.origin, token) };
    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    return authErrorResponse(error);
  }
}

async function targetExists(agencyId: string, kind: InboxMediaTargetKind, targetId: string): Promise<boolean> {
  if (kind === "social") return Boolean(await getInboxConversation(agencyId, targetId));
  if (kind === "client") {
    const separator = targetId.indexOf(":");
    if (separator < 1) return false;
    const client = getClientForAgency(agencyId, targetId.slice(0, separator));
    const requestId = targetId.slice(separator + 1);
    const requests = Array.isArray(client?.metadata?.clientRequests) ? client.metadata.clientRequests : [];
    return requests.some(item => item && typeof item === "object" && (item as { id?: unknown }).id === requestId);
  }
  const { data } = await createSupabaseAdminClient().from("brand_enquiries").select("id").eq("id", targetId).maybeSingle();
  return Boolean(data);
}

function attachmentKind(contentType: string): InboxOutboundAttachmentKind {
  return contentType.startsWith("image/") ? "image" : contentType.startsWith("audio/") ? "audio" : contentType.startsWith("video/") ? "video" : "file";
}

function safeName(value: string): string { return value.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "inbox-file"; }
