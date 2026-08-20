import { NextResponse, type NextRequest } from "next/server";

import {
  authErrorResponse,
  getActiveAgencyId,
  getSessionAgencyIds,
  getSessionFromRequest,
  isSessionFresh,
  issueSession,
  sessionCookie,
} from "@/lib/server/auth/auth";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { addUserAgencyMembership } from "@/lib/server/seeds/aquaOasisSeed";
import { logActivity } from "@/server/activity";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { ensureHydrated } from "@/server/storage";
import { getTradingCompany, markTradingCompanyPortalCreated } from "@/server/tradingCompanies";
import { previewCompanyPortal } from "@/server/companyPortal/companyPortal";
import { getUserById } from "@/server/users";
import type { ServerUser, SessionPayload } from "@/server/types";

// Give a trading company a PORTAL OF ITS OWN — THE SECURITY SHELL.
//
// ⚠ THE MODEL, settled by the founder 2026-08-20: AGENCY is a HOLDING GROUP,
// TRADING COMPANIES are the businesses under it, and each company has its own
// CLIENTS — three permanent tiers. A company does NOT become an agency and
// does not leave the group. It stays a company and gains a workspace; the
// tenant created here backs that workspace and carries `holdingAgencyId` +
// `companyId` so the holding group can still list what it holds.
//
//   GET  → the read-only preview: what a promotion would move, re-key, seed,
//          leave behind, and what a human still has to decide.
//   POST → create the tenant, grant the promoter membership of it, re-mint the
//          promoter's cookie, tombstone the brand. MOVES NO RECORDS.
//
// Phase 3 of `docs/development/plans/promote-trading-company.md`. Creating the
// tenant and moving the data are deliberately separate: creating an agency is
// cheap, safe and reversible, while relocating live records across a tenant
// boundary is the genuinely dangerous half. This endpoint does only the first,
// so the map and the preview can be proven before anything moves.
//
// ─── SECURITY ─────────────────────────────────────────────────────────────
//
// The MECHANISM here (bootstrap → grant membership → re-read the user →
// re-mint → set cookie) is taken from the archived `agency-add` endpoint
// (`src/archive/multi-agency/api/agency-add.ts:96-113`). NONE of its guards
// are: it had no origin check, no freshness check, a `founder_only` label over
// an owner-OR-MANAGER gate, and it forwarded `isDemo` while silently dropping
// the `devReturn*`/`previewReturn*` markers — stranding a borrowed identity in
// a tenant with no way home. The guards below are imported from the company
// switcher (`src/app/api/auth/switch-agency/route.ts`, shipped 2026-08-20 and
// verified with no escalation possible) rather than re-implemented here.
//
//   • OWNER ONLY, and on BOTH the cookie and the live record. A manager must
//     not be able to spin a business out of the agency. `agency-add` said
//     "founder_only" and accepted a manager; this does not.
//   • The agency operated on is the session's ACTIVE agency, never a body
//     field, and it must survive `session ∩ live record` — the switcher's rule.
//   • REFUSALS ARE INDISTINGUISHABLE. Wrong role, not your agency, no such
//     company, archived company: one 403 `forbidden`, so a refusal never
//     reveals whether a company id is real.
//   • A borrowed identity cannot promote (demo / public showcase / Dev Mode /
//     freelancer preview / showcase return). Those sessions are fenced to one
//     tenant and carry return-markers a re-mint would drop.
//   • Same-origin only on POST, and `cache-control: no-store` on everything.
//
// ─── THE CARVE-OUT, STATED NARROWLY ───────────────────────────────────────
//
// The switcher's rule is that a re-mint may NARROW a session's `agencyIds` and
// never widen it. This endpoint is the single, deliberate exception, and it is
// exactly this wide:
//
//   *Only an endpoint that grants the membership in the same request may mint
//   a cookie carrying it, and it may add only the one id it just granted.*
//
// So the new cookie is `(session ∩ live record) ∪ {the agency just created}`
// and nothing else — the intersection first, so a membership revoked since
// sign-in is still dropped. A promotion must never become a way to widen a
// session: the re-minted cookie is refused by `/api/auth/switch-agency` for
// every agency it did not already carry, and a test pins that.
//
// Idempotency: `TradingCompany.portalAgencyId`. A second POST creates
// nothing, grants nothing and mints nothing — it returns the agency that
// already exists. Minting on the repeat call would be a widening with no
// matching grant, which is the one thing the carve-out does not cover.

