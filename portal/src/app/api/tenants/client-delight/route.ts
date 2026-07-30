import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { createClientDelight, deleteClientDelight, listClientDelight, updateClientDelight } from "@/server/clientDelight";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type ClientDelightOccasion, type ClientDelightStatus } from "@/server/types";

type Body = {
  action?: "create" | "update" | "delete";
  id?: string;
  clientId?: string;
  recipientName?: string;
  occasion?: ClientDelightOccasion;
  title?: string;
  status?: ClientDelightStatus;
  dueAt?: number;
  budgetCents?: number;
  costCents?: number;
  supplier?: string;
  trackingUrl?: string;
  notes?: string;
};

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json({ ok: true, records: listClientDelight(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });
    if (body.action === "delete") {
      const ok = body.id ? deleteClientDelight(session.agencyId, body.id) : false;
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    const input = {
      clientId: body.clientId,
      recipientName: body.recipientName ?? "",
      occasion: body.occasion,
      title: body.title ?? "",
      status: body.status,
      dueAt: body.dueAt,
      budgetCents: body.budgetCents,
      costCents: body.costCents,
      supplier: body.supplier,
      trackingUrl: body.trackingUrl,
      notes: body.notes,
    };
    const record = body.action === "create"
      ? createClientDelight(session.agencyId, input, session.userId)
      : body.id
        ? updateClientDelight(session.agencyId, body.id, input, session.userId)
        : null;
    if (!record) return NextResponse.json({ ok: false, error: "record not found" }, { status: 404 });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    return authErrorResponse(error);
  }
}
