import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { ensureHydrated } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider");
    const storageKey = url.searchParams.get("key") ?? "";
    const contentType = url.searchParams.get("type") || "application/octet-stream";
    const fileName = (url.searchParams.get("name") || "campaign-image").replaceAll('"', "");
    if (!storageKey || !isCampaignAssetKey(storageKey, session.agencyId, provider)) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    }

    if (provider === "supabase") {
      const stored = await readSupabasePrivateUpload(storageKey);
      if (!stored) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
      return new NextResponse(stored, { headers: fileHeaders(contentType, fileName) });
    }

    if (provider === "vercel-blob") {
      const result = await get(storageKey, { access: "private", useCache: false });
      if (!result) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
      return new NextResponse(result.stream, { headers: fileHeaders(contentType, fileName) });
    }

    if (provider === "local") {
      const root = resolve(process.cwd(), ".data", "campaign-assets");
      const path = resolve(root, storageKey);
      if (!path.startsWith(`${root}/`)) {
        return NextResponse.json({ ok: false, error: "Invalid file." }, { status: 400 });
      }
      const bytes = await readFile(path).catch(() => null);
      if (!bytes) return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
      return new NextResponse(bytes, { headers: fileHeaders(contentType, fileName) });
    }

    return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function isCampaignAssetKey(storageKey: string, agencyId: string, provider: string | null): boolean {
  if (provider === "local") return storageKey.startsWith(`${agencyId}/creative_`);
  if (provider === "supabase") return storageKey.startsWith(`campaigns/${agencyId}/creative_`);
  if (provider === "vercel-blob") {
    try {
      return new URL(storageKey).pathname.includes(`/campaigns/${agencyId}/creative_`);
    } catch {
      return false;
    }
  }
  return false;
}

function fileHeaders(contentType: string, fileName: string): HeadersInit {
  return {
    "content-type": contentType,
    "content-disposition": `inline; filename="${fileName}"`,
    "cache-control": "private, no-store",
  };
}
