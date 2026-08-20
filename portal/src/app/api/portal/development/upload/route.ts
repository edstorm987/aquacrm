import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createDevelopmentResource, publicDevelopmentResource } from "@/server/developmentToolkit";
import { ensureHydrated } from "@/server/storage";
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
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file." }, { status: 400 });
    if (!file.size || file.size > MAX) return NextResponse.json({ ok: false, error: "Files must be smaller than 25 MB." }, { status: 413 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ ok: false, error: "Upload an image, PDF, document, presentation, text, JSON or ZIP file." }, { status: 415 });

    const id = `devfile_${crypto.randomBytes(8).toString("hex")}`;
    const safeName = file.name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 160) || "resource";
    const pathname = `development/${session.agencyId}/${id}-${safeName}`;
    const relative = join(session.agencyId, `${id}-${safeName}`);
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
    const resource = createDevelopmentResource(session.agencyId, {
      kind,
      title: String(form?.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, ""),
      description: String(form?.get("description") ?? ""),
      category: String(form?.get("category") ?? ""),
      tags,
      workflowStageIds,
      visibility: form?.get("visibility") === "private" ? "private" : "team",
      file: { fileName: file.name, contentType: file.type, size: file.size, storageProvider: stored.storageProvider, storageKey: stored.storageKey },
    }, session.userId);
    return NextResponse.json({ ok: true, resource: publicDevelopmentResource(resource) }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    return authErrorResponse(error);
  }
}
