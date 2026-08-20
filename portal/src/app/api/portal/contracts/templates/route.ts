import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  createContractTemplate,
  deleteContractTemplate,
  listContractTemplates,
  updateContractTemplate,
} from "@/server/contractTemplates";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

export async function GET() {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    return NextResponse.json({ ok: true, templates: listContractTemplates(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as {
      action?: "create" | "update" | "delete";
      id?: string;
      title?: unknown;
      summary?: unknown;
      body?: unknown;
      status?: unknown;
    } | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Template action required." }, { status: 400 });

    if (body.action === "create") {
      const template = createContractTemplate(session.agencyId, {
        title: body.title,
        summary: body.summary,
        body: body.body,
      }, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, template, templates: listContractTemplates(session.agencyId) }, { status: 201 });
    }
    if (!body.id) return NextResponse.json({ ok: false, error: "Template id required." }, { status: 400 });
    if (body.action === "delete") {
      if (!deleteContractTemplate(session.agencyId, body.id, session.userId)) {
        return NextResponse.json({ ok: false, error: "Template not found." }, { status: 404 });
      }
      await flushPendingWrites();
      return NextResponse.json({ ok: true, templates: listContractTemplates(session.agencyId) });
    }
    const template = updateContractTemplate(session.agencyId, body.id, body, session.userId);
    if (!template) return NextResponse.json({ ok: false, error: "Template not found." }, { status: 404 });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, template, templates: listContractTemplates(session.agencyId) });
  } catch (error) {
    if (error instanceof Error && /required/i.test(error.message)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
