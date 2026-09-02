import { NextResponse } from "next/server";

import type { OperationalAlertAction } from "@/lib/intelligence/operationalAttention";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { listOperationalAlertViews, setOperationalAlertPreference } from "@/lib/server/inbox/operationalAlertPreferences";
import { recordCompletedAction } from "@/server/completedActions";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { ensureHydrated, getBackendInfo } from "@/server/storage";
import { agencyRolesForStaffWorkspaceApiPath } from "@/lib/staffWorkspacePolicy";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ActionMutationConflictError, ActionMutationReceiptError, actionOperationId, matchingActionReceipt, recordActionReceipt } from "@/server/actionMutationReceipts";
import { alertOccurrenceKey } from "@/lib/client/actionsMutationTruth";

const ACTIONS = new Set<OperationalAlertAction>(["read", "unread", "park", "dismiss"]);
const MAX_PARK_MS = 31 * 24 * 60 * 60 * 1000;
const NOTIFICATION_ROLES = agencyRolesForStaffWorkspaceApiPath("/api/portal/notifications");

export async function GET() {
  try {
    await ensureNotificationSnapshotHydrated();
    const session = await requireRole([...NOTIFICATION_ROLES]);
    const alerts = await listOperationalAlerts(session.agencyId);
    return NextResponse.json({ ok: true, alerts: listOperationalAlertViews(session.agencyId, session.userId, alerts) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await ensureNotificationSnapshotHydrated();
    const session = await requireRole([...NOTIFICATION_ROLES]);
    const body = await request.json().catch(() => null) as {
      alertId?: string;
      action?: OperationalAlertAction;
      parkedUntil?: number;
      operationId?: string;
      expectedOccurrenceKey?: string;
      expectedVersion?: number;
    } | null;
    if (!body?.alertId || !body.action || !ACTIONS.has(body.action)) {
      return NextResponse.json({ ok: false, error: "A valid alert and action are required." }, { status: 400 });
    }
    const expectedOccurrenceKey = typeof body.expectedOccurrenceKey === "string" ? body.expectedOccurrenceKey : "";
    const expectedVersion = Number.isSafeInteger(body.expectedVersion) && Number(body.expectedVersion) >= 0
      ? Number(body.expectedVersion)
      : -1;
    const expectedOperationId = actionOperationId("alert-action", body.alertId, `${body.action}@${expectedOccurrenceKey}@v:${expectedVersion}`, body.parkedUntil);
    if (body.operationId !== expectedOperationId) {
      return NextResponse.json({ ok: false, error: "A valid notification operation id is required." }, { status: 400 });
    }

    const now = Date.now();
    if (body.action === "park" && (!Number.isFinite(body.parkedUntil) || (body.parkedUntil ?? 0) <= now || (body.parkedUntil ?? 0) > now + MAX_PARK_MS)) {
      return NextResponse.json({ ok: false, error: "Choose a park time within the next 31 days." }, { status: 400 });
    }

    const liveAlerts = await listOperationalAlerts(session.agencyId, now);

    // Dismissing is a decision — "I have judged this not worth acting on" —
    // and deserves a record. Parking is not: it is "later", and logging it as
    // completed would inflate the record of what was actually done.
    // Alert preferences and receipts remain per-user, while the completion
    // register is shared by the agency. One alert lane prevents two actors
    // dismissing the same occurrence from creating duplicate register rows.
    const replayed = await withPortalStateTransaction(`attention:${session.agencyId}:${body.alertId}`, async () => {
      const receiptInput = { operationId: body.operationId!, kind: "alert-action" as const, agencyId: session.agencyId, userId: session.userId, targetId: body.alertId!, action: `${body.action}@${expectedOccurrenceKey}@v:${expectedVersion}`, parkedUntil: body.parkedUntil };
      if (matchingActionReceipt(receiptInput)) return true;
      const alert = (await listOperationalAlerts(session.agencyId, now)).find(item => item.id === body.alertId);
      if (!alert || alertOccurrenceKey(alert) !== expectedOccurrenceKey) throw new ActionMutationConflictError("This alert occurrence has changed. Refresh and try again.");
      const currentView = listOperationalAlertViews(session.agencyId, session.userId, [alert], now)[0];
      if (!currentView || (currentView.causalVersion ?? 0) !== expectedVersion) throw new ActionMutationConflictError("This alert changed before the action was saved. Refresh and try again.");
      if (body.action === "dismiss") {
        recordCompletedAction(session.agencyId, {
          operationId: body.operationId,
          sourceId: alert.id, title: alert.title, detail: alert.detail, origin: "inbox",
          outcome: "dismissed", completedBy: session.userId,
        }, now);
      }
      setOperationalAlertPreference({ agencyId: session.agencyId, userId: session.userId, alert, action: body.action!, parkedUntil: body.parkedUntil, now });
      recordActionReceipt({ ...receiptInput, createdAt: now });
      return false;
    });
    return NextResponse.json({
      ok: true,
      operationId: body.operationId,
      alertId: body.alertId,
      action: body.action,
      replayed,
      alerts: listOperationalAlertViews(session.agencyId, session.userId, liveAlerts, now),
    });
  } catch (error) {
    if (error instanceof ActionMutationConflictError || error instanceof ActionMutationReceiptError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}

async function ensureNotificationSnapshotHydrated(): Promise<void> {
  const { kind } = getBackendInfo();
  // The file backend's normal hydration path detects external changes using
  // the active realm file's mtime. Remote stores have no equivalent local
  // signal, so they retain the force-fresh read required for multi-process use.
  await ensureHydrated({ fresh: kind === "postgres" || kind === "supabase" });
}
