import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { deletePortalEditorField, getPortalEditorState, savePortalEditorField } from "@/server/portalEditor";
import { ensureHydrated } from "@/server/storage";
import type { PortalFormEntity, PortalFormFieldDefinition } from "@/server/types";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    return NextResponse.json({ ok: true, editor: getPortalEditorState(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as {
      entity?: PortalFormEntity;
      field?: Partial<PortalFormFieldDefinition>;
    } | null;
    if (!body?.entity || !body.field) {
      return NextResponse.json({ ok: false, error: "Form and field are required." }, { status: 400 });
    }
    const editor = savePortalEditorField(session.agencyId, body.entity, body.field, session.userId);
    return NextResponse.json({ ok: true, editor });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unknown form." || error.message === "Field label required.")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as { entity?: PortalFormEntity; fieldId?: string } | null;
    if (!body?.entity || !body.fieldId) {
      return NextResponse.json({ ok: false, error: "Form and field are required." }, { status: 400 });
    }
    const editor = deletePortalEditorField(session.agencyId, body.entity, body.fieldId, session.userId);
    return NextResponse.json({ ok: true, editor });
  } catch (error) {
    return authErrorResponse(error);
  }
}
