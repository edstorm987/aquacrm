import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import { requireCurrentFulfilmentTechnicalAccess } from "@/lib/server/access/fulfilmentTechnicalAccess";
import { attachStoredPrivateUpload, PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createDevelopmentResource, publicDevelopmentResource, rollbackDevelopmentResourceUpload } from "@/server/developmentToolkit";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { DevelopmentResourceKind } from "@/server/types";

export const runtime = "nodejs";
const MAX = 25 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf", "application/zip", "application/json", "text/plain", "text/markdown",
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentFulfilmentTechnicalAccess("use");
    const session = actor.session;
    const agencyId = actor.resourceAgencyId;
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file." }, { status: 400 });
    if (!file.size || file.size > MAX) return NextResponse.json({ ok: false, error: "Files must be smaller than 25 MB." }, { status: 413 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ ok: false, error: "Upload an image, PDF, document, presentation, text, JSON or ZIP file." }, { status: 415 });

    const id = `devfile_${crypto.randomBytes(8).toString("hex")}`;
    const safeName = file.name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 160) || "resource";
    const pathname = `development/${agencyId}/${id}-${safeName}`;
    const relative = join(agencyId, `${id}-${safeName}`);
    const stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "development-uploads",
      localKey: relative,
    });

    const kind = String(form?.get("kind") ?? "inspiration-pack") as DevelopmentResourceKind;
    const tags = String(form?.get("tags") ?? "").split(",").map(value => value.trim()).filter(Boolean);
    const workflowStageIds = String(form?.get("workflowStageIds") ?? "").split(",").map(value => value.trim()).filter(Boolean);
    const attached = await attachStoredPrivateUpload(
      stored,
      "development-uploads",
      () => createDevelopmentResource(agencyId, {
        kind,
        title: String(form?.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, ""),
        description: String(form?.get("description") ?? ""),
        category: String(form?.get("category") ?? ""),
        tags,
        workflowStageIds,
        visibility: form?.get("visibility") === "private" ? "private" : "team",
        file: { fileName: file.name, contentType: file.type, size: file.size, storageProvider: stored.storageProvider, storageKey: stored.storageKey },
      }, session.userId),
      {
        persist: flushPendingWrites,
        rollbackOwner: () => { rollbackDevelopmentResourceUpload(agencyId, stored.storageKey); },
      },
    );
    if (!attached.ok) {
      return NextResponse.json({
        ok: false,
        error: attached.message,
        code: attached.compensated ? "upload_record_failed" : "upload_orphaned",
        detail: attached.detail,
        storageKey: attached.compensated ? undefined : attached.storageKey,
      }, { status: 500 });
    }
    const resource = attached.value;
    return NextResponse.json({ ok: true, resource: publicDevelopmentResource(resource) }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    return authErrorResponse(error);
  }
}
