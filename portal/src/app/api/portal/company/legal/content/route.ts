import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { getLegalDocument } from "@/server/legalDocuments";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const document = getLegalDocument(session.agencyId, id);
    if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    const headers = new Headers({
      "content-type": document.contentType || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    });
    if (document.storageProvider === "supabase") {
      const stored = await readSupabasePrivateUpload(document.storageKey);
      if (!stored) return NextResponse.json({ ok: false, error: "Stored file not found." }, { status: 404 });
      return new Response(stored, { headers });
    }
    if (document.storageProvider === "vercel-blob") {
      const result = await get(document.storageKey, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return NextResponse.json({ ok: false, error: "Stored file not found." }, { status: 404 });
      return new Response(result.stream, { headers });
    }
    const root = resolve(process.cwd(), ".data", "legal-uploads");
    const path = resolve(root, document.storageKey);
    if (!path.startsWith(`${root}/`)) return NextResponse.json({ ok: false, error: "Stored file not found." }, { status: 404 });
    return new Response(await readFile(path), { headers });
  } catch (error) { return authErrorResponse(error); }
}
