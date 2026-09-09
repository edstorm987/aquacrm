// Threat centre — containment actions (Phase 6).
//
// The response actions the runbooks name, behind FOUR gates, every one
// enforced server-side in this handler:
//   1. an agency-OWNER session (the central per-request gate has already
//      applied suspension/revocation/epoch/lockdown checks to it);
//   2. FRESH RE-AUTHENTICATION — the owner's password, verified again NOW
//      (a stolen cookie alone cannot flip a switch);
//   3. DUAL CONFIRMATION — the exact typed phrase CONTAIN plus a written
//      reason (≥8 chars) that lands verbatim in the durable action record;
//   4. a strict action allowlist — nothing dynamic, nothing eval-shaped.
// Every action already records durably inside the control plane itself.
//
// Rate limited: a wrong password is an authentication attempt and counts
// against the caller like a login failure would.

import { NextResponse, type NextRequest } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { mayUseEnvironmentCredentials } from "@/lib/server/auth/founderAgency";
import {
  bumpGlobalSecurityEpoch,
  bumpTenantSecurityEpoch,
  bumpUserSecurityEpoch,
  clearGlobalReadOnly,
  disableAi,
  enableAi,
  liftTenantLockdown,
  lockdownTenant,
  revokeAllUserSessions,
  revokeSession,
  setGlobalReadOnly,
  suspendUser,
  unsuspendUser,
  readSecurityControl,
} from "@/lib/server/auth/securityControl";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { ensureHydrated, flushPendingWrites, getState } from "@/server/storage";
import { verifyPassword } from "@/server/users";

export const dynamic = "force-dynamic";

const CONFIRM_PHRASE = "CONTAIN";

const ACTIONS = new Set([
  "suspend-user",
  "unsuspend-user",
  "revoke-session",
  "revoke-all-user-sessions",
  "bump-user-epoch",
  "bump-tenant-epoch",
  "bump-global-epoch",
  "lockdown-tenant",
  "lift-tenant-lockdown",
  "set-global-read-only",
  "clear-global-read-only",
  "disable-ai",
  "enable-ai",
] as const);
type SecurityAction = typeof ACTIONS extends Set<infer T> ? T : never;

interface ActionBody {
  action?: string;
  reason?: string;
  confirm?: string;
  password?: string;
  userId?: string;
  sid?: string;
  agencyId?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    await ensureHydrated();
    const session = await requireRole("agency-owner");

