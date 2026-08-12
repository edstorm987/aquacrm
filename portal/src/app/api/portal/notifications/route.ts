import { NextResponse } from "next/server";

import type { OperationalAlertAction } from "@/lib/operationalAttention";
import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { listOperationalAlertViews, setOperationalAlertPreference } from "@/lib/server/operationalAlertPreferences";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

const ACTIONS = new Set<OperationalAlertAction>(["read", "unread", "park", "dismiss"]);
const MAX_PARK_MS = 31 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole([...AGENCY_ROLES]);
    const alerts = await listOperationalAlerts(session.agencyId);
    return NextResponse.json({ ok: true, alerts: listOperationalAlertViews(session.agencyId, session.userId, alerts) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await ensureHydrated({ fresh: true });
    const session = await requireRole([...AGENCY_ROLES]);
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
