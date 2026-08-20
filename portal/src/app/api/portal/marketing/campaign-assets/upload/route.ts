import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose an image." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_SIZE) {
      return NextResponse.json({ ok: false, error: "Images must be smaller than 20 MB." }, { status: 413 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ ok: false, error: "Upload a JPG, PNG, WebP or GIF image." }, { status: 415 });
    }

    const id = `creative_${crypto.randomBytes(8).toString("hex")}`;
    const safeName = file.name
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 160) || "campaign-image";
    const pathname = `campaigns/${session.agencyId}/${id}-${safeName}`;
    const localKey = join(session.agencyId, `${id}-${safeName}`);
    const stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "campaign-assets",
      localKey,
    });

    return NextResponse.json({
      ok: true,
      asset: {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    return authErrorResponse(error);
  }
}
