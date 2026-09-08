import "server-only";

// Security control plane — Phase-0 seed (assume-breach containment, 2026-09-08).
//
// Three enforceable primitives, all checked CENTRALLY in
// `resolveFreshSessionUser` (the single choke point both `getSession` and
// `getSessionFromRequest` pass through, so suspension and revocation bind on
// EVERY authenticated request, not just at login):
//
//   1. SECURITY EPOCHS — global / tenant / user counters stamped into each
//      session at issue. Bumping an epoch immediately invalidates every
//      session at or below that scope, including LEGACY cookies (which carry
//      no stamp and therefore read as epoch 0 — one bump kills them all).
//      This is the guaranteed coarse kill switch: it needs no registry row.
//   2. USER SUSPENSION — a suspended user fails the gate everywhere at once.
//   3. SESSION REGISTRY — sessions minted through the real login flow are
//      recorded with a `sid`, so ONE device/session can be revoked without
//      rotating the whole user. Enforcement refuses a session only when its
//      registry row is explicitly revoked; unrecorded sids (dev/showcase/demo
//      mints) stay governed by the epoch layer above, so a missing row can
//      never lock the owner out while still being killable at user scope.
//
// Writes go through the same `mutate()` path the user store uses. Reads are
// in-memory against hydrated state. No render-time writes: `touchSessionSeen`
// is throttled AND only called from request handlers, never from RSC renders
// (the 2026-09-04 outage taught that render-time writes are forbidden).
//
// Phase 1 moves this state into dedicated security storage outside PortalState
// with an append-only drain; the function contract here is designed to survive
// that move unchanged.

import crypto from "crypto";
import { getState, mutate } from "@/server/storage";
import { recordSecurityEvent } from "@/lib/server/security/securityEvents";
import type { SecurityControlState, SecuritySessionRecord, SessionPayload, Role } from "@/server/types";

const EMPTY: SecurityControlState = {
  globalEpoch: 0,
  tenantEpochs: {},
  userEpochs: {},
  suspendedUsers: {},
  sessions: {},
};

