import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { previewClientErasure } from "@/server/clientErasure";
import { ensureHydrated } from "@/server/storage";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

/**
 * The right-to-erasure PREVIEW — how many records an erasure WOULD remove,
 * without removing anything.
 *
 * This is the KNOW step of a DPO erasure: you see the blast radius before you
 * decide. It is strictly read-only — `previewClientErasure` counts, it never
 * mutates — and it is deliberately a SEPARATE endpoint from the destructive
 * one, so a preview can never be one typo away from a delete.
 *
 * Owner/manager may preview. Only an owner may erase (separate route).
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as { clientId?: string } | null;
    const scope = routeTenantScope(session, { clientId: body?.clientId });
    const client = scope.client;
    if (!client) return NextResponse.json({ ok: false, error: "That client was not found." }, { status: 404 });
    const clientId = client.id;
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.settings", "manage");

    const count = await previewClientErasure(scope.agencyId, clientId);
    if (count === null) return NextResponse.json({ ok: false, error: "That client was not found." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      clientId,
      clientName: client.name,
      wouldRemove: count,
      // Said out loud so the preview can never be mistaken for the act.
      notice: "This is an estimate of what would be deleted. Nothing has been changed. Erasure is a separate, confirmed, owner-only action and cannot be undone.",
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
