import "server-only";
// Server-side session validation.
//
// Sessions are HMAC-SHA256-signed JSON tokens stored in the
// `lk_session_v1` httpOnly cookie. Issued by `/api/auth/login`,
// validated by `getSession()` / `requireRole()` on every protected
// API call and every server-rendered portal page.
//
// Cookie payload extends the `02` shape with the three-level tenancy
// data the architecture requires: `{ userId, email, role, agencyId,
// clientId? }`. The middleware checks tenant-scope match against URL
// params; this module enforces role membership server-side.
//
// Secret comes from `PORTAL_SESSION_SECRET`. In dev a stable fallback
// keeps things working without env config (intentional — production
// deploys MUST set the env or the warning is logged at every sign-in).

import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Role, SandboxSessionEnvironment, ServerUser, SessionPayload } from "@/server/types";
import { getUserById } from "@/server/users";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase/server";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  signSessionPayload,
  verifySessionToken,
} from "@/lib/server/auth/sessionToken";
import { LIVE_DATA_REALM_ID, ensureHydrated, runInDataRealm } from "@/server/storage";
import { normaliseDataRealmId } from "@/server/dataRealm";

const COOKIE_NAME = SESSION_COOKIE_NAME;
const COOKIE_MAX_AGE = SESSION_COOKIE_MAX_AGE;

export { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE };

interface IssueSessionInput {
  userId: string;
  email: string;
  role: Role;
  agencyId: string;
  // R025: full membership list (defaults to `[agencyId]`). Master users
  // (chapter #123) carry multiple entries.
  agencyIds?: string[];
  // R025: which agency the session is currently scoped to
  // (defaults to `agencyId`).
  activeAgencyId?: string;
  clientId?: string;
  sandbox?: SandboxSessionEnvironment;
  // Mark the session as a sandboxed demo. The chrome layer reads this to
  // render the demo banner + POV toggle; the seed/reset endpoints use it
  // to scope writes to the demo agency only.
  isDemo?: boolean;
  showcaseReturnAgencyId?: string;
  // Dev Mode (local/dev only) return-to-real, mirrors showcaseReturnAgencyId.
  devReturnAgencyId?: string;
  // Whether the pre-Dev-Mode session was itself demo/dev (restored on exit).
  devReturnWasDemo?: boolean;
  // The exact person who started the inspection, so `exit` restores THEM
  // (mirrors previewReturnUserId below).
  devReturnUserId?: string;
  // Freelancer preview return-to-real (mirrors the devReturn* pair).
  previewReturnAgencyId?: string;
  previewReturnWasDemo?: boolean;
  // The exact enterer's userId, so `exit` restores THEM (not "an owner it
  // finds"). Prevents a manager escalating to owner via enter→exit.
  previewReturnUserId?: string;
  publicShowcase?: boolean;
  // R021: session rotation revision. Pass the user's current `sessionRev`
  // here so the cookie gets stamped — later rotations bump the user record's
  // value and stale tokens fail freshness checks at the lookup layer.
  sessionRev?: number;
  // Resource-access revision. Omitted callers are stamped from the current
  // authoritative user so a fresh login never inherits a stale policy epoch.
  accessRev?: number;
  // Which assurance level this sign-in proved (mirrors `SessionPayload.aal`).
  // Flows that verified a second factor pass "aal2"; single-factor flows pass
  // "aal1". Optional so existing callers (demo / dev / preview mints) are
  // untouched — an absent value reads as "not proven", never as aal2.
  aal?: "aal1" | "aal2";
}

export function issueSession(input: IssueSessionInput): string {
  const now = Math.floor(Date.now() / 1000);
  // R025: derive multi-agency fields. activeAgencyId defaults to the
  // legacy agencyId; agencyIds defaults to `[agencyId]` (or [] for
  // leads carrying the global sentinel).
  const agencyIds = input.agencyIds && input.agencyIds.length > 0
    ? input.agencyIds
    : input.role === "lead" ? [] : [input.agencyId];
  const activeAgencyId = input.activeAgencyId ?? input.agencyId;
  const payload: SessionPayload = {
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    agencyId: activeAgencyId,
    agencyIds,
    activeAgencyId,
    clientId: input.clientId,
    sandbox: input.sandbox,
    isDemo: input.isDemo === true ? true : undefined,
    showcaseReturnAgencyId: input.showcaseReturnAgencyId,
    devReturnAgencyId: input.devReturnAgencyId,
    devReturnWasDemo: input.devReturnWasDemo === true ? true : undefined,
    devReturnUserId: input.devReturnUserId,
    previewReturnAgencyId: input.previewReturnAgencyId,
    previewReturnWasDemo: input.previewReturnWasDemo === true ? true : undefined,
    previewReturnUserId: input.previewReturnUserId,
    publicShowcase: input.publicShowcase === true ? true : undefined,
    sessionRev: input.sessionRev ?? 0,
    accessRev: input.accessRev ?? getUserById(input.userId)?.accessRev ?? 0,
    aal: input.aal,
    iat: now,
    exp: now + COOKIE_MAX_AGE,
  };
  return signSessionPayload(payload);
}

