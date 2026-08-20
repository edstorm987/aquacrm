import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { del } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { deleteSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createWrittenSop, deleteSopRecord, listSops, updateSop } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export const runtime = "nodejs";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    return NextResponse.json({ ok: true, sops: listSops(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as {
      title?: string;
      content?: string;
      category?: string;
      categories?: string[];
      tags?: string[];
    } | null;
    if (!body?.title?.trim()) {
      return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    }
    const sop = createWrittenSop({
      agencyId: session.agencyId,
      title: body.title,
      content: body.content ?? "",
      category: body.category,
      categories: body.categories,
      tags: body.tags,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, sop }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as {
      id?: string;
      title?: string;
      content?: string;
      category?: string;
      categories?: string[];
      tags?: string[];
    } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...patch } = body;
    const sop = updateSop(session.agencyId, id, patch, session.userId);
    return sop
      ? NextResponse.json({ ok: true, sop })
      : NextResponse.json({ ok: false, error: "SOP not found" }, { status: 404 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const sop = deleteSopRecord(session.agencyId, id);
    if (!sop) return NextResponse.json({ ok: false, error: "SOP not found" }, { status: 404 });

    if (sop.storageProvider === "supabase" && sop.storageKey) {
      await deleteSupabasePrivateUpload(sop.storageKey).catch(() => false);
    }
    if (sop.storageProvider === "vercel-blob" && sop.storageKey) {
      await del(sop.storageKey).catch(() => undefined);
    }
    if (sop.storageProvider === "local" && sop.storageKey) {
      const uploadRoot = resolve(process.cwd(), ".data", "sop-uploads");
      const targetPath = resolve(uploadRoot, sop.storageKey);
      if (targetPath.startsWith(`${uploadRoot}/`)) await unlink(targetPath).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
