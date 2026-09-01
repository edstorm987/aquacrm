import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { beginStagedPrivateUpload, confirmStagedPrivateUpload, privateObjectRequestHash } from "@/lib/server/privateObjectLifecycle";
import { planPrivateUpload, PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import type { ExpenseAttachment } from "@/built-ins/modules/agency-finance/src/lib/domain";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
]);

function safeName(value: string): string {
  return value.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "expense-file";
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "Each file must be smaller than 8 MB." }, { status: 413 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ ok: false, error: "Upload a PDF, document, spreadsheet, text file, or image." }, { status: 415 });
    }

    const id = `exa_${crypto.randomBytes(8).toString("hex")}`;
    const filename = safeName(file.name);
    const pathname = `expenses/${session.agencyId}/${id}-${filename}`;
    const relativeKey = join(session.agencyId, `${id}-${filename}`);
    const requestHash = privateObjectRequestHash([session.agencyId, id, file.name, file.size, file.type, pathname]);
    const planned = planPrivateUpload({ pathname, localKey: relativeKey });
    await beginStagedPrivateUpload({
      agencyId: session.agencyId,
      purpose: "expense-attachment",
      objectId: id,
      requestHash,
      planned,
      localDirectory: "expense-uploads",
    });
    const stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "expense-uploads",
      localKey: relativeKey,
    });
    await confirmStagedPrivateUpload({ agencyId: session.agencyId, purpose: "expense-attachment", objectId: id, requestHash, stored });

    const params = new URLSearchParams({
      id,
      name: file.name.trim().slice(0, 180),
      type: file.type,
      size: String(file.size),
      provider: stored.storageProvider,
      key: stored.storageKey,
    });
    const attachment: ExpenseAttachment = {
      id,
      name: file.name.trim().slice(0, 180),
      url: `/api/portal/finance/expense-attachments/content?${params.toString()}`,
      size: file.size,
      contentType: file.type,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      uploadedAt: Date.now(),
    };
    return NextResponse.json({ ok: true, attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    return authErrorResponse(error);
  }
}