export function verifyToken(token: string | undefined): SessionPayload | null {
  return verifySessionToken(token);
}

// ─── Read helpers ─────────────────────────────────────────────────────────
//
// Central fresh-session boundary (issue #22). A signed cookie proves only
// what was true when it was minted. Before ANY role/scope decision, the
// session's subject is re-validated against the CURRENT authoritative user
// record — existence (account removal revokes), `sessionRev` (password/role
// rotation revokes), current role, and live agency membership. Both
// `getSession()` and `getSessionFromRequest()` refuse a stale cookie, so
// `requireSession()`/`requireRole()`/`requireRoleForClient()` and every
// direct caller inherit revocation without opting in.

/**
 * Load the CURRENT authoritative record for the session's subject.
 *
 * Sandbox sessions carry a presentational persona; their authority anchors
 * to the live account recorded in the signed `sandbox.returnUserId`, read
 * from the live realm (mirrors `requireCurrentAccessActor`). The public
 * showcase visitor only exists inside its fixed fixture realm, so it is
 * validated there. Everything else — real sign-ins, Dev Mode personas,
 * previews, Showcase Mode — resolves in the session's own realm, where its
 * user record lives.
 */
async function currentUserForSession(session: SessionPayload): Promise<ServerUser | null> {
  if (session.publicShowcase) {
    if (!session.sandbox?.realmId) {
      // Legacy showcase cookies predate the fixture realm; their subject
      // lives in the live blob. Existence + rotation still apply.
      await ensureHydrated();
      return getUserById(session.userId);
    }
    let realmId: string;
    try {
      realmId = normaliseDataRealmId(session.sandbox.realmId);
    } catch {
      return null; // a malformed realm id is a refusal, not a crash
    }
    return runInDataRealm(realmId, async () => {
      await ensureHydrated({ preserveExplicitRealm: true });
      return getUserById(session.sandbox?.returnUserId ?? session.userId);
    });
  }
  if (session.sandbox) {
    return runInDataRealm(LIVE_DATA_REALM_ID, async () => {
      await ensureHydrated({ fresh: true, preserveExplicitRealm: true });
      return getUserById(session.sandbox?.returnUserId ?? session.userId);
    });
  }
  await ensureHydrated();
  return getUserById(session.userId);
}

function liveMemberships(user: ServerUser): string[] {
  return user.agencyIds.length > 0 ? user.agencyIds : user.agencyId ? [user.agencyId] : [];
}

/**
 * The central prerequisite for every authenticated request: returns the
 * current authoritative user when the cookie is still trustworthy, null when
 * it must be refused. Exported so routes that need the live record can reuse
 * the already-enforced resolution instead of re-implementing it.
 */
export async function resolveFreshSessionUser(session: SessionPayload): Promise<ServerUser | null> {
  const user = await currentUserForSession(session);
  if (!user) return null;
  // R021 rotation: password change, role/scope change and explicit rotation
  // all bump the record's rev past the cookie's.
  if (!isSessionFresh(session, user)) return null;
  // The public tour visitor is an anonymous fixture identity; existence +
  // rotation is the whole contract (the proxy keeps the session read-only).
  if (session.publicShowcase) return user;
  if (session.sandbox) {
    // Sandbox persona/dataset stay presentational; the live anchor must
    // still be a member of the workspace it will return to.
    return liveMemberships(user).includes(session.sandbox.returnAgencyId) ? user : null;
  }
  // Role decisions must use the CURRENT role. Rotation already bumps on role
  // change; this is the belt-and-braces refusal for any writer that didn't.
  if (user.role !== session.role) return null;
  // Live membership. Dev Mode / Showcase Mode / preview sessions are fenced
  // demo tenants deliberately outside the record's real membership; their
  // mint routes are themselves founder/dev-gated.
  if (!session.isDemo && !liveMemberships(user).includes(getActiveAgencyId(session))) {
    return null;
  }
  return user;
}

async function sessionFromToken(token: string | undefined): Promise<SessionPayload | null> {
  const session = verifyToken(token);
  if (!session) return null;
  if (!(await resolveFreshSessionUser(session))) return null;
  return session;
}

