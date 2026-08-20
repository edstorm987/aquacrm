import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { createSopCategory, deleteSopCategory, listSopCategories } from "@/engines/sop/server/sops";
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
    return NextResponse.json({ ok: true, categories: listSopCategories(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { category?: string } | null;
    if (!body?.category?.trim()) return NextResponse.json({ ok: false, error: "category required" }, { status: 400 });
    const category = createSopCategory(session.agencyId, body.category, session.userId);
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as { category?: string; replacementCategory?: string } | null;
    if (!body?.category?.trim()) return NextResponse.json({ ok: false, error: "category required" }, { status: 400 });
    try {
      const result = deleteSopCategory(
        session.agencyId,
        body.category,
        body.replacementCategory?.trim() || undefined,
        session.userId,
      );
      return result
        ? NextResponse.json({ ok: true, ...result, categories: listSopCategories(session.agencyId) })
        : NextResponse.json({ ok: false, error: "Category not found" }, { status: 404 });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Category could not be deleted" }, { status: 400 });
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
