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

import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Role, ServerUser, SessionPayload } from "@/server/types";
import { getUserById } from "@/server/users";

const COOKIE_NAME = "lk_session_v1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;       // 30 days

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_MAX_AGE = COOKIE_MAX_AGE;

function getSecret(): string {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[auth] PORTAL_SESSION_SECRET is unset — sessions are signing with the dev fallback. Production deploys MUST set this.",
    );
  }
  return "dev-secret-do-not-use-in-prod";
}

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
  // Mark the session as a sandboxed demo. The chrome layer reads this to
  // render the demo banner + POV toggle; the seed/reset endpoints use it
  // to scope writes to the demo agency only.
  isDemo?: boolean;
  // R021: session rotation revision. Pass the user's current `sessionRev`
  // here so the cookie gets stamped — later rotations bump the user record's
  // value and stale tokens fail freshness checks at the lookup layer.
  sessionRev?: number;
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
    isDemo: input.isDemo === true ? true : undefined,
    sessionRev: input.sessionRev ?? 0,
    iat: now,
    exp: now + COOKIE_MAX_AGE,
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifyToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!b64 || !sig) return null;
  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  // Constant-time compare. Buffers must be equal-length; HMAC outputs
  // are always the same width so equality of `expected.length === sig.length`
  // is a safe pre-check.
  const expectedBuf = Buffer.from(expected, "utf8");
  const sigBuf = Buffer.from(sig, "utf8");
  if (expectedBuf.length !== sigBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Read helpers ─────────────────────────────────────────────────────────

export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  return verifyToken(c.get(COOKIE_NAME)?.value);
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  return verifyToken(req.cookies.get(COOKIE_NAME)?.value);
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
  const stamped = session.sessionRev ?? 0;
  const current = user.sessionRev ?? 0;
  return stamped >= current;
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
