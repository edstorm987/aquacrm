import "server-only";
// Agency-side freelancer management — create + list the freelancers whose own
// limited workspace is served by freelancerWorkspace.ts. A freelancer is a
// `PeopleEmployee` (employmentType freelancer) linked to a `role: "freelancer"`
// login. This module CALLS the people/users domains via their exports (it does
// not edit server/people.ts, the Staff worker's file).

import crypto from "crypto";
import { createPeopleEmployee, getPeopleEmployeeByUserId, listPeopleEmployees, listPeopleFreelancerJobs } from "@/server/people";
import { createUser, getUser, getUserById } from "@/server/users";
import type { PeopleFreelancerJobStatus } from "@/server/types";

export interface FreelancerAdminRow {
  employeeId: string;
  name: string;
  email: string;
  title: string;
  userId?: string;
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
      jobs: listPeopleFreelancerJobs(agencyId, employee.id).map(job => ({ id: job.id, title: job.title, status: job.status })),
    }));
}

export interface CreateFreelancerResult {
  ok: boolean;
  error?: string;
  employeeId?: string;
  userId?: string;
}

// Create a freelancer: a `role: "freelancer"` login (random password — they
// reach the workspace via preview or, later, an invite link, never a guessed
// password) linked to a new PeopleEmployee. Idempotent on email.
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

// The login userId for a freelancer employee (for preview minting).
export function freelancerLoginUserId(agencyId: string, employeeId: string): string | null {
  const employee = listPeopleEmployees(agencyId).find(e => e.id === employeeId && e.employmentType === "freelancer");
  if (!employee?.userId) return null;
  return getUserById(employee.userId)?.id ?? null;
}
