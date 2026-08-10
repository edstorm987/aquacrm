import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import {
  clockInDashboard,
  clockOutDashboard,
  dashboardPlanningSnapshot,
  deleteDashboardWorkSession,
  logDashboardWorkSession,
  updateDashboardWorkSession,
  upsertDashboardDayPlan,
  upsertDashboardWeekPlan,
} from "@/server/dashboardPlanning";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const date = new URL(request.url).searchParams.get("date") ?? undefined;
    return NextResponse.json({ ok: true, planning: dashboardPlanningSnapshot(session.agencyId, session.userId, date) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as {
      action?: "save-plan" | "save-week" | "clock-in" | "clock-out" | "log-hours" | "update-session" | "delete-session";
      date?: string;
      weekStart?: string;
      weekOutcome?: string;
      weekReviewNotes?: string;
      focus?: string;
      planNotes?: string;
      doneNotes?: string;
      plannedHours?: number;
      targetRevenuePounds?: number;
      sessionId?: string;
      hours?: number;
      notes?: string;
    } | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "action required" }, { status: 400 });

    if (body.action === "save-plan") {
      upsertDashboardDayPlan({
        agencyId: session.agencyId,
        userId: session.userId,
        date: body.date,
        focus: body.focus,
        planNotes: body.planNotes,
        doneNotes: body.doneNotes,
        plannedHours: body.plannedHours,
        targetRevenuePounds: body.targetRevenuePounds,
      });
    } else if (body.action === "save-week") {
      upsertDashboardWeekPlan({
        agencyId: session.agencyId,
        userId: session.userId,
        weekStart: body.weekStart,
        outcome: body.weekOutcome,
        reviewNotes: body.weekReviewNotes,
      });
    } else if (body.action === "clock-in") {
      clockInDashboard({ agencyId: session.agencyId, userId: session.userId, date: body.date, focus: body.focus });
    } else if (body.action === "clock-out") {
      clockOutDashboard(session.agencyId, session.userId, body.notes);
    } else if (body.action === "log-hours") {
      const logged = logDashboardWorkSession({ agencyId: session.agencyId, userId: session.userId, date: body.date, hours: body.hours, focus: body.focus, notes: body.notes });
      if (!logged) return NextResponse.json({ ok: false, error: "valid past or current date and hours required" }, { status: 400 });
    } else if (body.action === "update-session") {
      if (!body.sessionId) return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
      const updated = updateDashboardWorkSession(session.agencyId, session.userId, body.sessionId, body.notes, body.focus);
      if (!updated) return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
    } else if (body.action === "delete-session") {
      if (!body.sessionId) return NextResponse.json({ ok: false, error: "sessionId required" }, { status: 400 });
      if (!deleteDashboardWorkSession(session.agencyId, session.userId, body.sessionId)) return NextResponse.json({ ok: false, error: "completed session not found" }, { status: 404 });
    }

    await flushPendingWrites();
    return NextResponse.json({ ok: true, planning: dashboardPlanningSnapshot(session.agencyId, session.userId, body.date) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
