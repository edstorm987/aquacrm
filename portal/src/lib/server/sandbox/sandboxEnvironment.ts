import "server-only";

import crypto from "node:crypto";

import {
  issueSession,
  isSessionFresh,
} from "@/lib/server/auth/auth";
import {
  LIVE_DATA_REALM_ID,
  createEmptyPortalState,
  ensureHydrated,
  flushPendingWrites,
  getState,
  replaceDataRealmState,
  runInDataRealm,
} from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUser, getUserById } from "@/server/users";
import type {
  Agency,
  SandboxAccess,
  SandboxDataset,
  SandboxPersona,
  SandboxSessionEnvironment,
  ServerUser,
  SessionPayload,
} from "@/server/types";

type DemoSeedModule = typeof import("@/lib/server/seeds/demoSeed");
type SeedDemoResult = Awaited<ReturnType<DemoSeedModule["seedDemoAgency"]>>;

export interface SandboxSwitchResult {
  token: string;
  redirect: string;
  environment: SandboxSessionEnvironment;
}

interface LiveIdentity {
  user: ServerUser;
  agency: Agency;
  returnWasDemo: boolean;
  returnAal?: "aal1" | "aal2";
}

interface SandboxTarget {
  user: ServerUser;
  agency: Agency;
  clientId?: string;
  redirect: string;
  persona?: SandboxPersona;
}

export class SandboxEnvironmentError extends Error {
  status: 400 | 401 | 403 | 409;

  constructor(status: 400 | 401 | 403 | 409, message: string) {
    super(message);
    this.name = "SandboxEnvironmentError";
    this.status = status;
  }
}

