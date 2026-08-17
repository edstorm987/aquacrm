import { NextResponse } from "next/server";

import { cleanRecordText } from "@/lib/clientRelationshipRecord";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { canUsePeopleStation } from "@/server/people";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { createAgencyTask } from "@/server/tasks";
import { getClientForAgency } from "@/server/tenants";
import { AGENCY_ROLES, type AgencyTaskPriority } from "@/server/types";

function cleanPriority(value: unknown): AgencyTaskPriority {
  return value === "urgent" || value === "high" || value === "low" ? value : "normal";
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const clientId = cleanRecordText(body?.clientId, 120);
    const operationId = cleanRecordText(body?.operationId, 120);
    const title = cleanRecordText(body?.title, 240);
    const detail = cleanRecordText(body?.detail, 4_000);
    const href = cleanRecordText(body?.href, 1_000);
    if (!clientId || !operationId || !title || !detail) {
      return NextResponse.json({ ok: false, error: "client, operation, title and detail are required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    if (session.role === "agency-staff" && !canUsePeopleStation(session.agencyId, session.userId, "actions", true)) {
      return NextResponse.json({ ok: false, error: "Actions access is required" }, { status: 403 });
    }
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    const sourceHref = href.startsWith(`/portal/clients/${clientId}`) ? href : `/portal/clients/${clientId}`;
    const task = createAgencyTask({
      agencyId: session.agencyId,
      title: `${client.name}: ${title}`,
      notes: detail,
      priority: cleanPriority(body?.priority),
      origin: "crm",
      sourceId: `client:${clientId}:operation:${operationId}`,
      sourceHref,
      evidence: [detail],
      expectedOutcome: `${title} is resolved and the outcome is retained on ${client.name}'s client record.`,
      assigneeUserId: session.userId,
      clientId,
      createdBy: session.userId,
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