interface PromoteRouteContext {
  params: Promise<{ companyId: string }>;
}

/** One refusal for every "you may not do this" case. Same status, same body. */
function refuse() {
  return NextResponse.json(
    { ok: false, error: "forbidden" },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "no-store");
  return response;
}

// Same-origin check, identical to the switcher's. A missing `origin` header is
// allowed (same-origin GETs and non-browser callers do not send one); a present
// one must match the request's own origin.
function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const allowed = new Set([requestUrl.origin]);
  if (host) allowed.add(`${protocol}://${host}`);
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

// A session standing in for somebody else, or fenced to a sandbox tenant.
// Promoting from one of these is never right — the same five markers the
// switcher refuses.
function isBorrowedIdentity(session: SessionPayload): boolean {
  return Boolean(
    session.isDemo ||
    session.publicShowcase ||
    session.devReturnAgencyId ||
    session.previewReturnAgencyId ||
    session.showcaseReturnAgencyId,
  );
}

function liveAgencyIds(user: { agencyIds?: string[]; agencyId: string }): string[] {
  return user.agencyIds && user.agencyIds.length > 0 ? user.agencyIds : [user.agencyId];
}

/** Agencies present in BOTH the signed cookie and the live user record. */
function allowedAgencyIds(session: SessionPayload, user: ServerUser): string[] {
  const live = new Set(liveAgencyIds(user));
  return getSessionAgencyIds(session).filter(id => live.has(id));
}

interface Authorised {
  session: SessionPayload;
  user: ServerUser;
  agencyId: string;
  allowed: string[];
}

/**
 * Everything past this returns an authorised owner acting inside their own
 * active agency, or the response to send instead. Nothing from the request
 * body or the URL has been trusted at this point.
 */
async function authorise(
  request: NextRequest,
  { requireOrigin }: { requireOrigin: boolean },
): Promise<Authorised | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }
  if (requireOrigin && !hasValidOrigin(request)) {
    return noStore(NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 }));
  }
  if (isBorrowedIdentity(session)) {
    return noStore(
      NextResponse.json(
        { ok: false, error: "Leave the preview before promoting a company." },
        { status: 409 },
      ),
    );
  }

  // The live record is authoritative for identity, role AND membership.
  const user = getUserById(session.userId);
  if (!user || !isSessionFresh(session, user)) {
    return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
  }

  // Owner on both sides. A manager may run the agency; only an owner may spin
  // a business out of it.
  if (session.role !== "agency-owner" || user.role !== "agency-owner") return refuse();

  const allowed = allowedAgencyIds(session, user);
  const agencyId = getActiveAgencyId(session);
  if (!agencyId || !allowed.includes(agencyId)) return refuse();

  return { session, user, agencyId, allowed };
}

/**
 * In-flight promotions, so two POSTs racing on one company cannot both get
 * past the tombstone check and bootstrap two agencies. Process-local: a
 * multi-instance deploy needs a claim in storage instead, which belongs with
 * the phase that actually moves records.
 */
const promotionsInFlight = new Set<string>();

