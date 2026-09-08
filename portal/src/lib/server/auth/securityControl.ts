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
  mutate(state => {
    if (!state.securityControl) {
      state.securityControl = { globalEpoch: 0, tenantEpochs: {}, userEpochs: {}, suspendedUsers: {}, sessions: {} };
    }
    fn(state.securityControl);
  });
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
  | { ok: false; reason: "suspended" | "global-epoch" | "tenant-epoch" | "user-epoch" | "session-revoked" };

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
