import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getActiveAgencyId, requireRole } from "@/lib/server/auth/auth";
import { requireClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import {
  getStaffProvisioningOperation,
  runStaffProvisioning,
  StaffProvisioningConflictError,
  StaffProvisioningRecoveryError,
} from "@/server/staffProvisioning";
import {
  acknowledgePeopleContract,
  addPeopleFreelancerDeliverable,
  awardPeopleRecognition,
  completeModuleAssignment,
  createPeopleContract,
  createPeopleEmployee,
  createPeopleFeedback,
  createPeopleLeaveRequest,
  decidePeopleLeaveRequest,
  employeePeopleSnapshot,
  getPeopleApplication,
  getPeopleEmployee,
  getPeopleTrainingModule,
  listPeopleContracts,
  listPeopleFeedback,
  listPeopleFreelancerJobs,
  listPeopleRecognitions,
  peopleSnapshot,
  savePeopleHiringStages,
  savePeopleOnboardingTemplate,
  savePeopleTrainingModule,
  sendPeopleContract,
  setPeopleFeedbackStatus,
  rotatePeopleApplicationStatusToken,
  savePeopleFreelancerJob,
  savePeopleShift,
  savePeopleTraining,
  setPeopleFreelancerJobStatus,
  updatePeopleApplication,
  updatePeopleEmployee,
  PeopleIdentityConflictError,
} from "@/server/people";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type {
  PeopleApplicationStage,
  PeopleCommissionRule,
  PeopleEmployee,
  PeopleEmploymentType,
  PeopleLeaveRequest,
  PeopleContractKind,
  PeopleFeedback,
  PeopleFeedbackSentiment,
  PeopleFreelancerJobStatus,
  PeopleRecognitionKind,
  PeopleShift,
  PeopleTrainingAssignment,
  PeopleWorkspaceAccess,
} from "@/server/types";
import { getUser, validatePassword } from "@/server/users";
import {
  assertWorkspaceElementAccess,
  currentWorkspaceElementAccess,
  redactPeopleEmployeePay,
  STAFF_STATION_ELEMENT_KEYS,
  staffStationAccessEntries,
  workspaceElementLevel,
  type WorkspaceElementAccess,
} from "@/lib/server/access/workspaceElementAccess";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";
import { projectPeopleWorkspaceSnapshot } from "@/lib/server/access/peopleWorkspaceProjection";
import { privateObjectLifecycleLockKey } from "@/lib/server/privateObjectLifecycle";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { SopReferenceValidationError } from "@/engines/sop/server/sopReferences";

export const runtime = "nodejs";

const MANAGERS = ["agency-owner", "agency-manager"] as const;
const APPLICATION_STAGES = new Set<PeopleApplicationStage>(["applied", "under-review", "interview", "shortlisted", "offer", "accepted", "onboarding", "declined", "withdrawn"]);
const EMPLOYMENT_TYPES = new Set<PeopleEmploymentType>(["full-time", "part-time", "contractor", "freelancer", "intern", "volunteer"]);
const FREELANCER_JOB_STATUSES = new Set<PeopleFreelancerJobStatus>(["proposed", "active", "delivered", "paid", "cancelled"]);

function freelancerStatus(value: unknown): PeopleFreelancerJobStatus | undefined {
  const parsed = text(value, 30) as PeopleFreelancerJobStatus;
  return FREELANCER_JOB_STATUSES.has(parsed) ? parsed : undefined;
}

function text(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown): number | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function peopleNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function requireManagerPeopleAction(
  access: WorkspaceElementAccess,
  action: string,
  body: Record<string, unknown>,
): void {
  if (action === "update-access") {
    assertWorkspaceElementAccess(access, "workspace.settings", "manage");
    return;
  }
  if (action === "update-commission") {
    assertWorkspaceElementAccess(access, "staff.pay", "manage");
    return;
  }
  if (["save-freelancer-job", "set-freelancer-job-status", "add-freelancer-deliverable"].includes(action)) {
    assertWorkspaceElementAccess(access, "staff.people", "use");
    // Freelancer fees, payment references and paid state are compensation data.
    assertWorkspaceElementAccess(access, "staff.pay", "manage");
    return;
  }
  if (action === "update-employee") {
    assertWorkspaceElementAccess(access, "staff.people", "manage");
    if (["payBasis", "basePayMinor", "currency"].some(field => body[field] !== undefined)) {
      assertWorkspaceElementAccess(access, "staff.pay", "manage");
    }
    if (["weeklyHours", "holidayAllowanceDays"].some(field => body[field] !== undefined)) {
      assertWorkspaceElementAccess(access, "staff.schedule", "manage");
    }
    return;
  }
  if (["decide-leave", "save-shift"].includes(action)) {
    assertWorkspaceElementAccess(access, "staff.schedule", "use");
    return;
  }
  if (["save-training", "assign-module", "update-onboarding"].includes(action)) {
    assertWorkspaceElementAccess(access, "staff.training", "use");
    return;
  }
  if (["save-training-module", "save-onboarding-template"].includes(action)) {
    assertWorkspaceElementAccess(access, "staff.training", "manage");
    return;
  }
  if ([
    "hire-candidate",
    "provision-employee",
    "create-employee",
    "save-hiring-stages",
    "create-contract",
    "send-contract",
  ].includes(action)) {
    assertWorkspaceElementAccess(access, "staff.people", "manage");
    return;
  }
  if ([
    "update-application",
    "rotate-status-link",
    "award-recognition",
    "set-feedback-status",
  ].includes(action)) {
    assertWorkspaceElementAccess(access, "staff.people", "use");
  }
}

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const agencyId = getActiveAgencyId(session);
    const { actor, access } = await currentWorkspaceElementAccess("staff");
    if (!Object.values(access.levels).some(level => level !== "hidden")) throw new AuthError(403, "staff_workspace_forbidden");
    const payVisible = workspaceElementLevel(access, "staff.pay") !== "hidden";
    const scheduleVisible = workspaceElementLevel(access, "staff.schedule") !== "hidden";
    const trainingVisible = workspaceElementLevel(access, "staff.training") !== "hidden";
    if (session.role === "agency-staff") {
      const snapshot = employeePeopleSnapshot(agencyId, session.userId);
      if (!snapshot) return error("Your employee workspace has not been provisioned yet.", 404);
      const stationAccess = staffStationAccessEntries(actor, access);
      const employee = payVisible
        ? { ...snapshot.employee, workspaceAccess: stationAccess }
        : redactPeopleEmployeePay({ ...snapshot.employee, workspaceAccess: stationAccess });
      return NextResponse.json({
        ok: true,
        ...snapshot,
        employee: trainingVisible ? employee : { ...employee, onboardingItems: [] },
        leaveRequests: scheduleVisible ? snapshot.leaveRequests : [],
        shifts: scheduleVisible ? snapshot.shifts : [],
        training: trainingVisible ? snapshot.training : [],
        modules: trainingVisible ? snapshot.modules : [],
        stations: snapshot.stations.filter(station => stationAccess.some(item => item.stationId === station.id)),
      });
    }
    const snapshot = peopleSnapshot(agencyId);
    return NextResponse.json({ ok: true, ...projectPeopleWorkspaceSnapshot(snapshot, access) });
  } catch (cause) {
    if (cause instanceof AccessControlError) return accessErrorResponse(cause);
    return authErrorResponse(cause);
  }
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  // `requireRole` INSIDE the try — it used to sit above it.
  //
  // The catch below already converts AuthError and AccessControlError into
  // their proper responses, and the GET handler in this file has always done
  // so. The POST threw its 401 from outside the try, so Next.js saw an
  // unhandled exception and answered **500** to every unauthenticated caller —
  // an error object that literally carries `status: 401`, reported as a server
  // fault. Found by the Phase D sweep of all 180 mutating routes on
  // 2026-08-27.
  //
  // It mattered twice over: the caller got the wrong answer, and every
  // unauthenticated POST wrote a stack trace into the error log, which is how
  // a real incident gets lost among the noise.
  try {
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    const agencyId = getActiveAgencyId(session);
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return error("Invalid request.");
    const action = text(body.action, 80);

    const { access } = await currentWorkspaceElementAccess("staff");
    if (session.role === "agency-staff") {
      const self = employeePeopleSnapshot(agencyId, session.userId);
      if (!self) return error("Employee workspace not found.", 404);
      if (action === "request-leave") {
        assertWorkspaceElementAccess(access, STAFF_STATION_ELEMENT_KEYS.leave, "use");
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
        assertWorkspaceElementAccess(access, STAFF_STATION_ELEMENT_KEYS.onboarding, "use");
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
        assertWorkspaceElementAccess(access, STAFF_STATION_ELEMENT_KEYS.training, "use");
        const existing = self.training.find(item => item.id === text(body.trainingId, 120));
        if (!existing) return error("Training assignment not found.", 404);
        const training = await withPortalStateTransaction(privateObjectLifecycleLockKey(agencyId), () =>
          savePeopleTraining({
            ...existing,
            status: text(body.status, 30) as PeopleTrainingAssignment["status"],
            evidence: text(body.evidence, 1_000),
          }));
        return NextResponse.json({ ok: true, training });
      }
      if (action === "complete-module") {
        assertWorkspaceElementAccess(access, STAFF_STATION_ELEMENT_KEYS.training, "use");
        const answers = (body.answers && typeof body.answers === "object") ? body.answers as Record<string, string> : {};
        const outcome = completeModuleAssignment({ agencyId, assignmentId: text(body.assignmentId, 120), userId: session.userId, answers });
        if (!outcome) return error("Training assignment not found.", 404);
        await flushPendingWrites();
        return NextResponse.json({ ok: true, training: outcome.assignment, result: outcome.result });
      }
      if (action === "acknowledge-contract") {
        assertWorkspaceElementAccess(access, "staff.people", "use");
        const contract = acknowledgePeopleContract({ agencyId, contractId: text(body.contractId, 120), userId: session.userId, name: text(body.name, 120), decline: Boolean(body.decline) });
        if (!contract) return error("Contract not found or not yours to sign.", 404);
        await flushPendingWrites();
        return NextResponse.json({ ok: true, contract });
      }
      if (action === "submit-feedback") {
        assertWorkspaceElementAccess(access, STAFF_STATION_ELEMENT_KEYS.progression, "use");
        const feedback = createPeopleFeedback({
          agencyId,
          employeeId: self.employee.id,
          message: text(body.message, 4_000),
          sentiment: text(body.sentiment, 20) as PeopleFeedbackSentiment,
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, feedback }, { status: 201 });
      }
      return error("This employee action is not permitted.", 403);
    }

    await requireRole([...MANAGERS]);
    requireManagerPeopleAction(access, action, body);
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
      const password = text(body.temporaryPassword, 200);
      const passwordCheck = validatePassword(password);
      if (!passwordCheck.ok) return error(passwordCheck.error || "Choose a stronger temporary password.");
      const employmentType = text(body.employmentType, 40) as PeopleEmploymentType;
      const result = await runStaffProvisioning({
        agencyId,
        actorUserId: session.userId,
        email: application.email,
        name: application.name,
        password,
        localRole: "agency-staff",
        mustChangePassword: true,
        target: {
          kind: "candidate",
          applicationId: application.id,
          title: text(body.title, 160) || application.roleInterest,
          department: text(body.department, 120),
          employmentType: EMPLOYMENT_TYPES.has(employmentType) ? employmentType : application.employmentPreference ?? "full-time",
          startDate: peopleNumber(body.startDate),
          weeklyHours: peopleNumber(body.weeklyHours),
        },
      });
      return NextResponse.json({
        ok: true,
        employee: result.employee,
        user: { id: result.user.id, email: result.user.email, mustChangePassword: result.user.mustChangePassword },
        resumed: result.resumed,
      }, { status: 201 });
    }

    if (action === "provision-employee") {
      const employee = getPeopleEmployee(agencyId, text(body.employeeId, 120));
      if (!employee) return error("Employee not found.", 404);
      const password = text(body.temporaryPassword, 200);
      const existingUser = getUser(employee.email);
      if (employee.userId) {
        const operation = getStaffProvisioningOperation(agencyId, employee.email);
        if (
          !operation
          || operation.targetKind !== "employee"
          || operation.targetId !== employee.id
          || operation.localUserId !== employee.userId
        ) return error("This employee already has a portal account.", 409);
      }
      let user;
      if (existingUser && !employee.userId) {
        if (existingUser.agencyId !== agencyId || existingUser.role !== "agency-staff") return error("That email belongs to another account and cannot be linked automatically.", 409);
        user = existingUser;
        const updated = updatePeopleEmployee(agencyId, employee.id, { userId: user.id, status: "active" }, session.userId);
        await flushPendingWrites();
        return NextResponse.json({ ok: true, employee: updated, user: { id: user.id, email: user.email }, resumed: false }, { status: 201 });
      } else {
        const passwordCheck = validatePassword(password);
        if (!passwordCheck.ok) return error(passwordCheck.error || "Choose a stronger temporary password.");
        const result = await runStaffProvisioning({
          agencyId,
          actorUserId: session.userId,
          email: employee.email,
          name: employee.name,
          password,
          localRole: "agency-staff",
          mustChangePassword: true,
          target: { kind: "employee", employeeId: employee.id },
        });
        return NextResponse.json({ ok: true, employee: result.employee, user: { id: result.user.id, email: result.user.email }, resumed: result.resumed }, { status: 201 });
      }
    }

    if (action === "create-employee") {
      const employmentType = body.employmentType === undefined
        ? undefined
        : text(body.employmentType, 40) as PeopleEmploymentType;
      const employee = createPeopleEmployee({
        agencyId,
        actorUserId: session.userId,
        name: text(body.name, 120),
        email: text(body.email, 254),
        phone: text(body.phone, 50),
        title: text(body.title, 160),
        department: text(body.department, 120),
        employmentType,
        startDate: peopleNumber(body.startDate),
        weeklyHours: peopleNumber(body.weeklyHours),
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
      if (action === "update-commission") {
        if (!Array.isArray(body.commissionRules)) return error("Commission rules must be an array.");
        patch = { commissionRules: body.commissionRules as PeopleCommissionRule[] };
      }
      if (action === "update-onboarding") {
        if (!Array.isArray(body.onboardingItems)) return error("Onboarding items must be an array.");
        patch = { onboardingItems: body.onboardingItems as PeopleEmployee["onboardingItems"] };
      }
      if (action === "update-employee") {
        patch = {
          ...(body.name !== undefined ? { name: text(body.name, 120) || existing.name } : {}),
          ...(body.email !== undefined ? { email: text(body.email, 254) || existing.email } : {}),
          ...(body.phone !== undefined ? { phone: text(body.phone, 50) } : {}),
          ...(body.title !== undefined ? { title: text(body.title, 160) || existing.title } : {}),
          ...(body.department !== undefined ? { department: text(body.department, 120) } : {}),
          ...(body.managerEmployeeId !== undefined ? { managerEmployeeId: text(body.managerEmployeeId, 120) || undefined } : {}),
          ...(body.employmentType !== undefined ? { employmentType: text(body.employmentType, 40) as PeopleEmploymentType } : {}),
          ...(body.status !== undefined ? { status: text(body.status, 40) as PeopleEmployee["status"] } : {}),
          ...(body.startDate !== undefined ? { startDate: peopleNumber(body.startDate) } : {}),
          ...(body.endDate !== undefined ? { endDate: peopleNumber(body.endDate) } : {}),
          ...(body.probationEndsAt !== undefined ? { probationEndsAt: peopleNumber(body.probationEndsAt) } : {}),
          ...(body.weeklyHours !== undefined ? { weeklyHours: peopleNumber(body.weeklyHours) } : {}),
          ...(body.holidayAllowanceDays !== undefined ? { holidayAllowanceDays: peopleNumber(body.holidayAllowanceDays) } : {}),
          ...(body.payBasis !== undefined ? { payBasis: text(body.payBasis, 40) as PeopleEmployee["payBasis"] } : {}),
          ...(body.basePayMinor !== undefined ? { basePayMinor: peopleNumber(body.basePayMinor) } : {}),
          ...(body.currency !== undefined ? { currency: text(body.currency, 3).toUpperCase() } : {}),
          ...(body.targetRole !== undefined ? { targetRole: text(body.targetRole, 160) || undefined } : {}),
          ...(body.growthPathNote !== undefined ? { growthPathNote: text(body.growthPathNote, 2_000) || undefined } : {}),
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
        startsAt: peopleNumber(body.startsAt) ?? 0,
        endsAt: peopleNumber(body.endsAt) ?? 0,
        location: text(body.location, 200),
        note: text(body.note, 1_000),
        status: text(body.status, 30) as PeopleShift["status"],
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, shift });
    }

    if (action === "save-training") {
      const training = await withPortalStateTransaction(privateObjectLifecycleLockKey(agencyId), () =>
        savePeopleTraining({
          id: text(body.id, 120) || undefined,
          agencyId,
          employeeId: text(body.employeeId, 120),
          title: text(body.title, 200),
          description: text(body.description, 2_000),
          sopId: text(body.sopId, 160),
          resourceUrl: text(body.resourceUrl, 500),
          dueAt: peopleNumber(body.dueAt),
          status: text(body.status, 30) as PeopleTrainingAssignment["status"],
          evidence: text(body.evidence, 1_000),
        }));
      return NextResponse.json({ ok: true, training });
    }

    if (action === "save-freelancer-job") {
      const requestedClientId = text(body.clientId, 120);
      const clientScope = routeTenantScope(session, { clientId: requestedClientId });
      if (requestedClientId && !clientScope.client) return error("Client not found.", 404);
      // Tenancy first (above), then the CLIENT ELEMENT. Proving the client
      // belongs to this agency is not the same as proving this person may place
      // delivery work against them: a governed identity restricted away from a
      // client could still assign a freelancer to that client's job.
      //
      // `client.fulfilment` — the element the client workspace calls Delivery —
      // because that is what a freelancer job IS. The contractor's own view of
      // the same job stays governed by `FreelancerAccessConfig`, which decides
      // whether the client is even named to them; that is a deliberate
      // alternative authority, not a gap.
      await requireClientAssociation("freelancer-job", clientScope.clientId, "use");
      const job = savePeopleFreelancerJob({
        agencyId,
        actorUserId: session.userId,
        id: text(body.id, 120) || undefined,
        employeeId: text(body.employeeId, 120),
        title: text(body.title, 200),
        brief: text(body.brief, 4_000),
        // The one id in this whole file that comes from the request rather
        // than from the session: a freelancer job may name the client it is
        // for, so it is proven to be this agency's before it is stored.
        clientId: clientScope.clientId ?? "",
        feeMinor: number(body.feeMinor),
        currency: text(body.currency, 3),
        startsOn: text(body.startsOn, 10),
        dueOn: text(body.dueOn, 10),
        notes: text(body.notes, 2_000),
        status: freelancerStatus(body.status),
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, job, jobs: listPeopleFreelancerJobs(agencyId, job.employeeId) }, { status: 201 });
    }

    if (action === "set-freelancer-job-status") {
      const status = freelancerStatus(body.status);
      if (!status) return error("Choose a valid job status.");
      const job = setPeopleFreelancerJobStatus({
        agencyId,
        jobId: text(body.jobId, 120),
        status,
        actorUserId: session.userId,
        paymentRef: text(body.paymentRef, 160),
      });
      if (!job) return error("Freelancer job not found.", 404);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, job, jobs: listPeopleFreelancerJobs(agencyId, job.employeeId) });
    }

    if (action === "add-freelancer-deliverable") {
      const job = addPeopleFreelancerDeliverable({
        agencyId,
        actorUserId: session.userId,
        jobId: text(body.jobId, 120),
        name: text(body.name, 180),
        url: text(body.url, 2_000),
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, job, jobs: listPeopleFreelancerJobs(agencyId, job.employeeId) }, { status: 201 });
    }

    if (action === "award-recognition") {
      const kind = text(body.kind, 30) === "shoutout" ? "shoutout" : "employee-of-month";
      const recognition = awardPeopleRecognition({
        agencyId,
        actorUserId: session.userId,
        employeeId: text(body.employeeId, 120),
        kind: kind as PeopleRecognitionKind,
        period: text(body.period, 7),
        note: text(body.note, 1_000),
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, recognition, recognitions: listPeopleRecognitions(agencyId, recognition.employeeId) }, { status: 201 });
    }

    if (action === "save-training-module") {
      const module = savePeopleTrainingModule({
        agencyId,
        actorUserId: session.userId,
        id: text(body.id, 120) || undefined,
        title: text(body.title, 200),
        summary: text(body.summary, 1_000),
        blocks: Array.isArray(body.blocks) ? body.blocks as import("@/server/types").PeopleTrainingBlock[] : undefined,
        quiz: Array.isArray(body.quiz) ? body.quiz as import("@/server/types").PeopleTrainingQuizQuestion[] : undefined,
        passMark: number(body.passMark),
        status: text(body.status, 20) === "published" ? "published" : text(body.status, 20) === "draft" ? "draft" : undefined,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, module, modules: peopleSnapshot(agencyId).trainingModules }, { status: 201 });
    }

    if (action === "assign-module") {
      const module = getPeopleTrainingModule(agencyId, text(body.moduleId, 120));
      if (!module) return error("Module not found.", 404);
      const training = savePeopleTraining({
        agencyId,
        employeeId: text(body.employeeId, 120),
        title: module.title,
        description: module.summary,
        moduleId: module.id,
        dueAt: number(body.dueAt),
        status: "assigned",
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, training }, { status: 201 });
    }

    if (action === "save-onboarding-template") {
      const steps = Array.isArray(body.steps) ? body.steps as Array<{ id?: string; label: string; owner?: "company" | "employee"; detail?: string; requiresEvidence?: boolean }> : [];
      const config = savePeopleOnboardingTemplate(agencyId, steps, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, processConfig: config });
    }

    if (action === "save-hiring-stages") {
      const stages = Array.isArray(body.stages) ? body.stages as Array<{ id: string; label?: string; guidance?: string }> : [];
      const config = savePeopleHiringStages(agencyId, stages, session.userId);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, processConfig: config });
    }

    if (action === "create-contract") {
      const contract = createPeopleContract({
        agencyId,
        actorUserId: session.userId,
        employeeId: text(body.employeeId, 120),
        kind: text(body.kind, 30) as PeopleContractKind,
        title: text(body.title, 200),
        summary: text(body.summary, 500),
        body: text(body.body, 40_000),
        templateId: text(body.templateId, 120) || undefined,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, contract, contracts: listPeopleContracts(agencyId, contract.employeeId) }, { status: 201 });
    }

    if (action === "send-contract") {
      const contract = sendPeopleContract(agencyId, text(body.contractId, 120), session.userId);
      if (!contract) return error("Contract not found.", 404);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, contract, contracts: listPeopleContracts(agencyId, contract.employeeId) });
    }

    if (action === "set-feedback-status") {
      const status = text(body.status, 20);
      if (!["new", "read", "actioned"].includes(status)) return error("Choose a valid feedback status.");
      const feedback = setPeopleFeedbackStatus(agencyId, text(body.feedbackId, 120), status as PeopleFeedback["status"]);
      if (!feedback) return error("Feedback not found.", 404);
      await flushPendingWrites();
      return NextResponse.json({ ok: true, feedback, feedbackList: listPeopleFeedback(agencyId, feedback.employeeId) });
    }

    return error("Unknown People action.", 404);
  } catch (cause) {
    if (cause instanceof SopReferenceValidationError) {
      return NextResponse.json({
        ok: false,
        reason: cause.code,
        error: cause.message,
        field: cause.field,
        sopIds: cause.sopIds,
      }, { status: 422 });
    }
    if (cause instanceof AccessControlError) return accessErrorResponse(cause);
    if (cause instanceof AuthError) return authErrorResponse(cause);
    if (cause instanceof StaffProvisioningRecoveryError) {
      return NextResponse.json({
        ok: false,
        error: `${cause.message} Retry the same staff setup to resume safely.`,
        retryable: true,
        provisioningStage: cause.stage,
      }, { status: 503 });
    }
    return error(
      cause instanceof Error ? cause.message : "The People record could not be updated.",
      cause instanceof PeopleIdentityConflictError || cause instanceof StaffProvisioningConflictError ? 409 : 400,
    );
  }
}
