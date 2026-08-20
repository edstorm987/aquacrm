import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { createSopGuide, deleteSopGuide, listSopGuides, updateSopGuide } from "@/engines/sop/server/sopGuides";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type Role, type SopGuideAudience } from "@/server/types";

export const runtime = "nodejs";

// Composing a guide changes shared operating procedure for the whole team, so
// mutations are owner/manager only. Reading the composed guides is available to
// any agency role (the staff view lists them).
const MANAGE_ROLES: readonly Role[] = ["agency-owner", "agency-manager"];

async function agencySession(request: NextRequest, roles: readonly Role[] = AGENCY_ROLES) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !roles.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    return NextResponse.json({ ok: true, guides: listSopGuides(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request, MANAGE_ROLES);
    const body = await request.json().catch(() => null) as {
      title?: string;
      description?: string;
      sopIds?: string[];
      quizEnabled?: boolean;
      audience?: SopGuideAudience[];
    } | null;
    if (!body?.title?.trim()) {
      return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    }
    const guide = createSopGuide({
      agencyId: session.agencyId,
      title: body.title,
      description: body.description,
      sopIds: body.sopIds ?? [],
      quizEnabled: body.quizEnabled,
      audience: body.audience,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, guide }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Guide could not be created." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request, MANAGE_ROLES);
    const body = await request.json().catch(() => null) as {
      id?: string;
      title?: string;
      description?: string;
      sopIds?: string[];
      quizEnabled?: boolean;
      audience?: SopGuideAudience[];
    } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...patch } = body;
    const guide = updateSopGuide(session.agencyId, id, patch, session.userId);
    return guide
      ? NextResponse.json({ ok: true, guide })
      : NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Guide could not be saved." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request, MANAGE_ROLES);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const guide = deleteSopGuide(session.agencyId, id);
    if (!guide) return NextResponse.json({ ok: false, error: "Guide not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
