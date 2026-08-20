import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  CLIENT_OPERATION_STATES,
  cleanClientOperationsBrief,
  type ClientOperationState,
} from "@/lib/clients/clientOperations";
import { cleanRecordText } from "@/lib/clients/clientRelationshipRecord";
import { cleanClientRecordEntries } from "@/lib/clients/clientRelationshipRecord";
import { timestampFromValue } from "@/lib/shared/formatDateTime";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { logActivity } from "@/server/activity";
import { canUsePeopleStation, listPeopleEmployees } from "@/server/people";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { getUserById } from "@/server/users";
import { listAgencyTasks, updateAgencyTask } from "@/server/tasks";

interface OwnerOption {
  id: string;
  userId?: string;
  name: string;
  email: string;
}

function availableOwners(agencyId: string, userId: string, sessionEmail: string): OwnerOption[] {
  const currentUser = getUserById(userId);
  const employees = listPeopleEmployees(agencyId)
    .filter(employee => employee.status !== "alumni" && employee.status !== "suspended")
    .map(employee => ({
      id: employee.id,
      userId: employee.userId,
      name: employee.name,
      email: employee.email,
    }));
  if (employees.some(owner => owner.userId === userId)) return employees;
  return [{
    id: `user:${userId}`,
    userId,
    name: currentUser?.name?.trim() || sessionEmail,
    email: currentUser?.email || sessionEmail,
  }, ...employees];
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const clientId = cleanRecordText(body?.clientId, 120);
    if (!clientId) return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    if (session.role === "agency-staff" && !canUsePeopleStation(session.agencyId, session.userId, "actions", true)) {
      return NextResponse.json({ ok: false, error: "Actions access is required" }, { status: 403 });
    }
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const existing = cleanClientOperationsBrief(client.metadata?.clientOperations);
    if (body?.action === "complete-review") {
      const outcome = cleanRecordText(body.reviewOutcome, 10_000);
      const nextReviewAt = timestampFromValue(body.nextReviewAt);
      if (!outcome) return NextResponse.json({ ok: false, error: "review outcome is required" }, { status: 400 });
      if (!nextReviewAt || nextReviewAt <= Date.now()) return NextResponse.json({ ok: false, error: "next review must be in the future" }, { status: 400 });
      const now = Date.now();
      const review = {
        id: `review_${crypto.randomBytes(8).toString("hex")}`,
        outcome,
        reviewedAt: now,
        nextReviewAt,
        reviewedBy: session.email,
      };
      const brief = cleanClientOperationsBrief({
        ...existing,
        currentObjective: body.currentObjective === undefined ? existing.currentObjective : body.currentObjective,
        nextReviewAt,
        handoverNote: body.handoverNote === undefined ? existing.handoverNote : body.handoverNote,
        reviews: [review, ...existing.reviews],
        updatedAt: now,
        updatedBy: session.email,
      });
      const recordEntries = cleanClientRecordEntries(client.metadata?.clientRecordEntries);
      const updated = updateClient(session.agencyId, clientId, { metadata: {
        clientOperations: brief,
        clientRecordEntries: [{
          id: `rec_${crypto.randomBytes(8).toString("hex")}`,
          kind: "update",
          title: "Account review completed",
          body: `${outcome}\n\nNext review: ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(nextReviewAt)}${brief.currentObjective ? `\nCurrent objective: ${brief.currentObjective}` : ""}`,
          occurredAt: now,
          createdAt: now,
          updatedAt: now,
          createdBy: session.email,
          visibility: "internal",
          channel: "Operations desk",
        }, ...recordEntries],
      } });
      if (!updated) return NextResponse.json({ ok: false, error: "account review could not be saved" }, { status: 500 });
      const resolvedTaskIds = listAgencyTasks(session.agencyId)
        .filter(task => task.status !== "done" && task.sourceId === `client:${clientId}:operation:account-review-overdue`)
        .flatMap(task => updateAgencyTask(session.agencyId, task.id, { status: "done" }, session.userId)?.id ?? []);
      logActivity({
        agencyId: session.agencyId,
        clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "tenant",
        action: "client_operations.review_completed",
        message: `Completed ${client.name}'s account review and scheduled the next checkpoint.`,
        metadata: { reviewId: review.id, nextReviewAt, resolvedTaskIds },
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, brief, review, resolvedTaskIds });
    }

    const ownerId = cleanRecordText(body?.ownerId, 160);
    const owner = ownerId ? availableOwners(session.agencyId, session.userId, session.email).find(option => option.id === ownerId) : undefined;
    if (ownerId && !owner) return NextResponse.json({ ok: false, error: "account owner is not available" }, { status: 400 });
    const state = CLIENT_OPERATION_STATES.includes(body?.state as ClientOperationState)
      ? body?.state as ClientOperationState
      : "unassigned";
    const now = Date.now();
    const brief = cleanClientOperationsBrief({
      ...existing,
      ownerId: owner?.id,
      ownerUserId: owner?.userId,
      ownerName: owner?.name,
      ownerEmail: owner?.email,
      state,
      currentObjective: body?.currentObjective,
      nextReviewAt: body?.nextReviewAt,
      riskSummary: body?.riskSummary,
      handoverNote: body?.handoverNote,
      reviews: existing.reviews,
      updatedAt: now,
      updatedBy: session.email,
    });
    const updated = updateClient(session.agencyId, clientId, { metadata: { clientOperations: brief } });
    if (!updated) return NextResponse.json({ ok: false, error: "operational brief could not be saved" }, { status: 500 });
    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "client_operations.updated",
      message: `Updated ${client.name}'s operational handover brief.`,
      metadata: { ownerId: brief.ownerId, state: brief.state, nextReviewAt: brief.nextReviewAt },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, brief });
  } catch (error) {
    return authErrorResponse(error);
  }
}
