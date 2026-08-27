import "server-only";

import crypto from "node:crypto";

import { provisionOrAdoptSupabaseIdentity } from "@/lib/supabase/admin";
import {
  createPeopleEmployee,
  getPeopleApplication,
  getPeopleEmployee,
  updatePeopleEmployee,
} from "./people";
import { flushPendingWrites, getState, mutate } from "./storage";
import type {
  PeopleEmployee,
  PeopleEmploymentType,
  ServerUser,
  StaffProvisioningOperation,
} from "./types";
import { createUser, getUser, updateUser } from "./users";

interface StaffProvisioningBaseIntent {
  agencyId: string;
  actorUserId: string;
  email: string;
  name: string;
  password: string;
  localRole: "agency-manager" | "agency-staff" | "freelancer";
  mustChangePassword?: boolean;
  /** Adopt an already-linked local user while provisioning its missing provider identity. */
  existingLocalUserId?: string;
}

export type StaffProvisioningIntent = StaffProvisioningBaseIntent & ({
  target: {
    kind: "agency-user";
    username?: string;
    companyIds: string[];
  };
} | {
  target: {
    kind: "candidate";
    applicationId: string;
    title: string;
    department?: string;
    employmentType: PeopleEmploymentType;
    startDate?: number;
    weeklyHours?: number;
  };
} | {
  target: {
    kind: "employee";
    employeeId: string;
  };
} | {
  target: {
    kind: "freelancer";
    title: string;
  };
});

export interface StaffProvisioningResult {
  operation: StaffProvisioningOperation;
  user: ServerUser;
  employee?: PeopleEmployee;
  resumed: boolean;
}

interface TargetResult {
  employee?: PeopleEmployee;
}

export interface StaffProvisioningRuntime {
  readOperation(key: string): StaffProvisioningOperation | undefined;
  writeOperation(key: string, operation: StaffProvisioningOperation): void;
  flush(): Promise<void>;
  provisionProvider(input: {
    operationId: string;
    email: string;
    password: string;
    name: string;
    agencyId: string;
    profileRole: "staff" | "client";
  }): Promise<{ id: string }>;
  findLocalUser(email: string): ServerUser | null;
  createLocalUser(input: {
    id: string;
    email: string;
    password: string;
    name: string;
    username?: string;
    role: "agency-manager" | "agency-staff" | "freelancer";
    agencyId: string;
    mustChangePassword?: boolean;
  }): ServerUser;
  finaliseTarget(intent: StaffProvisioningIntent, user: ServerUser, operation: StaffProvisioningOperation): TargetResult;
  resolveResult(operation: StaffProvisioningOperation): { user: ServerUser | null; employee?: PeopleEmployee };
  now(): number;
}

export class StaffProvisioningConflictError extends Error {}
export class StaffProvisioningRecoveryError extends Error {
  readonly retryable = true;

