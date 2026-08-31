import { resolve } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  privateMediaResponse,
  readLocalFileRange,
  readVercelBlobRange,
  type ByteRange,
} from "@/lib/server/privateMediaResponse";
import { readSupabasePrivateUploadRange } from "@/lib/server/privateUploadStorage";
import { getSop } from "@/engines/sop/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type SopDocument } from "@/server/types";

export const runtime = "nodejs";

function headersFor(sop: SopDocument): Headers {
  const headers = new Headers();
  headers.set("content-type", sop.contentType || "application/octet-stream");
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(sop.fileName || sop.title)}`);
  headers.set("cache-control", "private, max-age=60");
  headers.set("x-content-type-options", "nosniff");
  if (sop.size) headers.set("content-length", String(sop.size));
  return headers;
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const sop = getSop(session.agencyId, id);
    if (!sop?.storageProvider || !sop.storageKey) {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }

    // Training media is accepted up to 250 MB, so a seek must move bytes, not
    // the whole object: every provider answers through the shared contract.
    let read: ((range: ByteRange | null) => Promise<BodyInit | null>) | null = null;
    if (sop.storageProvider === "supabase") {
      read = range => readSupabasePrivateUploadRange(sop.storageKey!, range);
    } else if (sop.storageProvider === "vercel-blob") {
      read = range => readVercelBlobRange(sop.storageKey!, range);
    } else {
      const uploadRoot = resolve(process.cwd(), ".data", "sop-uploads");
      const targetPath = resolve(uploadRoot, sop.storageKey);
      if (targetPath.startsWith(`${uploadRoot}/`)) read = range => readLocalFileRange(targetPath, range);
    }
    const response = read
      ? await privateMediaResponse({
        rangeHeader: request.headers.get("range"),
        size: typeof sop.size === "number" && Number.isInteger(sop.size) && sop.size > 0 ? sop.size : null,
        headers: headersFor(sop),
        read,
      })
      : null;
    return response ?? NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
