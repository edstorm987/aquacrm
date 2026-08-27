import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { listActivity } from "@/server/activity";
import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export async function GET(req: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(req);
    if (!session || !AGENCY_ROLES.includes(session.role)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    // `?clientId=` is only ever a filter here, but a filter is still an id from
    // the request: the scope proves the caller may name it before it narrows
    // an agency-scoped read.
    const scope = routeTenantScope(session, { clientId: url.searchParams.get("clientId") });
    if (scope.clientId) {
      await requireCurrentClientWorkspaceElementAccess(scope.clientId, "client.record", "view");
    }
    const entries = listActivity({
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 50,
    });

    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    return authErrorResponse(error);
  }
}
