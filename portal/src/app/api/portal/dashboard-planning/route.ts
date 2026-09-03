import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  clockInDashboard,
  clockOutDashboard,
  DashboardClockOutReviewError,
  DashboardWeeklyReviewError,
  dashboardPlanningSnapshot,
  deleteDashboardWorkSession,
  heartbeatDashboardWorkSession,
  logDashboardWorkSession,
  resolveDashboardWorkActivity,
  updateDashboardWorkSession,
  upsertDashboardDayPlan,
  upsertDashboardWeekPlan,
} from "@/server/dashboardPlanning";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { getActiveDepartmentId } from "@/lib/server/chrome/activeDepartment";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  // Planning, clocking and wellbeing are personal surfaces for every role,
  // including owner and manager. Apply the same Staff Overview element to
  // every identity so a narrowed manager cannot regain it through this API.
  await requireCurrentWorkspaceElementAccess("staff", "staff.overview", request.method === "GET" ? "view" : "use");
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
      action?: "save-plan" | "save-week" | "clock-in" | "clock-out" | "heartbeat" | "resolve-activity" | "log-hours" | "update-session" | "delete-session";
      date?: string;
      weekStart?: string;
      weekOutcome?: string;
      weekReviewNotes?: string;
      weekWins?: string;
      weekMisses?: string;
      weekLessons?: string;
      weekDecisions?: string;
      weekRisks?: string;
      weekStartDoing?: string;
      weekStopDoing?: string;
      weekContinueDoing?: string;
      weekNextPriorities?: string;
      weekExecutionScore?: number;
      weekEnergyScore?: number;
      weekConfidenceScore?: number;
      weekReviewStatus?: "draft" | "complete";
      weekEvidenceSnapshot?: {
        plannedHours?: number;
        confirmedHours?: number;
        unconfirmedHours?: number;
        completedTasks?: number;
        openTasks?: number;
        revenueTargetPounds?: number;
        dayReviewsCompleted?: number;
        capturedAt?: number;
      };
      focus?: string;
      planNotes?: string;
      doneNotes?: string;
      plannedHours?: number;
      targetRevenuePounds?: number;
      sessionId?: string;
      hours?: number;
      notes?: string;
      visible?: boolean;
      lastInteractionAt?: number;
      activityMode?: "aqua" | "external" | "break";
      activityFocus?: string;
      nextCheckInMinutes?: number;
      currentPath?: string;
      clockOutReview?: {
        outcome?: string;
        openWork?: string;
        nothingOpen?: boolean;
        nextPriority?: string;
        dayScore?: 1 | 2 | 3 | 4 | 5;
        unconfirmedTimeAcknowledged?: boolean;
      };
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
        wins: body.weekWins,
        misses: body.weekMisses,
        lessons: body.weekLessons,
        decisions: body.weekDecisions,
        risks: body.weekRisks,
        startDoing: body.weekStartDoing,
        stopDoing: body.weekStopDoing,
        continueDoing: body.weekContinueDoing,
        nextWeekPriorities: body.weekNextPriorities,
        executionScore: body.weekExecutionScore,
        energyScore: body.weekEnergyScore,
        confidenceScore: body.weekConfidenceScore,
        reviewStatus: body.weekReviewStatus,
        evidenceSnapshot: body.weekEvidenceSnapshot,
      });
    } else if (body.action === "clock-in") {
      // The hat already on when you clock in. Without this the first block of
      // every day was unattributed however the switcher was set — the nav said
      // "Working as Sales" and the hours went nowhere.
      const activeDepartment = await getActiveDepartmentId();
      clockInDashboard({
        agencyId: session.agencyId,
        userId: session.userId,
        date: body.date,
        focus: body.focus,
        currentPath: body.currentPath,
        ...(activeDepartment ? { departmentId: activeDepartment } : {}),
      });
    } else if (body.action === "clock-out") {
      clockOutDashboard({ agencyId: session.agencyId, userId: session.userId, review: body.clockOutReview });
    } else if (body.action === "heartbeat") {
      heartbeatDashboardWorkSession({
        agencyId: session.agencyId,
        userId: session.userId,
        visible: body.visible !== false,
        lastInteractionAt: body.lastInteractionAt,
        currentPath: body.currentPath,
      });
    } else if (body.action === "resolve-activity") {
      if (!body.activityMode) return NextResponse.json({ ok: false, error: "activityMode required" }, { status: 400 });
      const updated = resolveDashboardWorkActivity({
        agencyId: session.agencyId,
        userId: session.userId,
        mode: body.activityMode,
        focus: body.activityFocus,
        note: body.notes,
        nextCheckInMinutes: body.nextCheckInMinutes,
      });
      if (!updated) return NextResponse.json({ ok: false, error: body.activityMode === "external" ? "Describe the off-app work first" : "active session not found" }, { status: 400 });
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
    if (error instanceof DashboardClockOutReviewError || error instanceof DashboardWeeklyReviewError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
