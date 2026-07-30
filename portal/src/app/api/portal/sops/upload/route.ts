import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createFileSop } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

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
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "files must be smaller than 8 MB" }, { status: 413 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ ok: false, error: "this file type is not supported" }, { status: 415 });
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
    const sop = createFileSop({
      id,
      agencyId: session.agencyId,
      title,
      category,
      tags,
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
