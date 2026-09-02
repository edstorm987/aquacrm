import { NextResponse } from "next/server";

import type { OperationalAlertAction } from "@/lib/intelligence/operationalAttention";
import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { listOperationalAlertViews, setOperationalAlertPreference } from "@/lib/server/inbox/operationalAlertPreferences";
import { recordCompletedAction } from "@/server/completedActions";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { ensureHydrated, flushPendingWrites, getBackendInfo } from "@/server/storage";
import { agencyRolesForStaffWorkspaceApiPath } from "@/lib/staffWorkspacePolicy";

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
    } | null;
    if (!body?.alertId || !body.action || !ACTIONS.has(body.action)) {
      return NextResponse.json({ ok: false, error: "A valid alert and action are required." }, { status: 400 });
    }

    const now = Date.now();
    if (body.action === "park" && (!Number.isFinite(body.parkedUntil) || (body.parkedUntil ?? 0) <= now || (body.parkedUntil ?? 0) > now + MAX_PARK_MS)) {
      return NextResponse.json({ ok: false, error: "Choose a park time within the next 31 days." }, { status: 400 });
    }

    const liveAlerts = await listOperationalAlerts(session.agencyId, now);
    const alert = liveAlerts.find(item => item.id === body.alertId);
    if (!alert) return NextResponse.json({ ok: false, error: "This alert has already been resolved." }, { status: 404 });

    // Dismissing is a decision — "I have judged this not worth acting on" —
    // and deserves a record. Parking is not: it is "later", and logging it as
    // completed would inflate the record of what was actually done.
    if (body.action === "dismiss") {
      recordCompletedAction(session.agencyId, {
        sourceId: alert.id,
        title: alert.title,
        detail: alert.detail,
        origin: "inbox",
        outcome: "dismissed",
        completedBy: session.userId,
      }, now);
    }

    setOperationalAlertPreference({
      agencyId: session.agencyId,
      userId: session.userId,
      alert,
      action: body.action,
      parkedUntil: body.parkedUntil,
      now,
    });
    await flushPendingWrites();
    return NextResponse.json({
      ok: true,
      alerts: listOperationalAlertViews(session.agencyId, session.userId, liveAlerts, now),
    });
  } catch (error) {
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