/** Tolerant read: absent state (fresh tenant, standalone scripts) = all zeros. */
export function readSecurityControl(): SecurityControlState {
  try {
    return getState().securityControl ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function withControl(fn: (control: SecurityControlState) => void): void {
  // securityControlPlane: the control plane's writes stay allowed while the
  // global read-only kill switch holds — the switch must be liftable, and
  // suspension/revocation must keep working DURING an incident. This flag is
  // the only sanctioned use; application code never sets it.
  mutate(state => {
    if (!state.securityControl) {
      state.securityControl = { globalEpoch: 0, tenantEpochs: {}, userEpochs: {}, suspendedUsers: {}, sessions: {} };
    }
    fn(state.securityControl);
  }, { securityControlPlane: true });
}

// ─── Epoch stamps ───────────────────────────────────────────────────────────

/** Current epochs for a session about to be issued. Tolerates missing state. */
export function currentEpochStamp(userId: string, agencyId: string | undefined): { g: number; t: number; u: number } {
  const control = readSecurityControl();
  return {
    g: control.globalEpoch,
    t: agencyId ? control.tenantEpochs[agencyId] ?? 0 : 0,
    u: control.userEpochs[userId] ?? 0,
  };
}

export function bumpGlobalSecurityEpoch(actor: string, reason: string): number {
  let next = 0;
  withControl(control => {
    control.globalEpoch += 1;
    next = control.globalEpoch;
  });
  logSecurityAction("global-epoch-bump", { actor, reason, epoch: next });
  return next;
}

export function bumpTenantSecurityEpoch(agencyId: string, actor: string, reason: string): number {
  let next = 0;
  withControl(control => {
    control.tenantEpochs[agencyId] = (control.tenantEpochs[agencyId] ?? 0) + 1;
    next = control.tenantEpochs[agencyId];
  });
  logSecurityAction("tenant-epoch-bump", { actor, reason, agencyId, epoch: next });
  return next;
}

export function bumpUserSecurityEpoch(userId: string, actor: string, reason: string): number {
  let next = 0;
  withControl(control => {
    control.userEpochs[userId] = (control.userEpochs[userId] ?? 0) + 1;
    next = control.userEpochs[userId];
  });
  logSecurityAction("user-epoch-bump", { actor, reason, userId, epoch: next });
  return next;
}

// ─── Suspension ─────────────────────────────────────────────────────────────

export function suspendUser(userId: string, actor: string, reason: string): void {
  withControl(control => {
    control.suspendedUsers[userId] = { reason, at: Date.now(), actor };
  });
  logSecurityAction("user-suspended", { actor, reason, userId });
}

export function unsuspendUser(userId: string, actor: string): void {
  withControl(control => {
    delete control.suspendedUsers[userId];
  });
  logSecurityAction("user-unsuspended", { actor, userId });
}

export function isUserSuspended(userId: string): boolean {
  return Boolean(readSecurityControl().suspendedUsers[userId]);
}

// ─── Lockdown switches (Phase 1) ────────────────────────────────────────────
//
// Two REVERSIBLE containment controls, deliberately different in mechanism:
//   - GLOBAL READ-ONLY freezes writes at the `mutate()` choke point (reads keep
//     serving; the control plane's own writes stay allowed so the switch can be
//     lifted and sessions revoked while it holds).
//   - TENANT LOCKDOWN fails every session of one tenant at the central session
//     gate — and unlike an epoch bump, lifting it restores existing sessions
//     rather than forcing the whole tenant to log in again.
// Server-side actions only (no route exposure yet); the Phase-6 threat centre
// puts them behind AAL2 + dual confirmation before any UI reaches them.

export function setGlobalReadOnly(actor: string, reason: string): void {
  withControl(control => {
    control.globalReadOnly = { reason, at: Date.now(), actor };
  });
  recordSecurityEvent({ kind: "lockdown.global-read-only.set", severity: "critical", actor, detail: { reason } });
  logSecurityAction("global-read-only-set", { actor, reason });
}

export function clearGlobalReadOnly(actor: string): void {
  withControl(control => {
    delete control.globalReadOnly;
  });
  recordSecurityEvent({ kind: "lockdown.global-read-only.cleared", severity: "warning", actor, detail: {} });
  logSecurityAction("global-read-only-cleared", { actor });
}

export function isGlobalReadOnly(): boolean {
  return Boolean(readSecurityControl().globalReadOnly);
}

export function lockdownTenant(agencyId: string, actor: string, reason: string): void {
  withControl(control => {
    control.tenantLockdowns = { ...(control.tenantLockdowns ?? {}), [agencyId]: { reason, at: Date.now(), actor } };
  });
  recordSecurityEvent({ kind: "lockdown.tenant.set", severity: "critical", actor, tenantId: agencyId, detail: { reason } });
  logSecurityAction("tenant-lockdown-set", { actor, reason, agencyId });
}

export function liftTenantLockdown(agencyId: string, actor: string): void {
  withControl(control => {
    if (control.tenantLockdowns) delete control.tenantLockdowns[agencyId];
  });
  recordSecurityEvent({ kind: "lockdown.tenant.lifted", severity: "warning", actor, tenantId: agencyId, detail: {} });
  logSecurityAction("tenant-lockdown-lifted", { actor, agencyId });
}

export function isTenantLockedDown(agencyId: string): boolean {
  return Boolean(readSecurityControl().tenantLockdowns?.[agencyId]);
}

// ─── AI kill switch (Phase 3) ───────────────────────────────────────────────

export function disableAi(actor: string, reason: string): void {
  withControl(control => {
    control.aiDisabled = { reason, at: Date.now(), actor };
  });
  recordSecurityEvent({ kind: "lockdown.ai.disabled", severity: "critical", actor, detail: { reason } });
  logSecurityAction("ai-disabled", { actor, reason });
}

export function enableAi(actor: string): void {
  withControl(control => {
    delete control.aiDisabled;
  });
  recordSecurityEvent({ kind: "lockdown.ai.enabled", severity: "warning", actor, detail: {} });
  logSecurityAction("ai-enabled", { actor });
}

/** The disable record while the AI kill switch is ON, else null. */
export function isAiDisabled(): { reason: string; at: number; actor: string } | null {
  return readSecurityControl().aiDisabled ?? null;
}

// ─── Session registry ───────────────────────────────────────────────────────

export function newSessionId(): string {
  return crypto.randomUUID();
}

export function recordIssuedSession(
  payload: Pick<SessionPayload, "sid" | "userId" | "agencyId" | "role">,
  meta: { issuedVia: string; ip?: string; userAgent?: string },
): void {
  if (!payload.sid) return;
  const record: SecuritySessionRecord = {
    sid: payload.sid,
    userId: payload.userId,
    agencyId: payload.agencyId,
    role: payload.role as Role,
    issuedAt: Date.now(),
    issuedVia: meta.issuedVia,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 200),
  };
  withControl(control => {
    control.sessions[record.sid] = record;
    // Bounded registry: keep the newest 50 sessions per user so the state can
    // never grow without limit under a login flood.
    const mine = Object.values(control.sessions)
      .filter(existing => existing.userId === record.userId)
      .sort((a, b) => b.issuedAt - a.issuedAt);
    for (const stale of mine.slice(50)) delete control.sessions[stale.sid];
  });
}

export function listUserSessions(userId: string): SecuritySessionRecord[] {
  return Object.values(readSecurityControl().sessions)
    .filter(record => record.userId === userId)
    .sort((a, b) => b.issuedAt - a.issuedAt);
}

export function revokeSession(sid: string, actor: string, reason: string): boolean {
  let found = false;
  withControl(control => {
    const record = control.sessions[sid];
    if (!record || record.revokedAt) return;
    record.revokedAt = Date.now();
    record.revokedBy = actor;
    record.revokedReason = reason;
    found = true;
  });
  if (found) logSecurityAction("session-revoked", { actor, reason, sid });
  return found;
}

/** Revoke every recorded session for a user AND bump their epoch (covers unrecorded/legacy cookies too). */
export function revokeAllUserSessions(userId: string, actor: string, reason: string): number {
  let count = 0;
  withControl(control => {
    for (const record of Object.values(control.sessions)) {
      if (record.userId === userId && !record.revokedAt) {
        record.revokedAt = Date.now();
        record.revokedBy = actor;
        record.revokedReason = reason;
        count += 1;
      }
    }
  });
  bumpUserSecurityEpoch(userId, actor, reason);
  return count;
}

// Throttled last-seen. Request-handler contexts only — NEVER from RSC renders.
const lastSeenMemo = new Map<string, number>();
const LAST_SEEN_INTERVAL_MS = 15 * 60 * 1000;

export function touchSessionSeen(sid: string | undefined): void {
  if (!sid) return;
  const now = Date.now();
  const last = lastSeenMemo.get(sid) ?? 0;
  if (now - last < LAST_SEEN_INTERVAL_MS) return;
  lastSeenMemo.set(sid, now);
  withControl(control => {
    const record = control.sessions[sid];
    if (record && !record.revokedAt) record.lastSeenAt = now;
  });
}

// ─── The central gate ───────────────────────────────────────────────────────

export type SessionGateResult =
  | { ok: true }
  | { ok: false; reason: "suspended" | "tenant-lockdown" | "global-epoch" | "tenant-epoch" | "user-epoch" | "session-revoked" };

/**
 * Called by `resolveFreshSessionUser` on every authenticated request. Pure
 * read against hydrated state — no writes, safe in RSC renders.
 */
export function enforceSessionSecurity(session: SessionPayload): SessionGateResult {
  const control = readSecurityControl();

  if (control.suspendedUsers[session.userId]) return { ok: false, reason: "suspended" };

  const stamped = session.se ?? { g: 0, t: 0, u: 0 };
  if (stamped.g < control.globalEpoch) return { ok: false, reason: "global-epoch" };
  const tenantScope = session.activeAgencyId ?? session.agencyId;
  // Tenant lockdown: every session scoped to a locked tenant fails here until
  // the lockdown is LIFTED — reversible, unlike the epoch bump below.
  if (tenantScope && control.tenantLockdowns?.[tenantScope]) {
    return { ok: false, reason: "tenant-lockdown" };
  }
  if (tenantScope && stamped.t < (control.tenantEpochs[tenantScope] ?? 0)) {
    return { ok: false, reason: "tenant-epoch" };
  }
  if (stamped.u < (control.userEpochs[session.userId] ?? 0)) return { ok: false, reason: "user-epoch" };

  if (session.sid) {
    const record = control.sessions[session.sid];
    if (record?.revokedAt) return { ok: false, reason: "session-revoked" };
  }

  return { ok: true };
}

// ─── Local logging (Phase 1 replaces with SecurityEvent storage) ────────────

function logSecurityAction(action: string, detail: Record<string, unknown>): void {
  // Structured, secret-free, greppable. Not authoritative evidence — the
  // Phase-1 SecurityEvent store with an off-platform drain is. Says so here
  // so nobody mistakes a console line for the audit record.
  // eslint-disable-next-line no-console
  console.warn(`[security-control] ${action} ${JSON.stringify(detail)}`);
}
