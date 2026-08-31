import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { createClientMilestone, deleteClientMilestone, listClientMilestones, updateClientMilestone } from "@/server/clientMilestones";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES, type ClientMilestoneStatus } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type Body = {
  action?: "create" | "update" | "delete";
  clientId?: string;
  milestoneId?: string;
  title?: string;
  description?: string;
  status?: ClientMilestoneStatus;
  progress?: number;
  targetAt?: number;
  metric?: "pageviews" | "visitors" | "conversions" | "search-clicks";
  targetValue?: number;
  autoTrack?: boolean;
};

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (!getClientForAgency(session.agencyId, clientId)) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.fulfilment", "view");
    return NextResponse.json({ ok: true, milestones: listClientMilestones(session.agencyId, clientId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.clientId || !body.action) return NextResponse.json({ ok: false, error: "clientId and action required" }, { status: 400 });
    const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (!getClientForAgency(session.agencyId, body.clientId)) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(
      body.clientId,
      "client.fulfilment",
      body.action === "delete" ? "manage" : "use",
    );
    if (body.action === "delete") {
      const ok = body.milestoneId ? deleteClientMilestone(session.agencyId, body.clientId, body.milestoneId) : false;
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    const input = {
      title: body.title ?? "",
      description: body.description,
      status: body.status,
      progress: body.progress,
      targetAt: body.targetAt,
      metric: body.metric,
      targetValue: body.targetValue,
      autoTrack: body.autoTrack,
    };
    const milestone = body.action === "create"
      ? createClientMilestone(session.agencyId, body.clientId, input, session.userId)
      : body.milestoneId
        ? updateClientMilestone(session.agencyId, body.clientId, body.milestoneId, input, session.userId)
        : null;
    if (!milestone) return NextResponse.json({ ok: false, error: "milestone not found" }, { status: 404 });
    return NextResponse.json({ ok: true, milestone });
  } catch (error) {
    return authErrorResponse(error);
  }
}
