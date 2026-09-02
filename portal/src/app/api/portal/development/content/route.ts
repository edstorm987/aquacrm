import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { authErrorResponse } from "@/lib/server/auth/auth";
import { requireCurrentFulfilmentTechnicalAccess } from "@/lib/server/access/fulfilmentTechnicalAccess";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { getDevelopmentResource } from "@/server/developmentToolkit";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentFulfilmentTechnicalAccess("view");
    const session = actor.session;
    const agencyId = actor.resourceAgencyId;
    const id = new URL(request.url).searchParams.get("id");
    const resource = id ? getDevelopmentResource(agencyId, id) : null;
    if (!resource) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    if (resource.visibility === "private" && resource.createdBy !== session.userId && session.role !== "agency-owner") {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    }
    if (resource.file?.storageProvider === "supabase") {
      const stored = await readSupabasePrivateUpload(resource.file.storageKey);
      if (!stored) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
      return new NextResponse(stored, {
        headers: {
          "content-type": resource.file.contentType,
          "content-disposition": `inline; filename="${resource.file.fileName.replaceAll('"', "")}"`,
          "cache-control": "private, no-store",
        },
      });
    }
    if (resource.file?.storageProvider === "vercel-blob") {
      const result = await get(resource.file.storageKey, { access: "private", useCache: false });
      if (!result) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
      return new NextResponse(result.stream, {
        headers: {
          "content-type": resource.file.contentType,
          "content-disposition": `inline; filename="${resource.file.fileName.replaceAll('"', "")}"`,
          "cache-control": "private, no-store",
        },
      });
    }

    let path: string;
    let contentType: string;
    let fileName: string;
    if (resource.file?.storageProvider === "local") {
      const root = resolve(process.cwd(), ".data", "development-uploads");
      path = resolve(root, resource.file.storageKey);
      if (!path.startsWith(`${root}/`)) return NextResponse.json({ ok: false, error: "Invalid file." }, { status: 400 });
      contentType = resource.file.contentType;
      fileName = resource.file.fileName;
    } else if (resource.localPath) {
      const workspaceRoot = resolve(process.cwd(), "../../..");
      const assetRoot = resolve(process.cwd(), "..", "development-assets");
      path = resolve(workspaceRoot, resource.localPath);
      if (!path.startsWith(`${assetRoot}/`)) return NextResponse.json({ ok: false, error: "Invalid file." }, { status: 400 });
      const extension = extname(path).toLowerCase();
      const imageTypes: Record<string, string> = {
        ".gif": "image/gif",
        ".jpeg": "image/jpeg",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
      };
      contentType = imageTypes[extension] ?? "";
      if (!contentType) return NextResponse.json({ ok: false, error: "File type is not previewable." }, { status: 415 });
      fileName = path.split("/").at(-1) ?? "development-asset";
    } else {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    }
    const bytes = await readFile(path);
    return new NextResponse(bytes, {
      headers: {
        "content-type": contentType,
        "content-disposition": `inline; filename="${fileName.replaceAll('"', "")}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
