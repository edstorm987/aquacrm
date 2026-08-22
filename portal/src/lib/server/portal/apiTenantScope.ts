// WHO DECIDES THE TENANT ON A PLUGIN API CALL?
//
// The plugin API dispatcher (`/api/portal/[module]/[...rest]`) has always
// accepted a `?agencyId=` / `?clientId=` scope hint. R032 gave it a second job:
// PUBLIC routes — a Stripe webhook, Postmark's delivery callback, the funnel's
// capture handoff — land with no session at all, so the only place their tenant
// can come from is the URL. To know whether a route is public the dispatcher has
// to resolve it first, so it "peeks" using the caller's own agencyId.
//
// That peek then became authoritative for EVERY route, not just the public
// ones:
//
//     const peeked = queryAgencyId ? resolvePluginApiRoute(…, { agencyId: queryAgencyId }) : null;
//     …
//     const resolved = peeked ?? resolvePluginApiRoute(…, { agencyId: session.agencyId });
//
// `peeked` is non-null whenever `?agencyId=` names an agency with the plugin
// installed, so the `??` fallback — the branch that used the session — never
// ran. An agency-owner in agency A POSTing
// `/api/portal/agency-hr/staff?agencyId=B` was resolved against B's install,
// handed a `PluginCtx` carrying B's `agencyId` and B's plugin storage, and got
// back `201 { agencyId: "B" }`. Reading it back with `?agencyId=B` returned it;
// their own agency listed empty. Cross-tenant write, then cross-tenant read,
// from the browser, with no role gate involved — the dispatcher was gated by
// ROLE, not by TENANT.
//
// ─── The rule ─────────────────────────────────────────────────────────────
//
//   A query-supplied agencyId is authoritative ONLY when the resolved route is
//   genuinely public. The instant a session exists, the SESSION decides the
//   tenant, and a query parameter that names someone else is a REFUSAL — never
//   a silent redirect of scope.
//
// Two deliberate seams in that rule, both pinned by
// `scripts/smoke-plugin-api-tenancy.test.ts`:
//
//   1. R025 multi-agency. A master user's session carries `agencyIds[]`. A
//      query naming one of THEIR OWN agencies is honoured — that is the Topbar
//      agency switcher, not an escalation. Anything outside the membership is
//      refused.
//   2. Public routes are not re-gated by a session that happens to be present.
//      A public route answers anonymous callers by definition: refusing the
//      same call because the caller also holds an unrelated cookie protects
//      nothing (log out, call again) while breaking the real case — a signed-in
//      `lead`, whose session lives in the `agency_lead_global` sentinel tenant,
//      submitting a funnel form that belongs to a real agency.
//
// `clientId` gets the same treatment one level down. It never selects the
// tenant (the agency does), but it selects the install and lands in
// `ctx.clientId`, so a caller must not be able to name a client that is not
// theirs: a client-side role is pinned to its own `session.clientId`, and an
// agency-side role may only name a client its own agency owns.
//
// This lives in its own module, as a pure function over a session shape, so the
// decision can be driven directly in tests and so the negative control (the
// pre-fix `peeked ?? …` rule) can be written out and shown to leak.

import type { Role, SessionPayload } from "@/server/types";

/** Just the parts of a session this decision reads. */
export interface TenantScopeSession {
  role: Role;
  agencyId: string;
  agencyIds?: string[];
  clientId?: string;
}

export interface ApiTenantScopeInput {
  /** `null` for an anonymous caller on a `public: true` route. */
  session: TenantScopeSession | null;
  /** `?agencyId=` or the `x-aqua-agency-id` header. */
  queryAgencyId?: string;
  /** `?clientId=`, the `x-aqua-client-id` header, or the portal referer. */
  queryClientId?: string;
  /** Did the route resolve as `public: true`? */
  isPublic: boolean;
  /**
   * Which agency owns this client, or `null` when no such client is known.
   * Injected so this stays a pure function; the dispatcher passes a lookup
   * backed by the tenants store.
   */
  clientOwner?: (clientId: string) => string | null;
}

