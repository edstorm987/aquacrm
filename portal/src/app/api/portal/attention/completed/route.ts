import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  CompletedActionDeleteOperationError,
  deleteCompletedActionForOperation,
  findCompletedAction,
  listCompletedActions,
  recordCompletedAction,
} from "@/server/completedActions";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { getOperationalAlertPreference, listOperationalAlertViews, setOperationalAlertPreference } from "@/lib/server/inbox/operationalAlertPreferences";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { ActionMutationConflictError, ActionMutationReceiptError, actionOperationId, matchingActionReceipt, recordActionReceipt } from "@/server/actionMutationReceipts";
import { alertOccurrenceKey } from "@/lib/client/actionsMutationTruth";

/** What has actually been finished, newest first. */
export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    return NextResponse.json(
      { ok: true, completed: listCompletedActions(session.agencyId) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Record that something was dealt with outside Aqua.
 *
 * Half the alert families are work Aqua can only observe — chasing money,
 * waiting on a client, a third party granting access. Without a way to say
 * "done", those sit in the queue until the underlying evidence happens to
 * change, which can be days after the work was actually finished.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const body = await request.json().catch(() => null) as {
      sourceId?: unknown; title?: unknown; detail?: unknown; note?: unknown; operationId?: unknown; expectedOccurrenceKey?: unknown; expectedVersion?: unknown; dismissAlert?: unknown;
    } | null;

    const sourceId = typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const operationId = typeof body?.operationId === "string" ? body.operationId.trim() : "";
    const expectedOccurrenceKey = typeof body?.expectedOccurrenceKey === "string" ? body.expectedOccurrenceKey : "";
    const dismissAlert = body?.dismissAlert === true;
    const expectedVersion = Number.isSafeInteger(body?.expectedVersion) && Number(body?.expectedVersion) >= 0
      ? Number(body?.expectedVersion)
      : -1;
    const receiptAction = `${dismissAlert ? "done-dismiss" : "done-only"}@${expectedOccurrenceKey}@v:${expectedVersion}`;
    if (!sourceId || !title || operationId !== actionOperationId("alert-done", sourceId, receiptAction)) {
      return NextResponse.json({ ok: false, error: "A source and a title are required." }, { status: 400 });
    }

    // The preference and receipt are personal, but the completion register is
    // agency-wide. Serialize every actor for this alert occurrence so two
    // simultaneous confirmations cannot each create the same shared row.
    const outcome = await withPortalStateTransaction(`attention:${session.agencyId}:${sourceId}`, async () => {
      const receiptInput = { operationId, kind: "alert-done" as const, agencyId: session.agencyId, userId: session.userId, targetId: sourceId, action: receiptAction };
      const receipt = matchingActionReceipt(receiptInput);
      if (receipt) {
        if (dismissAlert) {
          const currentAlert = (await listOperationalAlerts(session.agencyId)).find(item => item.id === sourceId);
          const preference = getOperationalAlertPreference(session.agencyId, session.userId, sourceId);
          if (!currentAlert || alertOccurrenceKey(currentAlert) !== expectedOccurrenceKey || preference?.state !== "dismissed"
            || preference.occurrenceKey !== expectedOccurrenceKey || preference.causalVersion !== expectedVersion + 1) {
            throw new ActionMutationConflictError("Completion was confirmed, but this alert has since changed. Refresh Actions before continuing.");
          }
        }
        const prior = receipt.completedActionId ? findCompletedAction(session.agencyId, receipt.completedActionId) : undefined;
        if (!prior) throw new ActionMutationConflictError("Completion was confirmed, but its register entry was later removed. Refresh before continuing.");
        return { entry: prior, replayed: true };
      }
      const alert = (await listOperationalAlerts(session.agencyId)).find(item => item.id === sourceId);
      if (dismissAlert && (!alert || alertOccurrenceKey(alert) !== expectedOccurrenceKey)) throw new ActionMutationConflictError("This alert occurrence has changed. Refresh Actions and try again.");
      const alertView = alert ? listOperationalAlertViews(session.agencyId, session.userId, [alert])[0] : undefined;
      if (dismissAlert && (!alertView || (alertView.causalVersion ?? 0) !== expectedVersion)) throw new ActionMutationConflictError("This alert changed before completion. Refresh Actions and try again.");
      const entry = recordCompletedAction(session.agencyId, {
        operationId,
        sourceId, title: alert?.title ?? title, detail: alert?.detail ?? (typeof body?.detail === "string" ? body.detail : undefined),
        note: typeof body?.note === "string" ? body.note : undefined, origin: "inbox",
        outcome: "resolved", completedBy: session.userId,
      });
      if (dismissAlert && alert) setOperationalAlertPreference({ agencyId: session.agencyId, userId: session.userId, alert, action: "dismiss" });
      recordActionReceipt({ ...receiptInput, completedActionId: entry.id, createdAt: Date.now() });
      return { entry, replayed: false };
    });
    const completed = listCompletedActions(session.agencyId);
    // The register presentation is capped at 200, but an exact receipt can be
    // older than that. Keep the acknowledged row in this mutation envelope so
    // a lost-success retry can still validate the operation it is adopting.
    const authoritativeCompleted = completed.some(entry => entry.id === outcome.entry.id)
      ? completed
      : [...completed, outcome.entry];
    return NextResponse.json({ ok: true, operationId, alertId: sourceId, sourceId, ...outcome, completed: authoritativeCompleted });
  } catch (error) {
    if (error instanceof ActionMutationConflictError || error instanceof ActionMutationReceiptError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}

/**
 * Remove an entry from the log.
 *
 * A real deletion rather than a hidden flag: an operator who removes something
 * should not find it still counted somewhere. A mis-click marking work done
 * must be undoable, or the register stops being a record of what happened and
 * becomes a record nobody trusts.
 */
export async function DELETE(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const params = new URL(request.url).searchParams;
    const id = params.get("id")?.trim();
    const operationId = params.get("operationId")?.trim();
    if (!id || !operationId) {
      return NextResponse.json(
        { ok: false, error: "An entry id and delete operation id are required." },
        { status: 400 },
      );
    }

    const result = deleteCompletedActionForOperation(session.agencyId, id, operationId);
    // Flush even on replay: the first request may have changed memory and then
    // lost its persistence acknowledgement. The retry is the recovery path.
    await flushPendingWrites();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CompletedActionDeleteOperationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
