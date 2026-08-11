import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createFileSop } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import type { SopDocument } from "@/server/types";

export const runtime = "nodejs";

const MB = 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
  "application/x-iwork-keynote-sffkey",
  "application/vnd.apple.keynote",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/mpeg",
  "video/x-m4v",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "text/csv",
  "text/markdown",
  "text/plain",
]);
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "md",
  "jpg", "jpeg", "png", "webp", "gif",
  "ppt", "pptx", "odp", "key",
  "mp4", "mov", "webm", "mpeg", "mpg", "m4v",
  "mp3", "m4a", "wav", "ogg",
]);

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function resourceTypeFor(file: File): NonNullable<SopDocument["resourceType"]> {
  const extension = extensionOf(file.name);
  if (file.type.startsWith("video/") || ["mp4", "mov", "webm", "mpeg", "mpg", "m4v"].includes(extension)) return "video";
  if (file.type.startsWith("audio/") || ["mp3", "m4a", "wav", "ogg"].includes(extension)) return "audio";
  if (["ppt", "pptx", "odp", "key"].includes(extension) || file.type.includes("presentation") || file.type.includes("powerpoint") || file.type.includes("keynote")) return "presentation";
  if (file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) return "image";
  if (["xls", "xlsx", "csv"].includes(extension) || file.type.includes("spreadsheet") || file.type.includes("excel")) return "spreadsheet";
  return "document";
}

function maximumBytes(resourceType: NonNullable<SopDocument["resourceType"]>): number {
  if (resourceType === "video") return 250 * MB;
  if (resourceType === "audio" || resourceType === "presentation") return 100 * MB;
  return 25 * MB;
}

function safeName(value: string): string {
  return value.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "sop-file";
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    }
    const extension = extensionOf(file.name);
    if (!ALLOWED_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ ok: false, error: "this file type is not supported" }, { status: 415 });
    }
    const resourceType = resourceTypeFor(file);
    const maxBytes = maximumBytes(resourceType);
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json({ ok: false, error: `${resourceType} files must be smaller than ${Math.round(maxBytes / MB)} MB` }, { status: 413 });
    }

    const id = `sop_${crypto.randomBytes(8).toString("hex")}`;
    const filename = safeName(file.name);
    const pathname = `sops/${session.agencyId}/${id}-${filename}`;
    const relativeKey = join(session.agencyId, `${id}-${filename}`);
    const stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "sop-uploads",
      localKey: relativeKey,
    });

    const title = typeof form?.get("title") === "string" && String(form.get("title")).trim()
      ? String(form.get("title")).trim().slice(0, 240)
      : file.name.replace(/\.[^.]+$/, "").trim().slice(0, 240);
    const category = typeof form?.get("category") === "string"
      ? String(form.get("category")).trim().slice(0, 80) || undefined
      : undefined;
    const tags = typeof form?.get("tags") === "string"
      ? String(form.get("tags")).split(",").map(tag => tag.trim()).filter(Boolean)
      : [];
    const categories = form?.getAll("categories")
      .filter((value): value is string => typeof value === "string")
      .map(value => value.trim())
      .filter(Boolean) ?? [];
    const sop = createFileSop({
      id,
      agencyId: session.agencyId,
      title,
      category,
      categories,
      tags,
      resourceType,
      fileName: file.name.trim().slice(0, 180),
      contentType: file.type,
      size: file.size,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      createdBy: session.userId,
    });
    return NextResponse.json({ ok: true, sop }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    return authErrorResponse(error);
  }
}
