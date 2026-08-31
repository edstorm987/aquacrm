import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { createClientDelight, deleteClientDelight, listClientDelight, updateClientDelight } from "@/server/clientDelight";
import { delightExpenseState, delightSpendApproved, delightSpendCents, recordDelightExpense } from "@/lib/server/clients/clientDelightExpense";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type ClientDelightOccasion, type ClientDelightStatus, type ExperienceAudience, type ExperienceDeliveryMethod, type ExperienceFulfilmentStep } from "@/server/types";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  currentClientWorkspaceElementAccess,
  requireCurrentClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import { getClientForAgency } from "@/server/tenants";

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
    const records = listClientDelight(session.agencyId);
    const visible: typeof records = [];
    for (const record of records) {
      if (!record.clientId) {
        visible.push(record);
        continue;
      }
      const { access } = await currentClientWorkspaceElementAccess(record.clientId);
      if (clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(access, "client.relationship"), "view")) {
        visible.push(record);
      }
    }
    return NextResponse.json({ ok: true, records: visible });
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
    const existing = body.id
      ? listClientDelight(session.agencyId).find(record => record.id === body.id)
      : undefined;
    const targetClientIds = [...new Set([existing?.clientId, body.clientId].filter((id): id is string => Boolean(id)))];
    for (const clientId of targetClientIds) {
      if (!getClientForAgency(session.agencyId, clientId)) {
        return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
      }
      await requireCurrentClientWorkspaceElementAccess(
        clientId,
        "client.relationship",
        body.action === "delete" ? "manage" : "use",
      );
    }
    const resultingClientId = body.clientId ?? existing?.clientId;
    const resultingStatus = body.status ?? existing?.status ?? "idea";
    // A delight carries a money commitment from PLANNED onwards, and from that
    // point it writes an approval-gated Finance expense — so it is a commercial
    // act, not just a relationship one, well before it is delivered.
    const resultingSpendCents = delightSpendCents({
      status: resultingStatus,
      costCents: body.costCents ?? existing?.costCents,
      budgetCents: body.budgetCents ?? existing?.budgetCents,
    });
    if (resultingClientId && resultingSpendCents > 0) {
      await requireCurrentClientWorkspaceElementAccess(resultingClientId, "client.commercial", "use");
    }
    if (body.action === "delete") {
      const ok = body.id ? deleteClientDelight(session.agencyId, body.id) : false;
      return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
    }
    // "The app never spends money on its own." Moving a planned gift to
    // BOOKED / ORDERED is the moment Aqua says "go and buy this", so Finance
    // must have signed the spend off first. Creating a record already at
    // ordered/sent/delivered is a human writing down a purchase they made
    // off-system — that is never blocked, and neither is a record that is
    // already ordered.
    if (
      body.action === "update"
      && existing
      && body.status === "ordered"
      && existing.status !== "ordered"
      && resultingSpendCents > 0
    ) {
      let refusal: string | null = null;
      try {
        // Read the sign-off BEFORE writing anything. This request is about to be
        // refused and persisted nowhere, so it must not leave Finance holding a
        // number that exists on no record — re-pricing belongs to the save that
        // actually persists it, further down.
        const recorded = await delightExpenseState(session.agencyId, existing.id);
        const expenseId = recorded
          ? recorded.id
          // Nothing recorded yet (a gift planned before this wire existed).
          // Raise it so there is something for Finance to sign off, priced from
          // what the record already commits, not from this refused request.
          : await recordDelightExpense(session.agencyId, {
            clientId: existing.clientId,
            title: existing.title,
            amountCents: delightSpendCents(existing) || resultingSpendCents,
            delightId: existing.id,
            supplier: existing.supplier,
            occasion: existing.occasion,
          }, session.userId);
        // No expense id means Finance is not connected (or has no category to
        // book this to). There is no sign-off surface, so there is no refusal
        // to report — inventing one would claim a decision nobody made.
        if (expenseId) {
          const state = recorded ?? await delightExpenseState(session.agencyId, existing.id);
          if (!delightSpendApproved(state)) {
            const amount = `${existing.currency} ${((state?.amountCents ?? resultingSpendCents) / 100).toFixed(2)}`;
            refusal = state?.status === "rejected"
              ? `Finance rejected the ${amount} spend for “${existing.title}”. Re-open or re-price the expense in Finance → Expenses before ordering.`
              : `Finance has not approved the ${amount} spend for “${existing.title}” yet — the expense is awaiting sign-off. Approve it in Finance → Expenses, then move this to Booked / ordered.`;
          }
        }
      } catch {
        // Finance could not be reached. We do not know whether it approved, so
        // we must not manufacture a refusal — let the save through.
      }
      if (refusal) {
        return NextResponse.json({ ok: false, error: refusal }, { status: 409 });
      }
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
    // Wire You-Deserve-It spend → Finance: from PLANNED onwards, a delight with
    // money against it (logged cost, else planned budget) becomes an
    // approval-gated finance expense — so the commitment is visible for sign-off
    // before it is spent, not only after. Idempotent on the delight id, and a
    // no-op when Finance isn't connected — never fails the delight save.
    const recordedSpendCents = delightSpendCents(record);
    if (recordedSpendCents > 0) {
      try {
        await recordDelightExpense(session.agencyId, {
          clientId: record.clientId,
          title: record.title,
          amountCents: recordedSpendCents,
          delightId: record.id,
          supplier: record.supplier,
          occasion: record.occasion,
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
