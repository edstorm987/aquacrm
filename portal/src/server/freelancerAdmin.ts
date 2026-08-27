import "server-only";
// Agency-side freelancer management — create + list the freelancers whose own
// limited workspace is served by freelancerWorkspace.ts. A freelancer is a
// `PeopleEmployee` (employmentType freelancer) linked to a `role: "freelancer"`
// login. This module CALLS the people/users domains via their exports (it does
// not edit server/people.ts, the Staff worker's file).

import crypto from "crypto";
import { createPeopleEmployee, getPeopleEmployeeByUserId, listPeopleEmployees, listPeopleFreelancerJobs } from "@/server/people";
import { createUser, getUser, getUserById, updateUser } from "@/server/users";
import type { PeopleFreelancerJobStatus } from "@/server/types";
import {
  runStaffProvisioning,
  getStaffProvisioningOperation,
  StaffProvisioningConflictError,
  StaffProvisioningRecoveryError,
  type StaffProvisioningRuntime,
} from "@/server/staffProvisioning";
import { signPasswordResetToken } from "@/lib/server/auth/passwordReset";
import { sendTransactionalEmail } from "@/lib/server/email/transactionalEmail";
import { flushPendingWrites } from "@/server/storage";

export interface FreelancerAdminRow {
  employeeId: string;
  name: string;
  email: string;
  title: string;
  userId?: string;
  setupPending: boolean;
  jobs: { id: string; title: string; status: PeopleFreelancerJobStatus }[];
}

// Every freelancer this agency has, with their assigned jobs — for the
// management surface.
export function listAgencyFreelancers(agencyId: string): FreelancerAdminRow[] {
  return listPeopleEmployees(agencyId)
    .filter(employee => employee.employmentType === "freelancer")
    .map(employee => ({
      employeeId: employee.id,
      name: employee.name,
      email: employee.email,
      title: employee.title,
      userId: employee.userId,
      setupPending: employee.userId ? Boolean(getUserById(employee.userId)?.mustChangePassword) : true,
      jobs: listPeopleFreelancerJobs(agencyId, employee.id).map(job => ({ id: job.id, title: job.title, status: job.status })),
    }));
}

export interface CreateFreelancerResult {
  ok: boolean;
  error?: string;
  employeeId?: string;
  userId?: string;
}

// Local-only fixture helper retained for demo/preview seeding. The mounted API
// uses inviteFreelancer() below so a real person receives a Supabase-backed
// setup path rather than an undisclosed random local password.
export function createFreelancer(
  agencyId: string,
  actorUserId: string,
  input: { name?: string; email?: string; title?: string },
): CreateFreelancerResult {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  if (!name) return { ok: false, error: "name_required" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "email_invalid" };

  let user = getUser(email);
  if (user && user.agencyId !== agencyId) return { ok: false, error: "email_in_use" };
  if (!user) {
    user = createUser({
      email,
      name,
      role: "freelancer",
      agencyId,
      password: `fl-${crypto.randomBytes(24).toString("hex")}`,
    });
  }

  let employee = getPeopleEmployeeByUserId(agencyId, user.id);
  if (!employee) {
    employee = createPeopleEmployee({
      agencyId,
      actorUserId,
      userId: user.id,
      name,
      email,
      title: (input.title ?? "").trim() || "Freelancer",
      employmentType: "freelancer",
    });
  }
  return { ok: true, employeeId: employee.id, userId: user.id };
}

export interface InviteFreelancerResult extends CreateFreelancerResult {
  inviteDelivered?: boolean;
  setupUrl?: string;
  resumed?: boolean;
  retryable?: boolean;
  provisioningStage?: string;
}

export interface InviteFreelancerDependencies {
  runtime?: StaffProvisioningRuntime;
  signSetupToken?: typeof signPasswordResetToken;
  sendEmail?: typeof sendTransactionalEmail;
  now?: () => number;
}