    // One bucket per owner+IP; refusals are cheap, actions are rare.
    const ip = clientIpFromHeaders(request.headers);
    const limit = rateLimit({ key: `security-action:${session.userId}:${ip}`, max: 10, windowMs: 60_000 });
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } });
    }

    const body = (await request.json().catch(() => null)) as ActionBody | null;
    const action = body?.action ?? "";
    if (!ACTIONS.has(action as SecurityAction)) {
      return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
    }
    const reason = (body?.reason ?? "").trim();
    if (reason.length < 8) {
      return NextResponse.json({ ok: false, error: "reason_required", detail: "Write why (at least 8 characters) — it goes in the permanent record." }, { status: 400 });
    }
    if (body?.confirm !== CONFIRM_PHRASE) {
      return NextResponse.json({ ok: false, error: "confirm_required", detail: `Type ${CONFIRM_PHRASE} to confirm.` }, { status: 400 });
    }
    // Fresh re-authentication, NOW — a session cookie alone must never be
    // enough to flip a containment switch.
    if (!body?.password || !verifyPassword(session.email, body.password)) {
      return NextResponse.json({ ok: false, error: "reauthentication_failed" }, { status: 403 });
    }

    const actor = `owner:${session.userId}`;
    const userId = (body?.userId ?? "").trim();
    const sid = (body?.sid ?? "").trim();
    // Tenant-scoped actions act on the OWNER'S OWN tenant only. Cross-tenant
    // containment is the operator shell's job (runbooks), not this API's.
    const agencyId = session.agencyId ?? "";

    // TENANT SCOPE on user/session targets: an owner may only act on people
    // and sessions of their OWN agency — otherwise a valid owner elsewhere
    // could suspend another tenant's users by guessing ids (a cross-tenant
    // denial of service). Same 400 for "not found" and "not yours": this
    // endpoint must not confirm which user ids exist in other tenants.
    const userInScope = (targetId: string): boolean => {
      const user = Object.values(getState().users).find(candidate => candidate.id === targetId);
      if (!user) return false;
      return user.agencyId === agencyId || Boolean(agencyId && user.agencyIds?.includes(agencyId));
    };
    const sidInScope = (targetSid: string): boolean => {
      const record = readSecurityControl().sessions[targetSid];
      return Boolean(record && (record.agencyId === agencyId || userInScope(record.userId)));
    };
    if (["suspend-user", "unsuspend-user", "revoke-all-user-sessions", "bump-user-epoch"].includes(action) && userId && !userInScope(userId)) {
      return NextResponse.json({ ok: false, error: "user_not_in_scope" }, { status: 400 });
    }
    if (action === "revoke-session" && sid && !sidInScope(sid)) {
      return NextResponse.json({ ok: false, error: "session_not_in_scope" }, { status: 400 });
    }
    // GLOBAL switches (freeze all writes, kill all sessions, kill AI) reach
    // every tenant, so only the PLATFORM OPERATOR'S owner may flip them — a
    // customer tenant's owner freezing the whole platform would itself be a
    // cross-tenant denial of service.
    const GLOBAL_ACTIONS = ["bump-global-epoch", "set-global-read-only", "clear-global-read-only", "disable-ai", "enable-ai"];
    if (GLOBAL_ACTIONS.includes(action) && !mayUseEnvironmentCredentials(agencyId)) {
      return NextResponse.json({ ok: false, error: "operator_only", detail: "Platform-wide switches belong to the operator." }, { status: 403 });
    }
    // AAL2 for the highest-impact platform switches (Phase 3). Password re-entry
    // is re-authentication, NOT a second factor — so a platform-wide freeze /
    // global sign-out / AI kill must carry a step-up (AAL2) session. Until an
    // authoritative AAL2/MFA ceremony exists this branch is NOT silently
    // downgraded to password-only: the UI action VISIBLY refuses and directs the
    // operator to the credential-free operator console (scripts/security-console.ts),
    // which is the recoverable path the runbooks use. `session.aal` is set only
    // by an authoritative step-up; a plain login is aal1.
    if (GLOBAL_ACTIONS.includes(action) && session.aal !== "aal2") {
      return NextResponse.json({
        ok: false,
        error: "aal2_required",
        detail: "Platform-wide switches require a step-up (AAL2) session, which is not yet available in the UI. Run this from the operator console: scripts/security-console.ts.",
      }, { status: 403 });
    }

    let result: Record<string, unknown> = {};
    switch (action as SecurityAction) {
      case "suspend-user": {
        if (!userId) return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
        if (userId === session.userId) return NextResponse.json({ ok: false, error: "cannot_target_self", detail: "You cannot suspend yourself — a second owner or the operator shell must." }, { status: 400 });
        suspendUser(userId, actor, reason, { tenantId: agencyId });
        break;
      }
      case "unsuspend-user": {
        if (!userId) return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
        unsuspendUser(userId, actor, { tenantId: agencyId });
        break;
      }
      case "revoke-session": {
        if (!sid) return NextResponse.json({ ok: false, error: "sid_required" }, { status: 400 });
        result = { revoked: revokeSession(sid, actor, reason, { tenantId: agencyId }) };
        break;
      }
      case "revoke-all-user-sessions": {
        if (!userId) return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
        result = { revoked: revokeAllUserSessions(userId, actor, reason, { tenantId: agencyId }) };
        break;
      }
      case "bump-user-epoch": {
        if (!userId) return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
        result = { epoch: bumpUserSecurityEpoch(userId, actor, reason, { tenantId: agencyId }) };
        break;
      }
      case "bump-tenant-epoch": {
        if (!agencyId) return NextResponse.json({ ok: false, error: "no_tenant_scope" }, { status: 400 });
        result = { epoch: bumpTenantSecurityEpoch(agencyId, actor, reason) };
        break;
      }
      case "bump-global-epoch": {
        result = { epoch: bumpGlobalSecurityEpoch(actor, reason) };
        break;
      }
      case "lockdown-tenant": {
        if (!agencyId) return NextResponse.json({ ok: false, error: "no_tenant_scope" }, { status: 400 });
        lockdownTenant(agencyId, actor, reason);
        break;
      }
      case "lift-tenant-lockdown": {
        if (!agencyId) return NextResponse.json({ ok: false, error: "no_tenant_scope" }, { status: 400 });
        liftTenantLockdown(agencyId, actor);
        break;
      }
      case "set-global-read-only": {
        setGlobalReadOnly(actor, reason);
        break;
      }
      case "clear-global-read-only": {
        clearGlobalReadOnly(actor);
        break;
      }
      case "disable-ai": {
        disableAi(actor, reason);
        break;
      }
      case "enable-ai": {
        enableAi(actor);
        break;
      }
    }

    await flushPendingWrites();
    return NextResponse.json({ ok: true, action, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return NextResponse.json({ ok: false, error: "action_failed" }, { status: 500 });
  }
}
