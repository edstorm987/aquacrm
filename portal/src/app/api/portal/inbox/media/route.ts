import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import type { InboxOutboundAttachment, InboxOutboundAttachmentKind } from "@/lib/inbox/media";
import { inboxMediaTargetExistsForActor } from "@/lib/server/access/inboxMediaTargetAccess";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { authErrorResponse } from "@/lib/server/auth/auth";
import { inboxMediaUrl, signInboxMediaToken } from "@/lib/server/inbox/inboxMedia";
import { beginStagedPrivateUpload, confirmStagedPrivateUpload, privateObjectRequestHash } from "@/lib/server/privateObjectLifecycle";
import { planPrivateUpload, PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = /^(?:image\/(?:jpeg|png|webp|gif|heic|heif)|audio\/(?:webm|mpeg|mp4|ogg|wav|x-wav|aac)|video\/(?:mp4|webm|quicktime)|application\/(?:pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/(?:plain|csv))$/i;

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentWorkspaceElementAccess("staff", "workspace.inbox", "use");
    const agencyId = actor.resourceAgencyId;
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const targetKind = form?.get("targetKind");
    const targetId = String(form?.get("targetId") ?? "").trim().slice(0, 180);
    if (!(file instanceof File) || (targetKind !== "website" && targetKind !== "social" && targetKind !== "client") || !targetId) return NextResponse.json({ ok: false, error: "A conversation and file are required." }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: "Attachments must be smaller than 20 MB." }, { status: 413 });
    if (!ALLOWED_TYPES.test(file.type)) return NextResponse.json({ ok: false, error: "Upload an image, audio note, video, PDF, document, spreadsheet or text file." }, { status: 415 });
    const id = `ima_${crypto.randomBytes(10).toString("hex")}`;
    const name = safeName(file.name);
    const localKey = join(agencyId, targetKind, targetId, `${id}-${name}`);
    const pathname = `inbox-media/${agencyId}/${targetKind}/${targetId}/${id}-${name}`;
    const requestHash = privateObjectRequestHash([agencyId, targetKind, targetId, id, file.name, file.size, file.type, pathname]);
    const planned = planPrivateUpload({ pathname, localKey });
    // Resolve website, social or client-request ownership from its live store
    // immediately before the first staged-upload write.
    if (!await inboxMediaTargetExistsForActor(actor, targetKind, targetId, "use")) {
      return NextResponse.json({ ok: false, error: "Conversation not found." }, { status: 404 });
    }
    await beginStagedPrivateUpload({
      agencyId,
      purpose: "inbox-media",
      objectId: id,
      requestHash,
      planned,
      localDirectory: "inbox-media",
    });
    const stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "inbox-media",
      localKey,
    });
    await confirmStagedPrivateUpload({ agencyId, purpose: "inbox-media", objectId: id, requestHash, stored });
    const kind = attachmentKind(file.type);
    const token = signInboxMediaToken({ agencyId, targetKind, targetId, id, name: file.name.slice(0, 180), size: file.size, contentType: file.type, kind, storageProvider: stored.storageProvider, storageKey: stored.storageKey });
    const attachment: InboxOutboundAttachment = { id, name: file.name.slice(0, 180), size: file.size, contentType: file.type, kind, token, url: inboxMediaUrl(request.nextUrl.origin, token) };
    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    return authErrorResponse(error);
  }
}

function attachmentKind(contentType: string): InboxOutboundAttachmentKind {
  return contentType.startsWith("image/") ? "image" : contentType.startsWith("audio/") ? "audio" : contentType.startsWith("video/") ? "video" : "file";
}

function safeName(value: string): string { return value.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "inbox-file"; }