export type ApiTenantScope =
  | { ok: true; agencyId: string; clientId?: string }
  | { ok: false; status: 403; error: "tenant_scope_mismatch" | "forbidden" };

const REFUSE_AGENCY = { ok: false, status: 403, error: "tenant_scope_mismatch" } as const;
const REFUSE_CLIENT = { ok: false, status: 403, error: "forbidden" } as const;

/** Roles whose whole world is one client. */
function isClientSideRole(role: Role): boolean {
  return role.startsWith("client-") || role === "freelancer" || role === "end-customer";
}

/** The agencies this session may act in. Falls back to the legacy single id. */
function membership(session: TenantScopeSession): string[] {
  if (session.agencyIds && session.agencyIds.length > 0) return session.agencyIds;
  return session.agencyId ? [session.agencyId] : [];
}

export function resolveApiTenantScope(input: ApiTenantScopeInput): ApiTenantScope {
  const { session, queryAgencyId, queryClientId, isPublic, clientOwner } = input;

  // ── No session ──────────────────────────────────────────────────────────
  //
  // Only reachable on a public route (the dispatcher requires a session for
  // everything else, and refuses before calling this). The URL is the only
  // thing that can name the tenant, which is exactly why the peek exists.
  if (!session) {
    if (!isPublic) return REFUSE_AGENCY;
    return { ok: true, agencyId: queryAgencyId ?? "", clientId: queryClientId };
  }

  // ── Public route, session present ───────────────────────────────────────
  //
  // Left query-authoritative on purpose — see seam 2 in the header comment.
  if (isPublic) {
    return { ok: true, agencyId: queryAgencyId ?? session.agencyId, clientId: queryClientId };
  }

  // ── The tenant ──────────────────────────────────────────────────────────
  const mine = membership(session);
  if (queryAgencyId && !mine.includes(queryAgencyId)) return REFUSE_AGENCY;
  const agencyId = queryAgencyId && mine.includes(queryAgencyId) ? queryAgencyId : session.agencyId;

  // ── The client ──────────────────────────────────────────────────────────
  if (isClientSideRole(session.role)) {
    // Pinned to their own client. `session.clientId` missing is a refusal, not
    // a free pass: the pre-fix guard read `queryClientId && session.clientId &&
    // …`, so a client-side session with no clientId could name anybody's.
    if (queryClientId && queryClientId !== session.clientId) return REFUSE_CLIENT;
    // The fallback is deliberately the PRE-EXISTING one: only `client-*` roles
    // fall back to their session's clientId when the query omits it. A
    // freelancer or an end-customer resolves the agency-scoped install exactly
    // as it did before. That asymmetry is odd, and it is not this brief's to
    // change: widening it would silently move which install (and therefore
    // which plugin storage) those two roles read. Refusal behaviour above is
    // identical for all three.
    const fallback = session.role.startsWith("client-") ? session.clientId : undefined;
    return { ok: true, agencyId, clientId: queryClientId ?? fallback };
  }

  // Agency-side: may name any client OF THIS AGENCY. A client that resolves to
  // a different agency is a refusal. A client id that resolves to nothing is
  // allowed through — it selects no install and filters to nothing, and
  // refusing it would break the many callers that pass a not-yet-created or
  // synthetic id.
  if (queryClientId && clientOwner) {
    const owner = clientOwner(queryClientId);
    if (owner && owner !== agencyId) return REFUSE_CLIENT;
  }
  return { ok: true, agencyId, clientId: queryClientId };
}

/** Narrow a full `SessionPayload` to the shape above. */
export function tenantScopeSession(session: SessionPayload): TenantScopeSession {
  return {
    role: session.role,
    agencyId: session.agencyId,
    agencyIds: session.agencyIds,
    clientId: session.clientId,
  };
}