export async function inviteFreelancer(
  agencyId: string,
  actorUserId: string,
  input: { name?: string; email?: string; title?: string; origin: string },
  dependencies: InviteFreelancerDependencies = {},
): Promise<InviteFreelancerResult> {
  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const title = (input.title ?? "").trim() || "Freelancer";
  if (!name) return { ok: false, error: "name_required" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "email_invalid" };

  const existingUser = getUser(email);
  if (existingUser && (existingUser.agencyId !== agencyId || existingUser.role !== "freelancer")) {
    return { ok: false, error: "email_in_use" };
  }
  const existingEmployee = listPeopleEmployees(agencyId).find(employee => employee.email === email);
  if (existingEmployee && existingEmployee.employmentType !== "freelancer") {
    return { ok: false, error: "email_in_use" };
  }

  const password = `fl-${crypto.randomBytes(32).toString("base64url")}`;
  try {
    const existingOperation = getStaffProvisioningOperation(agencyId, email);
    const common = {
      agencyId,
      actorUserId,
      email,
      name,
      password,
      localRole: "freelancer",
      mustChangePassword: true,
      existingLocalUserId: existingUser?.id,
    } as const;
    // Preserve the original target shape on retry. Once a new-freelancer
    // operation has linked its People record, deriving the target only from
    // current state would turn the same request into an "employee" intent and
    // incorrectly conflict with its own durable fingerprint.
    const resumeNewFreelancer = existingOperation?.targetKind === "freelancer";
    const result = existingEmployee && !resumeNewFreelancer
      ? await runStaffProvisioning({ ...common, target: { kind: "employee", employeeId: existingEmployee.id } }, dependencies.runtime)
      : await runStaffProvisioning({ ...common, target: { kind: "freelancer", title } }, dependencies.runtime);
    if (!result.user.mustChangePassword) {
      updateUser(result.user.email, { mustChangePassword: true });
      await flushPendingWrites();
    }

    const { token } = (dependencies.signSetupToken ?? signPasswordResetToken)({ userId: result.user.id, email: result.user.email });
    const setupUrl = `${input.origin.replace(/\/$/, "")}/login/reset?token=${encodeURIComponent(token)}`;
    const sent = await (dependencies.sendEmail ?? sendTransactionalEmail)({
      to: result.user.email,
      agencyId,
      externalRef: `freelancer-invite:${result.operation.id}:${(dependencies.now ?? Date.now)()}`,
      subject: "Set up your freelancer workspace",
      bodyText: `You have been invited to a freelancer workspace. Set your password using this secure link (valid for 24 hours):\n\n${setupUrl}`,
      bodyHtml: `<p>You have been invited to a freelancer workspace.</p><p><a href="${setupUrl}">Set up your password</a></p><p>This link is valid for 24 hours.</p>`,
    });
    return {
      ok: true,
      employeeId: result.employee?.id,
      userId: result.user.id,
      inviteDelivered: sent.delivered,
      // In production a delivered email keeps the token out of the response.
      // If delivery is unavailable, the authenticated owner/manager still gets
      // the one usable setup link instead of a permanently unreachable account.
      setupUrl: process.env.NODE_ENV === "production" && sent.delivered ? undefined : setupUrl,
      resumed: result.resumed,
    };
  } catch (error) {
    if (error instanceof StaffProvisioningRecoveryError) {
      return { ok: false, error: error.message, retryable: true, provisioningStage: error.stage };
    }
    if (error instanceof StaffProvisioningConflictError) return { ok: false, error: "email_in_use" };
    throw error;
  }
}

// The login userId for a freelancer employee (for preview minting).
export function freelancerLoginUserId(agencyId: string, employeeId: string): string | null {
  const employee = listPeopleEmployees(agencyId).find(e => e.id === employeeId && e.employmentType === "freelancer");
  if (!employee?.userId) return null;
  return getUserById(employee.userId)?.id ?? null;
}