  constructor(message: string, readonly stage: StaffProvisioningOperation["stage"]) {
    super(message);
    this.name = "StaffProvisioningRecoveryError";
  }
}

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter(key => object[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function digest(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

export function staffProvisioningOperationKey(agencyId: string, email: string): string {
  return digest("staff-provisioning", agencyId, canonicalEmail(email));
}

function targetId(intent: StaffProvisioningIntent): string {
  if (intent.target.kind === "agency-user") return canonicalEmail(intent.email);
  if (intent.target.kind === "candidate") return intent.target.applicationId;
  if (intent.target.kind === "freelancer") return canonicalEmail(intent.email);
  return intent.target.employeeId;
}

function intentFingerprint(intent: StaffProvisioningIntent): string {
  return digest(stableJson({
    agencyId: intent.agencyId,
    email: canonicalEmail(intent.email),
    name: intent.name.trim(),
    localRole: intent.localRole,
    mustChangePassword: intent.mustChangePassword,
    target: intent.target,
  }));
}

function plannedId(prefix: "usr" | "employee", operationId: string): string {
  return `${prefix}_${digest(prefix, operationId).slice(0, 16)}`;
}

function assertMatchingLocalUser(user: ServerUser, intent: StaffProvisioningIntent, operation: StaffProvisioningOperation): void {
  if (
    user.id !== operation.localUserId
    || user.agencyId !== intent.agencyId
    || user.role !== intent.localRole
    || canonicalEmail(user.email) !== canonicalEmail(intent.email)
  ) {
    throw new StaffProvisioningConflictError("That email belongs to a different local account and cannot be adopted.");
  }
}

function defaultFinaliseTarget(
  intent: StaffProvisioningIntent,
  user: ServerUser,
  operation: StaffProvisioningOperation,
): TargetResult {
  if (intent.target.kind === "agency-user") {
    const assigned = intent.target.companyIds.length
      ? updateUser(user.email, { companyIds: intent.target.companyIds })
      : user;
    if (!assigned) throw new Error("The local staff user could not be assigned.");
    return {};
  }

  if (intent.target.kind === "employee") {
    const employee = getPeopleEmployee(intent.agencyId, intent.target.employeeId);
    if (!employee) throw new StaffProvisioningConflictError("Employee not found.");
    if (employee.userId && employee.userId !== user.id) {
      throw new StaffProvisioningConflictError("This employee is linked to a different portal account.");
    }
    const linked = employee.userId === user.id && employee.status === "active"
      ? employee
      : updatePeopleEmployee(intent.agencyId, employee.id, { userId: user.id, status: "active" }, intent.actorUserId);
    if (!linked) throw new Error("The employee portal link could not be saved.");
    return { employee: linked };
  }

  if (intent.target.kind === "freelancer") {
    const existing = operation.targetEmployeeId
      ? getPeopleEmployee(intent.agencyId, operation.targetEmployeeId)
      : null;
    if (existing) {
      if (existing.userId !== user.id || existing.employmentType !== "freelancer") {
        throw new StaffProvisioningConflictError("This freelancer record belongs to a different account.");
      }
      return { employee: existing };
    }
    const employee = createPeopleEmployee({
      id: operation.targetEmployeeId,
      agencyId: intent.agencyId,
      actorUserId: intent.actorUserId,
      userId: user.id,
      name: intent.name,
      email: intent.email,
      title: intent.target.title || "Freelancer",
      employmentType: "freelancer",
    });
    return { employee };
  }

  const application = getPeopleApplication(intent.agencyId, intent.target.applicationId);
  if (!application) throw new StaffProvisioningConflictError("Application not found.");
  if (application.employeeId) {
    const existing = getPeopleEmployee(intent.agencyId, application.employeeId);
    if (!existing || existing.id !== operation.targetEmployeeId || existing.userId !== user.id) {
      throw new StaffProvisioningConflictError("This candidate was converted by a different hiring operation.");
    }
    return { employee: existing };
  }
  const employee = createPeopleEmployee({
    id: operation.targetEmployeeId,
    agencyId: intent.agencyId,
    actorUserId: intent.actorUserId,
    applicationId: application.id,
    userId: user.id,
    name: application.name,
    email: application.email,
    phone: application.phone,
    title: intent.target.title || application.roleInterest,
    department: intent.target.department,
    employmentType: intent.target.employmentType,
    startDate: intent.target.startDate,
    weeklyHours: intent.target.weeklyHours,
  });
  return { employee };
}

const defaultRuntime: StaffProvisioningRuntime = {
  readOperation: key => getState().staffProvisioningOperations[key],
  writeOperation: (key, operation) => mutate(state => {
    state.staffProvisioningOperations[key] = operation;
  }),
  flush: flushPendingWrites,
  provisionProvider: async input => {
    const result = await provisionOrAdoptSupabaseIdentity({
      email: input.email,
      password: input.password,
      name: input.name,
      role: input.profileRole,
      agencyId: input.agencyId,
      operationId: input.operationId,
    });
    return { id: result.user.id };
  },
  findLocalUser: email => getUser(email),
  createLocalUser: input => createUser(input),
  finaliseTarget: defaultFinaliseTarget,
  resolveResult: operation => ({
    user: getUser(operation.email),
    employee: operation.targetEmployeeId
      ? getPeopleEmployee(operation.agencyId, operation.targetEmployeeId) ?? undefined
      : undefined,
  }),
  now: Date.now,
};

/** Real PortalState/domain adapter with narrow injectable seams for provider and fault tests. */
export function createPortalStaffProvisioningRuntime(
  overrides: Partial<StaffProvisioningRuntime> = {},
): StaffProvisioningRuntime {
  return { ...defaultRuntime, ...overrides };
}

function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

async function persistFailure(
  runtime: StaffProvisioningRuntime,
  key: string,
  operation: StaffProvisioningOperation,
  error: unknown,
): Promise<void> {
  runtime.writeOperation(key, {
    ...operation,
    lastError: cleanError(error),
    updatedAt: runtime.now(),
  });
  try {
    await runtime.flush();
  } catch {
    // The primary error is more useful. The next identical request reloads the
    // last durable checkpoint and resumes from there.
  }
}

export async function runStaffProvisioning(
  intent: StaffProvisioningIntent,
  runtime: StaffProvisioningRuntime = defaultRuntime,
): Promise<StaffProvisioningResult> {
  const key = staffProvisioningOperationKey(intent.agencyId, intent.email);
  const fingerprint = intentFingerprint(intent);
  const existing = runtime.readOperation(key);
  if (existing && existing.intentFingerprint !== fingerprint) {
    throw new StaffProvisioningConflictError("An unfinished or completed provisioning operation already owns this staff email with different details.");
  }

  if (existing?.stage === "complete") {
    const resolved = runtime.resolveResult(existing);
    if (!resolved.user) throw new Error("The completed provisioning operation is missing its local user; retry recovery is required.");
    assertMatchingLocalUser(resolved.user, intent, existing);
    return { operation: existing, user: resolved.user, employee: resolved.employee, resumed: true };
  }

  const now = runtime.now();
  let operation: StaffProvisioningOperation = existing ?? {
    id: key,
    agencyId: intent.agencyId,
    email: canonicalEmail(intent.email),
    name: intent.name.trim(),
    localRole: intent.localRole,
    targetKind: intent.target.kind,
    targetId: targetId(intent),
    intentFingerprint: fingerprint,
    localUserId: intent.existingLocalUserId ?? plannedId("usr", key),
    targetEmployeeId: intent.target.kind === "candidate"
      ? plannedId("employee", key)
      : intent.target.kind === "employee" ? intent.target.employeeId
        : intent.target.kind === "freelancer" ? plannedId("employee", key) : undefined,
    stage: "intent-recorded",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  operation = { ...operation, attempts: operation.attempts + 1, lastError: undefined, updatedAt: now };

  try {
    // This acknowledgement must be durable before the first external side effect.
    runtime.writeOperation(key, operation);
    await runtime.flush();

    if (operation.stage === "intent-recorded" || operation.stage === "provider-ready") {
      const provider = await runtime.provisionProvider({
        operationId: operation.id,
        email: operation.email,
        password: intent.password,
        name: operation.name,
        agencyId: operation.agencyId,
        profileRole: operation.localRole === "freelancer" ? "client" : "staff",
      });
      if (operation.providerUserId && operation.providerUserId !== provider.id) {
        throw new StaffProvisioningConflictError("The provider returned a different identity for this operation.");
      }
      operation = {
        ...operation,
        providerUserId: provider.id,
        stage: "provider-ready",
        updatedAt: runtime.now(),
      };
      runtime.writeOperation(key, operation);
      await runtime.flush();
    }

    let user = runtime.findLocalUser(operation.email);
    if (user) {
      assertMatchingLocalUser(user, intent, operation);
    } else {
      user = runtime.createLocalUser({
        id: operation.localUserId,
        email: operation.email,
        password: intent.password,
        name: operation.name,
        username: intent.target.kind === "agency-user" ? intent.target.username : undefined,
        role: operation.localRole,
        agencyId: operation.agencyId,
        mustChangePassword: intent.mustChangePassword,
      });
    }
    operation = { ...operation, stage: "local-user-ready", updatedAt: runtime.now() };
    runtime.writeOperation(key, operation);
    await runtime.flush();

    const target = runtime.finaliseTarget(intent, user, operation);
    operation = { ...operation, stage: "target-linked", updatedAt: runtime.now() };
    runtime.writeOperation(key, operation);
    await runtime.flush();

    operation = {
      ...operation,
      stage: "complete",
      lastError: undefined,
      updatedAt: runtime.now(),
      completedAt: runtime.now(),
    };
    runtime.writeOperation(key, operation);
    await runtime.flush();
    const resolved = runtime.resolveResult(operation);
    if (!resolved.user) throw new Error("Provisioning completed without a readable local user.");
    assertMatchingLocalUser(resolved.user, intent, operation);
    return {
      operation,
      user: resolved.user,
      employee: target.employee ?? resolved.employee,
      resumed: Boolean(existing),
    };
  } catch (error) {
    await persistFailure(runtime, key, operation, error);
    if (error instanceof StaffProvisioningConflictError) throw error;
    throw new StaffProvisioningRecoveryError(cleanError(error), operation.stage);
  }
}

export function getStaffProvisioningOperation(agencyId: string, email: string): StaffProvisioningOperation | null {
  return getState().staffProvisioningOperations[staffProvisioningOperationKey(agencyId, email)] ?? null;
}
