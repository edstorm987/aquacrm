import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { createClientDelight, deleteClientDelight, listClientDelight, updateClientDelight } from "@/server/clientDelight";
import { recordDelightExpense } from "@/lib/server/clientDelightExpense";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type ClientDelightOccasion, type ClientDelightStatus, type ExperienceAudience, type ExperienceDeliveryMethod, type ExperienceFulfilmentStep } from "@/server/types";

type Body = {
  action?: "create" | "update" | "delete";
  id?: string;
  clientId?: string;
  recipientUserId?: string;
  companyId?: string;
  packageId?: string;
  audience?: ExperienceAudience;
  recipientName?: string;
  occasion?: ClientDelightOccasion;
  title?: string;
  status?: ClientDelightStatus;
  deliveryMethod?: ExperienceDeliveryMethod;
  currency?: string;
  dueAt?: number;
  budgetCents?: number;
  costCents?: number;
  supplier?: string;
  trackingUrl?: string;
  bookingReference?: string;
  location?: string;
  guestCount?: number;
  includedItems?: string[];
  fulfilmentSteps?: ExperienceFulfilmentStep[];
  notes?: string;
  outcomeNotes?: string;
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
      recipientUserId: body.recipientUserId,
      companyId: body.companyId,
      packageId: body.packageId,
      audience: body.audience,
      recipientName: body.recipientName ?? "",
      occasion: body.occasion,
      title: body.title ?? "",
      status: body.status,
      deliveryMethod: body.deliveryMethod,
      currency: body.currency,
      dueAt: body.dueAt,
      budgetCents: body.budgetCents,
      costCents: body.costCents,
      supplier: body.supplier,
      trackingUrl: body.trackingUrl,
      bookingReference: body.bookingReference,
      location: body.location,
      guestCount: body.guestCount,
      includedItems: body.includedItems,
      fulfilmentSteps: body.fulfilmentSteps,
      notes: body.notes,
      outcomeNotes: body.outcomeNotes,
    };
    const record = body.action === "create"
      ? createClientDelight(session.agencyId, input, session.userId)
      : body.id
        ? updateClientDelight(session.agencyId, body.id, input, session.userId)
        : null;
    if (!record) return NextResponse.json({ ok: false, error: "record not found" }, { status: 404 });
    // Wire You-Deserve-It spend → Finance: a delivered delight with a cost
    // becomes an approval-gated finance expense. Idempotent on the delight id,
    // and a no-op when Finance isn't connected — never fails the delight save.
    if (record.status === "delivered" && (record.costCents ?? 0) > 0) {
      try {
        await recordDelightExpense(session.agencyId, {
          clientId: record.clientId,
          title: record.title,
          amountCents: record.costCents ?? 0,
          delightId: record.id,
        }, session.userId);
      } catch { /* recording the expense must never block the delight save */ }
    }
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save experience." }, { status: 400 });
    }
  }
}