export function sandboxRealmIdFor(agencyId: string, dataset: SandboxDataset): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${agencyId}\u0000${dataset}`)
    .digest("hex")
    .slice(0, 24);
  return `sandbox-${dataset}-${digest}`;
}

export function sandboxModeAvailable(session: SessionPayload, user: ServerUser | null): boolean {
  if (!user) return false;
  if (session.sandbox) return true;
  if (!isSessionFresh(session, user)) return false;
  return user.role !== "lead" && (user.agencyIds.length > 0 || Boolean(user.agencyId));
}

function isSandboxGovernor(user: ServerUser): boolean {
  return user.role === "agency-owner" || user.role === "agency-manager";
}

function governedAccess(identity: LiveIdentity, requested: SandboxAccess): SandboxAccess {
  // Writable Demo data is authority, not presentation. Until a dedicated
  // canonical delegation exists, a non-governor cannot mint it by choosing a
  // request-body value. Owners and managers retain the existing control-plane
  // behavior; every other current tenant member receives read-only Demo data.
  return isSandboxGovernor(identity.user) ? requested : "read-only";
}

function safePersonaFor(user: ServerUser): SandboxPersona {
  if (user.role === "agency-staff") return "staff";
  if (user.role === "freelancer") return "freelancer";
  if (user.role === "client-owner" || user.role === "client-staff" || user.role === "end-customer") return "customer";
  return "owner";
}

function governedPersona(
  identity: LiveIdentity,
  input: { dataset: SandboxDataset; persona?: SandboxPersona; force?: boolean },
): SandboxPersona {
  if (isSandboxGovernor(identity.user)) {
    return input.dataset === "demo" ? input.persona ?? "owner" : "owner";
  }
  if (input.dataset !== "demo") {
    throw new SandboxEnvironmentError(403, "This account can use only the safe Demo sandbox dataset.");
  }
  if (input.force) {
    throw new SandboxEnvironmentError(403, "Only an owner or manager can reset a shared sandbox dataset.");
  }
  const persona = safePersonaFor(identity.user);
  if (input.persona && input.persona !== persona) {
    throw new SandboxEnvironmentError(403, "This account cannot switch to a more privileged sandbox persona.");
  }
  return persona;
}

async function liveIdentityFor(session: SessionPayload): Promise<LiveIdentity> {
  const returnUserId = session.sandbox?.returnUserId ?? session.userId;
  const returnAgencyId = session.sandbox?.returnAgencyId ?? session.agencyId;
  return runInDataRealm(LIVE_DATA_REALM_ID, async () => {
    await ensureHydrated({ fresh: true, preserveExplicitRealm: true });
    const user = getUserById(returnUserId);
    const agency = getAgency(returnAgencyId);
    if (!user || !agency) {
      throw new SandboxEnvironmentError(409, "The live account attached to this sandbox no longer exists.");
    }
    if (!isSessionFresh(session, user)) {
      throw new SandboxEnvironmentError(401, "Your session changed. Sign in again before entering Sandbox Mode.");
    }
    const memberships = user.agencyIds.length > 0 ? user.agencyIds : user.agencyId ? [user.agencyId] : [];
    if (user.role === "lead" || !memberships.includes(agency.id)) {
      throw new SandboxEnvironmentError(403, "This account is not a current member of that workspace.");
    }
    return {
      user,
      agency,
      returnWasDemo: session.sandbox?.returnWasDemo ?? session.isDemo === true,
      returnAal: session.sandbox?.returnAal ?? session.aal,
    };
  });
}

function emptyRealmState(identity: LiveIdentity) {
  const state = createEmptyPortalState();
  state.agencies[identity.agency.id] = {
    ...structuredClone(identity.agency),
    name: `${identity.agency.name} · Empty Sandbox`,
    updatedAt: Date.now(),
  };
  state.users[identity.user.id] = {
    ...structuredClone(identity.user),
    agencyId: identity.agency.id,
    agencyIds: [identity.agency.id],
    updatedAt: Date.now(),
  };
  return state;
}

async function realmHasAgency(realmId: string): Promise<boolean> {
  return runInDataRealm(realmId, async () => {
    await ensureHydrated({ preserveExplicitRealm: true });
    return Object.keys(getState().agencies).length > 0;
  });
}

async function prepareEmpty(
  realmId: string,
  identity: LiveIdentity,
  force: boolean,
): Promise<SandboxTarget> {
  if (force || !(await realmHasAgency(realmId))) {
    await replaceDataRealmState(realmId, emptyRealmState(identity));
  }
  return runInDataRealm(realmId, async () => {
    await ensureHydrated({ preserveExplicitRealm: true });
    const user = getUserById(identity.user.id);
    const agency = getAgency(identity.agency.id);
    if (!user || !agency) throw new SandboxEnvironmentError(409, "The empty sandbox could not be prepared.");
    return { user, agency, redirect: "/portal/agency" };
  });
}

function demoTarget(
  persona: SandboxPersona,
  seed: SeedDemoResult,
  demoSeed: Pick<DemoSeedModule, "DEMO_FREELANCER_EMAIL" | "DEMO_STAFF_EMAIL">,
): SandboxTarget {
  if (persona === "staff") {
    const user = getUser(demoSeed.DEMO_STAFF_EMAIL, { agencyId: seed.agency.id } as never);
    if (!user) throw new SandboxEnvironmentError(409, "The demo staff persona is unavailable.");
    return { user, agency: seed.agency, redirect: "/portal/team", persona };
  }
  if (persona === "customer") {
    return {
      user: seed.customerUser,
      agency: seed.agency,
      clientId: seed.client.id,
      redirect: "/portal/customer",
      persona,
    };
  }
  if (persona === "freelancer") {
    const user = getUser(demoSeed.DEMO_FREELANCER_EMAIL, { agencyId: seed.agency.id } as never);
    if (!user) throw new SandboxEnvironmentError(409, "The demo freelancer persona is unavailable.");
    return { user, agency: seed.agency, redirect: "/portal/freelancer", persona };
  }
  return { user: seed.ownerUser, agency: seed.agency, redirect: "/portal/agency", persona: "owner" };
}

async function prepareDemo(
  realmId: string,
  identity: LiveIdentity,
  force: boolean,
  persona: SandboxPersona,
): Promise<SandboxTarget> {
  const demoSeed = await import("@/lib/server/seeds/demoSeed");
  return runInDataRealm(realmId, async () => {
    await ensureHydrated({ preserveExplicitRealm: true });
    if (force) {
      await demoSeed.resetDemo();
      await flushPendingWrites();
    }
    const seed = await demoSeed.seedDemoAgency(identity.user.id);
    demoSeed.ensureDemoStaffEmployee(seed.agency.id, identity.user.id);
    demoSeed.ensureDemoCustomerReady(seed.agency.id);
    demoSeed.ensureDemoFreelancer(seed.agency.id);
    await flushPendingWrites();
    return demoTarget(persona, seed, demoSeed);
  });
}

async function prepareSnapshot(
  realmId: string,
  identity: LiveIdentity,
  force: boolean,
): Promise<SandboxTarget> {
  if (force || !(await realmHasAgency(realmId))) {
    const snapshot = await runInDataRealm(LIVE_DATA_REALM_ID, async () => {
      await ensureHydrated({ fresh: true, preserveExplicitRealm: true });
      await flushPendingWrites();
      return structuredClone(getState());
    });
    await replaceDataRealmState(realmId, snapshot);
  }
  return runInDataRealm(realmId, async () => {
    await ensureHydrated({ preserveExplicitRealm: true });
    const user = getUserById(identity.user.id);
    const agency = getAgency(identity.agency.id);
    if (!user || !agency) throw new SandboxEnvironmentError(409, "The production snapshot could not be prepared.");
    return { user, agency, redirect: "/portal/agency" };
  });
}

async function prepareTarget(
  realmId: string,
  dataset: SandboxDataset,
  identity: LiveIdentity,
  force: boolean,
  persona: SandboxPersona,
): Promise<SandboxTarget> {
  if (dataset === "empty") return prepareEmpty(realmId, identity, force);
  if (dataset === "snapshot") return prepareSnapshot(realmId, identity, force);
  return prepareDemo(realmId, identity, force, persona);
}

function mintSandboxSession(
  target: SandboxTarget,
  identity: LiveIdentity,
  realmId: string,
  dataset: SandboxDataset,
  access: SandboxAccess,
): SandboxSwitchResult {
  const environment: SandboxSessionEnvironment = {
    realmId,
    dataset,
    access,
    persona: target.persona,
    governor: isSandboxGovernor(identity.user) || undefined,
    returnUserId: identity.user.id,
    returnAgencyId: identity.agency.id,
    returnWasDemo: identity.returnWasDemo || undefined,
    returnAal: identity.returnAal,
    enteredAt: Date.now(),
  };
  const token = issueSession({
    userId: target.user.id,
    email: target.user.email,
    role: target.user.role,
    agencyId: target.agency.id,
    activeAgencyId: target.agency.id,
    agencyIds: [target.agency.id],
    clientId: target.clientId,
    isDemo: true,
    sandbox: environment,
    // Sandbox identity/persona is presentational. Freshness and access policy
    // remain anchored to the live account recorded in `returnUserId`.
    sessionRev: identity.user.sessionRev ?? 0,
    accessRev: identity.user.accessRev ?? 0,
  });
  return { token, redirect: target.redirect, environment };
}

export async function enterSandboxEnvironment(
  session: SessionPayload,
  input: {
    dataset: SandboxDataset;
    access: SandboxAccess;
    persona?: SandboxPersona;
    force?: boolean;
  },
): Promise<SandboxSwitchResult> {
  const identity = await liveIdentityFor(session);
  const realmId = sandboxRealmIdFor(identity.agency.id, input.dataset);
  const persona = governedPersona(identity, input);
  const access = governedAccess(identity, input.access);
  const target = await prepareTarget(realmId, input.dataset, identity, input.force === true, persona);
  return mintSandboxSession(target, identity, realmId, input.dataset, access);
}

export async function switchSandboxPersona(
  session: SessionPayload,
  persona: SandboxPersona,
): Promise<SandboxSwitchResult> {
  if (!session.sandbox || session.sandbox.dataset !== "demo") {
    throw new SandboxEnvironmentError(409, "Persona switching is available only with Demo data.");
  }
  const identity = await liveIdentityFor(session);
  if (!isSandboxGovernor(identity.user)) {
    throw new SandboxEnvironmentError(403, "Only an owner or manager can switch sandbox personas.");
  }
  const governed = governedPersona(identity, { dataset: "demo", persona });
  const target = await prepareDemo(session.sandbox.realmId, identity, false, governed);
  return mintSandboxSession(target, identity, session.sandbox.realmId, "demo", session.sandbox.access);
}

export async function exitSandboxEnvironment(session: SessionPayload): Promise<SandboxSwitchResult> {
  if (!session.sandbox) throw new SandboxEnvironmentError(409, "Sandbox Mode is not active.");
  await flushPendingWrites();
  const identity = await liveIdentityFor(session);
  const environment = session.sandbox;
  const token = issueSession({
    userId: identity.user.id,
    email: identity.user.email,
    role: identity.user.role,
    agencyId: identity.agency.id,
    activeAgencyId: identity.agency.id,
    agencyIds: identity.user.agencyIds?.length ? identity.user.agencyIds : [identity.agency.id],
    clientId: identity.user.clientId,
    isDemo: identity.returnWasDemo || undefined,
    sessionRev: identity.user.sessionRev ?? 0,
    aal: identity.returnAal,
  });
  return { token, redirect: "/portal/agency/settings#environment", environment };
}
