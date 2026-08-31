import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  createContractTemplate,
  deleteContractTemplate,
  listContractTemplates,
  updateContractTemplate,
} from "@/server/contractTemplates";
import type { ClientContract } from "@/lib/clients/clientContracts";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

function cleanId(value: unknown, max = 120): string {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().slice(0, max);
  return cleaned && /^[a-zA-Z0-9._:-]+$/.test(cleaned) ? cleaned : "";
}

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
      clientId?: unknown;
      sourceContractId?: unknown;
    } | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Template action required." }, { status: 400 });

    if (body.action === "create") {
      const clientId = cleanId(body.clientId);
      const sourceContractId = cleanId(body.sourceContractId);
      if (clientId || sourceContractId) {
        if (!clientId || !sourceContractId) {
          return NextResponse.json({ ok: false, error: "Client and source contract are both required." }, { status: 400 });
        }
        // Global template CRUD remains an agency-library concern. Importing
        // one exact client's terms into that library additionally requires
        // Manage authority over that client's Commercial element.
        // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
        const client = getClientForAgency(session.agencyId, clientId);
        if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
        await requireCurrentClientWorkspaceElementAccess(clientId, "client.commercial", "manage");
        const contracts = Array.isArray(client.metadata?.contracts)
          ? client.metadata.contracts as ClientContract[]
          : [];
        const source = contracts.find(contract => contract.id === sourceContractId);
        if (!source?.body?.trim()) {
          return NextResponse.json({ ok: false, error: "A written source contract is required." }, { status: 404 });
        }
        const operationId = `source-contract:${clientId}:${sourceContractId}`;
        const existed = listContractTemplates(session.agencyId, true)
          .some(template => template.sourceContractId === sourceContractId);
        const template = createContractTemplate(session.agencyId, {
          title: source.title,
          summary: source.summary,
          body: source.body,
          sourceContractId,
          creationOperationId: operationId,
        }, session.userId);
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          replayed: existed,
          template,
          templates: listContractTemplates(session.agencyId),
        }, { status: existed ? 200 : 201 });
      }
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