export async function GET(request: NextRequest, context: PromoteRouteContext) {
  try {
    await ensureHydrated();
    const auth = await authorise(request, { requireOrigin: false });
    if (auth instanceof NextResponse) return auth;

    const { companyId } = await context.params;
    if (!companyId) return refuse();

    // `previewCompanyPortal` returns null for "not in this agency" — the
    // same answer as "does not exist", which is why it becomes a plain refuse.
    const preview = previewCompanyPortal(auth.agencyId, companyId);
    if (!preview) return refuse();

    return noStore(NextResponse.json({ ok: true, preview }));
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: PromoteRouteContext) {
  try {
    await ensureHydrated();
    const auth = await authorise(request, { requireOrigin: true });
    if (auth instanceof NextResponse) return auth;
    const { user, agencyId, allowed } = auth;

    const { companyId } = await context.params;
    if (!companyId) return refuse();

    const company = getTradingCompany(agencyId, companyId);
    // Not yours, or not real — the same refusal either way.
    if (!company) return refuse();
    if (company.status === "archived") return refuse();

    // Already promoted: create nothing, grant nothing, mint nothing.
    if (company.portalAgencyId) {
      return noStore(
        NextResponse.json({
          ok: true,
          created: false,
          alreadyHasPortal: true,
          agencyId: company.portalAgencyId,
          portalCreatedAt: company.portalCreatedAt,
          movedRecords: 0,
        }),
      );
    }

    const claim = `${agencyId}:${companyId}`;
    if (promotionsInFlight.has(claim)) {
      return noStore(
        NextResponse.json({ ok: false, error: "promotion_in_progress" }, { status: 409 }),
      );
    }
    promotionsInFlight.add(claim);

    let newAgencyId: string;
    try {
      // The tenant. `createAgency` derives the id from the slug and
      // de-duplicates with -2/-3, so the RETURNED id is the only safe key to
      // write anywhere — never the slug we asked for.
      const { agency } = await bootstrapAgency(
        { name: company.name, slug: company.slug, ownerEmail: user.email, brand: company.brand },
        user.id,
        // THE THIRD TIER. Without this stamp the new tenant is an ordinary
        // sibling of the holding group and the group cannot list the companies
        // it holds — which collapses the settled three-tier model back to two.
        { holdingAgencyId: agencyId, companyId },
      );
      newAgencyId = agency.id;

      // Grant, then tombstone. The grant is what entitles the re-mint below;
      // the tombstone is what makes a second POST a no-op and later phases
      // able to find the agency this one created.
      addUserAgencyMembership(user.id, agency.id);
      markTradingCompanyPortalCreated(agencyId, companyId, agency.id, user.id);

      logActivity({
        agencyId,
        actorUserId: user.id,
        actorEmail: user.email,
        category: "settings",
        action: "company.portal_created",
        message: `${user.email} gave trading company “${company.name}” a portal of its own. It stays in this group; no records moved.`,
        metadata: { companyId, portalAgencyId: agency.id, recordsMoved: 0 },
      });
    } finally {
      promotionsInFlight.delete(claim);
    }

    // Re-read: `addUserAgencyMembership` bumps `sessionRev`, so the cookie we
    // are replacing is now stale by design. Identity, role and rev all come
    // from the live record — never from the request, never from the old cookie.
    const refreshed = getUserById(user.id) ?? user;

    // THE CARVE-OUT, and its whole width: the intersection first (so a
    // membership revoked since sign-in is still dropped), then exactly the one
    // id just granted. No demo flag, no return markers, nothing else.
    const nextAgencyIds = allowed.includes(newAgencyId) ? allowed : [...allowed, newAgencyId];

    const token = issueSession({
      userId: refreshed.id,
      email: refreshed.email,
      role: refreshed.role,
      agencyId: newAgencyId,
      agencyIds: nextAgencyIds,
      activeAgencyId: newAgencyId,
      clientId: refreshed.clientId,
      sessionRev: refreshed.sessionRev ?? 0,
    });
    const cookie = sessionCookie(token);

    const redirect = resolvePostLoginPath(null, refreshed);
    const response = noStore(
      NextResponse.json({
        ok: true,
        created: true,
        alreadyHasPortal: false,
        agencyId: newAgencyId,
        redirect,
        // Said out loud so no caller can mistake this phase for a migration.
        movedRecords: 0,
        holdingAgencyId: agencyId,
        companyId,
        note: "The portal exists and you are a member of it. The company stays in this holding group and keeps everything it owns — no records have moved. Importing them is a separate, per-record-type step.",
      }),
    );
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
