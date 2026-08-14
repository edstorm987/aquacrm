import { NextResponse, type NextRequest } from "next/server";

import { getActiveAgencyId, requireRole } from "@/lib/server/auth";
import { provisionSupabaseIdentity } from "@/lib/supabase/admin";
import {
  createPeopleEmployee,
  createPeopleLeaveRequest,
  decidePeopleLeaveRequest,
  employeePeopleSnapshot,
  getPeopleApplication,
  getPeopleEmployee,
  peopleSnapshot,
  rotatePeopleApplicationStatusToken,
  savePeopleShift,
  savePeopleTraining,
  updatePeopleApplication,
  updatePeopleEmployee,
  canUsePeopleStation,
} from "@/server/people";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type {
  PeopleApplicationStage,
  PeopleCommissionRule,
  PeopleEmployee,
  PeopleEmploymentType,
  PeopleLeaveRequest,
  PeopleShift,
  PeopleTrainingAssignment,
  PeopleWorkspaceAccess,
} from "@/server/types";
import { createUser, getUser, validatePassword } from "@/server/users";

export const runtime = "nodejs";

const MANAGERS = ["agency-owner", "agency-manager"] as const;
const APPLICATION_STAGES = new Set<PeopleApplicationStage>(["applied", "under-review", "interview", "shortlisted", "offer", "accepted", "onboarding", "declined", "withdrawn"]);
const EMPLOYMENT_TYPES = new Set<PeopleEmploymentType>(["full-time", "part-time", "contractor", "freelancer", "intern", "volunteer"]);

