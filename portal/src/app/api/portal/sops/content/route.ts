import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { getSop } from "@/server/sops";
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

    if (sop.storageProvider === "supabase") {
      const stored = await readSupabasePrivateUpload(sop.storageKey);
      if (!stored) return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
      return new Response(stored, { status: 200, headers: headersFor(sop) });
    }

    if (sop.storageProvider === "vercel-blob") {
      const result = await get(sop.storageKey, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
      }
      return new Response(result.stream, { status: 200, headers: headersFor(sop) });
    }

    const uploadRoot = resolve(process.cwd(), ".data", "sop-uploads");
    const targetPath = resolve(uploadRoot, sop.storageKey);
    if (!targetPath.startsWith(`${uploadRoot}/`)) {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
    try {
      return new Response(await readFile(targetPath), { status: 200, headers: headersFor(sop) });
    } catch {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
