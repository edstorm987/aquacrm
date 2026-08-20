import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { del } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { deleteSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createInteractiveSop, createWrittenSop, deleteSopRecord, listSops, updateSop } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import type { BlockTreeJSON } from "@/lib/elements";

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
      kind?: string;
      blocks?: BlockTreeJSON;
      category?: string;
      categories?: string[];
      tags?: string[];
    } | null;
    if (!body?.title?.trim()) {
      return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    }
    // Additive: an interactive SOP composed from the element-engine block tree
    // is persisted through `createInteractiveSop`, which validates the tree
    // against the element schema (throws → 400 below). Everything else stays on
    // the written-SOP path exactly as before.
    if (body.kind === "interactive") {
      try {
        const sop = createInteractiveSop({
          agencyId: session.agencyId,
          title: body.title,
          blocks: Array.isArray(body.blocks) ? body.blocks : [],
          category: body.category,
          categories: body.categories,
          tags: body.tags,
          actorUserId: session.userId,
        });
        return NextResponse.json({ ok: true, sop }, { status: 201 });
      } catch (invalid) {
        return NextResponse.json({ ok: false, error: invalid instanceof Error ? invalid.message : "invalid blocks" }, { status: 400 });
      }
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
      blocks?: BlockTreeJSON;
      category?: string;
      categories?: string[];
      tags?: string[];
    } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...patch } = body;
    // `updateSop` only honours `blocks` for an existing interactive SOP, and
    // validates the tree against the element schema (throws on an invalid one).
    try {
      const sop = updateSop(session.agencyId, id, patch, session.userId);
      return sop
        ? NextResponse.json({ ok: true, sop })
        : NextResponse.json({ ok: false, error: "SOP not found" }, { status: 404 });
    } catch (invalid) {
      return NextResponse.json({ ok: false, error: invalid instanceof Error ? invalid.message : "invalid blocks" }, { status: 400 });
    }
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