function text(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
  const agencyId = getActiveAgencyId(session);
  if (session.role === "agency-staff") {
    const snapshot = employeePeopleSnapshot(agencyId, session.userId);
    return snapshot ? NextResponse.json({ ok: true, ...snapshot }) : error("Your employee workspace has not been provisioned yet.", 404);
  }
  return NextResponse.json({ ok: true, ...peopleSnapshot(agencyId) });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
  const agencyId = getActiveAgencyId(session);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return error("Invalid request.");
  const action = text(body.action, 80);

  try {
    if (session.role === "agency-staff") {
      const self = employeePeopleSnapshot(agencyId, session.userId);
      if (!self) return error("Employee workspace not found.", 404);
      if (action === "request-leave") {
        if (!canUsePeopleStation(agencyId, session.userId, "leave", true)) return error("Time-off editing is not assigned to your workspace.", 403);
        const type = text(body.type, 40) as PeopleLeaveRequest["type"];
        const request = createPeopleLeaveRequest({
          agencyId,
          employeeId: self.employee.id,
          type,
          startsOn: text(body.startsOn, 10),
          endsOn: text(body.endsOn, 10),
          note: text(body.note, 1_000),
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, request }, { status: 201 });
      }
      if (action === "update-onboarding") {
        if (!canUsePeopleStation(agencyId, session.userId, "onboarding", true)) return error("Onboarding editing is not assigned to your workspace.", 403);
        const itemId = text(body.itemId, 120);
        const status = text(body.status, 30) as PeopleEmployee["onboardingItems"][number]["status"];
        const onboardingItems = self.employee.onboardingItems.map(item => item.id === itemId && item.owner === "employee" ? {
          ...item,
          status,
          evidence: text(body.evidence, 1_000) || item.evidence,
          completedAt: status === "done" ? Date.now() : undefined,
        } : item);
        const employee = updatePeopleEmployee(agencyId, self.employee.id, { onboardingItems }, session.userId);
        await flushPendingWrites();
        return NextResponse.json({ ok: true, employee });
      }
      if (action === "update-training") {
        if (!canUsePeopleStation(agencyId, session.userId, "training", true)) return error("Training editing is not assigned to your workspace.", 403);
        const existing = self.training.find(item => item.id === text(body.trainingId, 120));
        if (!existing) return error("Training assignment not found.", 404);
        const training = savePeopleTraining({
          ...existing,
          status: text(body.status, 30) as PeopleTrainingAssignment["status"],
          evidence: text(body.evidence, 1_000),
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, training });
      }
      return error("This employee action is not permitted.", 403);
    }

    await requireRole([...MANAGERS]);
    if (action === "update-application") {
      const stage = text(body.stage, 40) as PeopleApplicationStage;
      if (!APPLICATION_STAGES.has(stage)) return error("Choose a valid application stage.");
      const application = updatePeopleApplication({ agencyId, applicationId: text(body.applicationId, 120), actorUserId: session.userId, stage, note: text(body.note, 2_000) });
      if (!application) return error("Application not found.", 404);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, application });
    }

    if (action === "rotate-status-link") {
      const token = rotatePeopleApplicationStatusToken(agencyId, text(body.applicationId, 120));
      if (!token) return error("Application not found.", 404);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, statusUrl: new URL(`/careers/status/${token}`, req.nextUrl.origin).toString() });
    }

    if (action === "hire-candidate") {
      const application = getPeopleApplication(agencyId, text(body.applicationId, 120));
      if (!application) return error("Application not found.", 404);
      if (application.employeeId) return error("This candidate already has an employee record.", 409);
      const password = text(body.temporaryPassword, 200);
      const passwordCheck = validatePassword(password);
      if (!passwordCheck.ok) return error(passwordCheck.error || "Choose a stronger temporary password.");
      if (getUser(application.email)) return error("A user with this email already exists. Link the existing employee record instead.", 409);
      await provisionSupabaseIdentity({ email: application.email, password, name: application.name, role: "staff" });
      const user = createUser({ email: application.email, password, name: application.name, role: "agency-staff", agencyId, mustChangePassword: true });
      const employmentType = text(body.employmentType, 40) as PeopleEmploymentType;
      const employee = createPeopleEmployee({
        agencyId,
        actorUserId: session.userId,
        applicationId: application.id,
        userId: user.id,
        name: application.name,
        email: application.email,
        phone: application.phone,
        title: text(body.title, 160) || application.roleInterest,
        department: text(body.department, 120),
        employmentType: EMPLOYMENT_TYPES.has(employmentType) ? employmentType : application.employmentPreference,
        startDate: number(body.startDate),
        weeklyHours: number(body.weeklyHours),
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, employee, user: { id: user.id, email: user.email, mustChangePassword: user.mustChangePassword } }, { status: 201 });
    }

    if (action === "provision-employee") {
      const employee = getPeopleEmployee(agencyId, text(body.employeeId, 120));
      if (!employee) return error("Employee not found.", 404);
      if (employee.userId) return error("This employee already has a portal account.", 409);
      const password = text(body.temporaryPassword, 200);
      const existingUser = getUser(employee.email);
      let user;
      if (existingUser) {
        if (existingUser.agencyId !== agencyId || existingUser.role !== "agency-staff") return error("That email belongs to another account and cannot be linked automatically.", 409);
        user = existingUser;
      } else {
        const passwordCheck = validatePassword(password);
        if (!passwordCheck.ok) return error(passwordCheck.error || "Choose a stronger temporary password.");
        await provisionSupabaseIdentity({ email: employee.email, password, name: employee.name, role: "staff" });
        user = createUser({ email: employee.email, password, name: employee.name, role: "agency-staff", agencyId, mustChangePassword: true });
      }
      const updated = updatePeopleEmployee(agencyId, employee.id, { userId: user.id, status: "active" }, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, employee: updated, user: { id: user.id, email: user.email } }, { status: 201 });
    }

    if (action === "create-employee") {
      const employee = createPeopleEmployee({
        agencyId,
        actorUserId: session.userId,
        name: text(body.name, 120),
        email: text(body.email, 254),
        phone: text(body.phone, 50),
        title: text(body.title, 160),
        department: text(body.department, 120),
        employmentType: EMPLOYMENT_TYPES.has(text(body.employmentType, 40) as PeopleEmploymentType) ? text(body.employmentType, 40) as PeopleEmploymentType : undefined,
        startDate: number(body.startDate),
        weeklyHours: number(body.weeklyHours),
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, employee }, { status: 201 });
    }

    if (action === "update-employee" || action === "update-access" || action === "update-commission" || action === "update-onboarding") {
      const employeeId = text(body.employeeId, 120);
      const existing = getPeopleEmployee(agencyId, employeeId);
      if (!existing) return error("Employee not found.", 404);
      let patch: Parameters<typeof updatePeopleEmployee>[2] = {};
      if (action === "update-access") patch = { workspaceAccess: Array.isArray(body.workspaceAccess) ? body.workspaceAccess as PeopleWorkspaceAccess[] : [] };
      if (action === "update-commission") patch = { commissionRules: Array.isArray(body.commissionRules) ? body.commissionRules as PeopleCommissionRule[] : [] };
      if (action === "update-onboarding") patch = { onboardingItems: Array.isArray(body.onboardingItems) ? body.onboardingItems as PeopleEmployee["onboardingItems"] : existing.onboardingItems };
      if (action === "update-employee") {
        patch = {
          name: text(body.name, 120) || existing.name,
          email: text(body.email, 254) || existing.email,
          phone: text(body.phone, 50),
          title: text(body.title, 160) || existing.title,
          department: text(body.department, 120),
          employmentType: EMPLOYMENT_TYPES.has(text(body.employmentType, 40) as PeopleEmploymentType) ? text(body.employmentType, 40) as PeopleEmploymentType : existing.employmentType,
          status: text(body.status, 40) as PeopleEmployee["status"],
          startDate: number(body.startDate),
          endDate: number(body.endDate),
          probationEndsAt: number(body.probationEndsAt),
          weeklyHours: number(body.weeklyHours),
          holidayAllowanceDays: number(body.holidayAllowanceDays),
          payBasis: text(body.payBasis, 40) as PeopleEmployee["payBasis"],
          basePayMinor: number(body.basePayMinor),
          currency: text(body.currency, 3).toUpperCase() || existing.currency,
        };
      }
      const employee = updatePeopleEmployee(agencyId, employeeId, patch, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, employee });
    }

    if (action === "decide-leave") {
      const request = decidePeopleLeaveRequest({ agencyId, requestId: text(body.requestId, 120), status: text(body.status, 30) as "approved" | "rejected" | "cancelled", actorUserId: session.userId, note: text(body.note, 1_000) });
      if (!request) return error("Leave request not found.", 404);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, request });
    }

    if (action === "save-shift") {
      const shift = savePeopleShift({
        id: text(body.id, 120) || undefined,
        agencyId,
        employeeId: text(body.employeeId, 120),
        title: text(body.title, 160),
        startsAt: number(body.startsAt) ?? 0,
        endsAt: number(body.endsAt) ?? 0,
        location: text(body.location, 200),
        note: text(body.note, 1_000),
        status: text(body.status, 30) as PeopleShift["status"],
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, shift });
    }

    if (action === "save-training") {
      const training = savePeopleTraining({
        id: text(body.id, 120) || undefined,
        agencyId,
        employeeId: text(body.employeeId, 120),
        title: text(body.title, 200),
        description: text(body.description, 2_000),
        sopId: text(body.sopId, 160),
        resourceUrl: text(body.resourceUrl, 500),
        dueAt: number(body.dueAt),
        status: text(body.status, 30) as PeopleTrainingAssignment["status"],
        evidence: text(body.evidence, 1_000),
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, training });
    }

    return error("Unknown People action.", 404);
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : "The People record could not be updated.", 400);
  }
}