// Perf (Ed's audit): one navigation renders layout + page + nested server
// components, and every one of them asks "who is this?" — previously each
// caller re-ran the whole resolution (cookie verify → the authoritative-user
// lookup inside `resolveFreshSessionUser` → Supabase `auth.getUser()`),
// repeating network and state work within a single request. React `cache()`
// dedupes the no-arg call within one RSC render, so a request resolves the
// session ONCE and every caller (`requireSession`/`requireRole`/
// `getCurrentUser`/pages) shares that result — the freshness/revocation check
// still runs, exactly once per request, never skipped. The cookie jar is
// fixed for the request's lifetime, so nothing the memo captures can change
// underneath it; the NEXT request gets a fresh cache scope, so rotation and
// revocation land on the very next navigation exactly as before. Outside an
// RSC render `cache()` is a pass-through, so API-route and test callers keep
// per-call behaviour. `getSessionFromRequest()` below is deliberately NOT
// wrapped: it takes an explicit request (proxy/middleware/API surfaces with
// no RSC cache scope), and its contract is per-call resolution of whatever
// request it is handed — memoisation belongs only to the ambient-cookies
// render path here.
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const c = await cookies();
  const session = await sessionFromToken(c.get(COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.isDemo || session.publicShowcase) return session;
  // Embedded customer portals can still use AquaCRM's signed one-time
  // access links. Their scoped session remains independently verified by
  // the HMAC token and nonce store, while staff/client password accounts
  // use Supabase as the primary identity provider.
  if (session.role === "end-customer") return session;
  if (!getSupabasePublicConfig()) return session;
  const supabaseUser = await getAuthenticatedSupabaseUser();
  if (!supabaseUser || supabaseUser.email?.toLowerCase() !== session.email.toLowerCase()) {
    return null;
  }
  return session;
});

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  return sessionFromToken(req.cookies.get(COOKIE_NAME)?.value);
}

export async function getCurrentUser(): Promise<ServerUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = getUserById(session.userId);
  if (!user) return null;
  // R021: session rotation freshness check. When the user record's rev is
  // ahead of the cookie's, the cookie is stale (role/password changed) →
  // refuse it. Defaults to 0 on either side keep legacy tokens valid.
  if (!isSessionFresh(session, user)) return null;
  return user;
}

// R021: helper for routes that already loaded the user — keeps `verifyToken`
// (sync, hot-path) cheap while still enforcing rotation at the lookup layer.
export function isSessionFresh(session: SessionPayload, user: ServerUser): boolean {
  const stampedSession = session.sessionRev ?? 0;
  const currentSession = user.sessionRev ?? 0;
  // Access policy is deliberately resolved from authoritative grants on every
  // capability check. `accessRev` is a cache/invalidation epoch, not a reason
  // to log somebody out: approvals must become usable in the existing session
  // while revocations disappear from that same session immediately.
  return stampedSession >= currentSession;
}

// ─── Role gate ────────────────────────────────────────────────────────────
//
// Throws a Response (401 or 403) when the session is missing or doesn't
// match the allowed role(s). Used in API routes:
//
//   const session = await requireRole("agency-owner");
//   const session = await requireRole(["agency-owner", "agency-manager"]);
//
// Page server components catch this with try/catch and redirect to /login.

export class AuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError(401, "unauthorized");
  return session;
}

export async function requireRole(
  allowed: Role | Role[],
): Promise<SessionPayload> {
  const session = await requireSession();
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(session.role)) {
    throw new AuthError(403, "forbidden");
  }
  return session;
}

// Combine role + tenant-scope check. Useful inside per-client routes
// where the URL supplies a clientId that must match the session's
// clientId for client-* roles.
export async function requireRoleForClient(
  allowed: Role | Role[],
  clientId: string,
): Promise<SessionPayload> {
  const session = await requireRole(allowed);
  // Agency roles always pass — they can read any client in their agency.
  if (session.role.startsWith("agency-")) return session;
  // Client/freelancer/end-customer: must be scoped to this client.
  if (session.clientId !== clientId) throw new AuthError(403, "forbidden");
  return session;
}

// Translate AuthError into a JSON Response — call from API routes.
export function authErrorResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: err.status,
      headers: { "content-type": "application/json" },
    });
  }
  throw err;
}

// ─── Cookie helpers (for /api/auth/login + logout) ────────────────────────

export function sessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    },
  };
}

// ─── R025 multi-agency helpers ────────────────────────────────────────────

// Membership list for the session. Falls back to `[agencyId]` when the
// session predates R025 (legacy cookies stay valid until rotation).
export function getSessionAgencyIds(session: SessionPayload): string[] {
  if (session.agencyIds && session.agencyIds.length > 0) return session.agencyIds;
  if (session.agencyId) return [session.agencyId];
  return [];
}

// The agency this session is currently viewing. Defaults to legacy
// `agencyId` for back-compat; the Topbar agency switcher (R026) will
// flip `activeAgencyId` between membership entries.
export function getActiveAgencyId(session: SessionPayload): string {
  return session.activeAgencyId ?? session.agencyId;
}

// Convenience for "all my agencies" UI surfaces. Today returns
// membership; reserved for the R026 switcher to expand once
// activeAgencyId can differ from agencyIds[0].
export function getActiveAgencyIds(session: SessionPayload): string[] {
  return getSessionAgencyIds(session);
}

// Tenant scope check. Master users (multi-agency) pass for ANY of
// their agencies; legacy single-agency users only pass for the one
// they own. Throws AuthError(403) when the requested agencyId is
// outside the session's membership.
export function assertTenantScope(session: SessionPayload, agencyId: string): void {
  const ids = getSessionAgencyIds(session);
  if (!ids.includes(agencyId)) {
    throw new AuthError(403, "tenant_scope_mismatch");
  }
}

export function clearSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    },
  };
}
