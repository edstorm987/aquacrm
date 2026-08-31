import { NextResponse } from "next/server";

import { PortalFormValidationError } from "@/lib/forms/portalFormValues";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES, type PortalFormFieldValue } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export async function PATCH(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as {
      clientId?: string;
      customFields?: Record<string, PortalFormFieldValue>;
    } | null;
    const clientId = body?.clientId?.trim();
    if (!clientId || !body?.customFields || typeof body.customFields !== "object" || Array.isArray(body.customFields)) {
      return NextResponse.json({ ok: false, error: "clientId and customFields are required" }, { status: 400 });
    }
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.settings", "manage");
    const updated = updateClient(session.agencyId, clientId, {
      metadata: { customFields: body.customFields },
    });
    return updated
      ? NextResponse.json({ ok: true, customFields: updated.metadata?.customFields ?? {} })
      : NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof PortalFormValidationError) {
      return NextResponse.json({ ok: false, error: error.message, fieldId: error.fieldId }, { status: 422 });
    }
    return authErrorResponse(error);
  }
}
