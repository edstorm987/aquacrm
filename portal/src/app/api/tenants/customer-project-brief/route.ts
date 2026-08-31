import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export interface CustomerProjectBrief {
  businessOverview?: string;
  primaryGoal?: string;
  idealCustomer?: string;
  mustHaves?: string;
  launchTiming?: string;
  additionalNotes?: string;
  submittedAt?: number;
  submittedBy?: string;
}

const TEXT_FIELDS = [
  "businessOverview",
  "primaryGoal",
  "idealCustomer",
  "mustHaves",
  "launchTiming",
  "additionalNotes",
] as const;

interface Body {
  clientId?: unknown;
  brief?: unknown;
}

function cleanBrief(value: unknown): CustomerProjectBrief | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const brief: CustomerProjectBrief = {};
  for (const field of TEXT_FIELDS) {
    const item = raw[field];
    if (typeof item === "string") brief[field] = item.trim().slice(0, 4_000);
  }
  return brief;
}

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as Body | null;
    const clientId = typeof body?.clientId === "string" ? body.clientId : "";
    const brief = cleanBrief(body?.brief);
    if (!clientId || !brief) {
      return NextResponse.json({ ok: false, error: "clientId and brief are required" }, { status: 400 });
    }

    const session = await requireRoleForClient(
      [...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"],
      clientId,
    );
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.record", "use");

    const savedBrief: CustomerProjectBrief = {
      ...brief,
      submittedAt: Date.now(),
      submittedBy: session.email,
    };
    const saved = updateClient(session.agencyId, client.id, {
      metadata: { portalBrief: savedBrief },
    });
    if (!saved) return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });

    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "fulfillment",
      action: "customer_brief.updated",
      message: `${client.name}'s project brief was updated.`,
    });

    return NextResponse.json({ ok: true, brief: savedBrief });
  } catch (error) {
    return authErrorResponse(error);
  }
}
