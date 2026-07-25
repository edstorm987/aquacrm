import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { logActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES, type AgencyStatus } from "@/server/types";

interface ClientStatusBody {
  clientId: string;
  status: AgencyStatus;
}

const ALLOWED_STATUS: AgencyStatus[] = ["active", "archived"];

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as ClientStatusBody | null;
    if (!body?.clientId || !ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ ok: false, error: "clientId and a valid status are required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
    const client = getClientForAgency(session.agencyId, body.clientId);
    if (!client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }

    const updated = updateClient(session.agencyId, body.clientId, { status: body.status });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "status update failed" }, { status: 500 });
    }

    logActivity({
      agencyId: session.agencyId,
      clientId: body.clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: body.status === "archived" ? "client.archived" : "client.reactivated",
      message: body.status === "archived"
        ? `Archived client "${client.name}".`
        : `Reactivated client "${client.name}".`,
      metadata: { previousStatus: client.status, status: updated.status },
    });

    return NextResponse.json({
      ok: true,
      client: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
      },
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
